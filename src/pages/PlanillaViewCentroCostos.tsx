import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, PaintBucket, Plus, FileText, X, Edit2, Landmark } from 'lucide-react';
import DataGrid, { textEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
import 'react-data-grid/lib/styles.css';

// --- UTILIDADES ---
// La estructura base para el Centro de Costos
const crearFilaVacia = (id: number) => ({ 
  id, fecha: '', concepto: '', categoria: '', responsable: '', monto: '0', format: {} 
});

const parseCurrency = (val: any) => {
  if (!val) return 0;
  const num = parseInt(String(val).replace(/[^0-9-]/g, ''));
  return isNaN(num) ? 0 : num;
};

const formatMoney = (val: any) => {
  const num = parseCurrency(val);
  return num === 0 ? '$ 0' : `$ ${num.toLocaleString('es-CL')}`;
};

const parseExcelDate = (val: any) => {
  if (!val) return '';
  let str = String(val).trim();
  
  if (!isNaN(Number(str)) && Number(str) > 20000) {
    const d = new Date(Math.round((Number(str) - 25569) * 86400 * 1000));
    return `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
  }
  
  if (str.includes('/') || str.includes('-')) {
    const parts = str.split(/[\/-]/);
    if (parts.length === 3) {
      let p1 = parseInt(parts[0], 10), p2 = parseInt(parts[1], 10), p3 = parseInt(parts[2], 10);
      if (p3 < 100) p3 += 2000;
      let day, month;
      if (p1 <= 12 && p2 > 12) { month = p1; day = p2; } 
      else if (p1 > 12 && p2 <= 12) { day = p1; month = p2; } 
      else { month = p1; day = p2; }
      return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${p3}`;
    }
  }
  return str;
};

const obtenerColorUsuario = (nombre: string) => {
  const p = [{ bg: 'bg-blue-500', border: 'ring-blue-500' }, { bg: 'bg-red-500', border: 'ring-red-500' }, { bg: 'bg-green-500', border: 'ring-green-500' }, { bg: 'bg-purple-500', border: 'ring-purple-500' }];
  let h = 0; for(let i=0;i<nombre.length;i++) h+=nombre.charCodeAt(i); return p[h%p.length];
};

export default function PlanillaViewCentroCostos() {
  const { id } = useParams();
  const userName = sessionStorage.getItem('userName') || 'Invitado';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hojas, setHojas] = useState<any[]>([{ id: 'hoja-1', nombre: 'Mes 1', rows: [crearFilaVacia(1)] }]);
  const [hojaActivaId, setHojaActivaId] = useState<string>('hoja-1');
  const [activeUsers, setActiveUsers] = useState<any>({});
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{rowId: number, columnKey: string} | null>(null);

  const hojaActiva = hojas.find(h => h.id === hojaActivaId) || hojas[0];

  // --- CÁLCULO DEL CENTRO DE COSTOS ---
  const sumaTotalCostos = useMemo(() => {
    return (hojaActiva.rows || []).reduce((sum: number, r: any) => sum + parseCurrency(r.monto), 0);
  }, [hojaActiva.rows]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'planillas', id), (docSnap) => {
      if (docSnap.exists() && docSnap.data().hojas) setHojas(docSnap.data().hojas);
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const presenceRef = ref(rtdb, `presence/${id}/${userName}`);
    set(presenceRef, { name: userName, editing: null, activeSheet: hojaActivaId });
    onDisconnect(presenceRef).remove();
    onValue(ref(rtdb, `presence/${id}`), (snap) => setActiveUsers(snap.val() || {}));
  }, [id, userName, hojaActivaId]);

  const guardarEnNube = async (nuevasHojas: any[]) => {
    if (!id) return;
    await setDoc(doc(db, 'planillas', id), { hojas: nuevasHojas }, { merge: true });
  };

  const procesarCambiosMain = (nuevasFilas: any[]) => {
    const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: nuevasFilas } : h);
    setHojas(nh); guardarEnNube(nh);
  };

  const agregarFila = () => {
    let nh = [...hojas];
    const idx = nh.findIndex(h => h.id === hojaActivaId);
    const maxId = nh[idx].rows.length > 0 ? Math.max(...nh[idx].rows.map((r:any) => r.id)) : 0;
    nh[idx].rows.push(crearFilaVacia(maxId + 1));
    setHojas(nh); guardarEnNube(nh);
  };

  const agregarHoja = () => {
    const nuevoNombre = prompt('Nombre de la nueva hoja:'); if (!nuevoNombre) return;
    const nuevaHojaId = `hoja-${Date.now()}`;
    const nuevasHojas = [...hojas, { id: nuevaHojaId, nombre: nuevoNombre, rows: [crearFilaVacia(1)] }];
    setHojas(nuevasHojas); setHojaActivaId(nuevaHojaId); guardarEnNube(nuevasHojas);
  };

  const renombrarHoja = (hojaId: string, nombreActual: string) => {
    const nuevoNombre = prompt('Renombrar hoja a:', nombreActual); if (!nuevoNombre || nuevoNombre === nombreActual) return;
    const nuevasHojas = hojas.map(h => h.id === hojaId ? { ...h, nombre: nuevoNombre } : h);
    setHojas(nuevasHojas); guardarEnNube(nuevasHojas);
  };

  const eliminarHoja = (hojaId: string) => {
    if (hojas.length <= 1) return alert("No puedes eliminar la única hoja que queda.");
    if (window.confirm("¿Estás seguro de que deseas ELIMINAR esta hoja y TODOS sus datos?")) {
      const nuevasHojas = hojas.filter(h => h.id !== hojaId);
      setHojas(nuevasHojas); setHojaActivaId(nuevasHojas[0].id); guardarEnNube(nuevasHojas);
    }
  };

  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const modoReemplazo = window.confirm("¿Deseas REEMPLAZAR los datos actuales con los del Excel?");
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target?.result, { type: 'array' });
      let hojasExtraidas: any[] = [];
      let idBase = 1;

      workbook.SheetNames.forEach((sheetName, sheetIndex) => {
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
        let hojaObj = { id: `hoja-${Date.now()}-${sheetIndex}`, nombre: sheetName, rows: [] as any[] };
        
        let estado = 'BUSCANDO_TITULOS'; 
        let mainHeaders: string[] = [];
        let idxFecha = -1, idxConcepto = -1, idxCategoria = -1, idxResponsable = -1, idxMonto = -1;

        for (let i = 0; i < rawData.length; i++) {
          const rowArr = rawData[i] as string[];
          const rowStr = rowArr.join(' ').toUpperCase();
          if (!rowStr.trim()) continue;

          if (estado === 'BUSCANDO_TITULOS') {
            if (rowStr.includes('FECHA') && (rowStr.includes('CONCEPTO') || rowStr.includes('DETALLE') || rowStr.includes('MONTO'))) {
              estado = 'EXTRAYENDO_DATOS';
              mainHeaders = rowArr.map(h => String(h).toUpperCase().trim());
              
              idxFecha = mainHeaders.findIndex(h => h.includes('FECHA'));
              idxConcepto = mainHeaders.findIndex(h => h.includes('CONCEPTO') || h.includes('DETALLE') || h.includes('DESCRIPCION'));
              idxCategoria = mainHeaders.findIndex(h => h.includes('CATEGORIA') || h.includes('TIPO'));
              idxResponsable = mainHeaders.findIndex(h => h.includes('RESPONSABLE') || h.includes('ENCARGADO'));
              idxMonto = mainHeaders.findIndex(h => h.includes('MONTO') || h.includes('TOTAL') || h.includes('VALOR'));
              continue;
            }
          }

          if (estado === 'EXTRAYENDO_DATOS') {
            if (rowStr.includes('TOTAL GENERAL') || rowStr.includes('RESUMEN')) {
              estado = 'BUSCANDO_TITULOS'; 
              continue;
            }

            const valFecha = parseExcelDate(rowArr[idxFecha]);
            const valConcepto = idxConcepto !== -1 ? rowArr[idxConcepto] : '';
            const valCategoria = idxCategoria !== -1 ? rowArr[idxCategoria] : '';
            const valResponsable = idxResponsable !== -1 ? rowArr[idxResponsable] : '';
            const valMonto = idxMonto !== -1 ? rowArr[idxMonto] : '0';

            if (!valFecha && !valConcepto && parseCurrency(valMonto) === 0) continue;

            hojaObj.rows.push({
              id: idBase++, fecha: valFecha, concepto: valConcepto, categoria: valCategoria,
              responsable: valResponsable, monto: valMonto, format: {}
            });
          }
        }

        if (hojaObj.rows.length === 0) hojaObj.rows.push(crearFilaVacia(idBase++));
        hojasExtraidas.push(hojaObj);
      });

      if (hojasExtraidas.length > 0) {
        const nh = modoReemplazo ? hojasExtraidas : [...hojas, ...hojasExtraidas];
        setHojas(nh); setHojaActivaId(nh[0].id); guardarEnNube(nh);
      } else { alert("No se detectó la estructura de Costos. Revisa tu Excel."); }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCellClick = (args: any) => {
    setCeldaSeleccionada({ rowId: args.row.id, columnKey: args.column.key });
    const presenceRef = ref(rtdb, `presence/${id}/${userName}`);
    set(presenceRef, { name: userName, editing: { row: args.row.id, column: args.column.key }, activeSheet: hojaActivaId });
  };

  const pintarCelda = (colorClass: string) => {
    if (!celdaSeleccionada) return;
    const pintarEn = (filas: any[]) => filas.map((fila: any) => fila.id === celdaSeleccionada.rowId ? { ...fila, format: { ...fila.format, [celdaSeleccionada.columnKey]: colorClass } } : fila);
    const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: pintarEn(h.rows) } : h);
    setHojas(nh); guardarEnNube(nh);
  };

  const getCellClass = (row: any, columnKey: string) => {
    let classes = row.format?.[columnKey] || ''; 
    for (const key in activeUsers) {
      const user = activeUsers[key];
      if (user.activeSheet === hojaActivaId && user.editing && user.editing.row === row.id && user.editing.column === columnKey) {
        classes += ` ring-2 ring-inset z-10 relative ${obtenerColorUsuario(user.name).border}`;
      }
    }
    return classes;
  };

  const columnas = useMemo(() => [
    // AQUÍ SE GENERA AUTOMÁTICAMENTE EL CÓDIGO SV-1, SV-2...
    { key: 'id', name: 'CÓDIGO', width: 90, resizable: true, renderCell: (p: any) => <strong className="text-emerald-700">SV-{p.row.id}</strong> },
    { key: 'fecha', name: 'FECHA', renderEditCell: textEditor, width: 130, resizable: true, cellClass: (r: any) => getCellClass(r, 'fecha') },
    { key: 'concepto', name: 'CONCEPTO / DETALLE', renderEditCell: textEditor, width: 350, resizable: true, cellClass: (r: any) => getCellClass(r, 'concepto') },
    { key: 'categoria', name: 'CATEGORÍA (Sueldos, Compra, etc)', renderEditCell: textEditor, width: 250, resizable: true, cellClass: (r: any) => getCellClass(r, 'categoria') },
    { key: 'responsable', name: 'RESPONSABLE', renderEditCell: textEditor, width: 200, resizable: true, cellClass: (r: any) => getCellClass(r, 'responsable') },
    { key: 'monto', name: 'MONTO ASIGNADO', renderEditCell: textEditor, width: 180, resizable: true, renderCell: (p:any) => formatMoney(p.row.monto), cellClass: (r: any) => getCellClass(r, 'monto') }
  ], [hojaActivaId, activeUsers]);

  return (
    <div className="p-2 h-screen flex flex-col bg-gray-50 overflow-hidden relative">
      <style>{`.rdg { --rdg-border-color: #d1d5db; height: 100%; border: none; } .rdg-cell { border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 0 8px; } .rdg-header-cell { background-color: #f3f4f6; border-bottom: 2px solid #9ca3af; font-weight: bold; color: #374151; } `}</style>

      {/* --- TOOLBAR SUPERIOR --- */}
      <div className="flex items-center gap-2 mb-2 px-2 shrink-0 flex-wrap">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800 mr-2"><ArrowLeft size={24} /></Link>
        <h1 className="text-xl font-black uppercase text-emerald-800 mr-2 flex items-center gap-2"><Landmark size={22}/> {id?.replace(/-/g, ' ')}</h1>
        
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border shadow-sm ml-4">
          <PaintBucket size={18} className="text-gray-400 mx-2" />
          <button onClick={() => pintarCelda('bg-yellow-100 text-yellow-900')} className="w-6 h-6 rounded bg-yellow-100 border border-yellow-300" />
          <button onClick={() => pintarCelda('bg-emerald-100 text-emerald-900')} className="w-6 h-6 rounded bg-emerald-100 border border-emerald-300" />
          <button onClick={() => pintarCelda('bg-red-100 text-red-900')} className="w-6 h-6 rounded bg-red-100 border border-red-300" />
          <button onClick={() => pintarCelda('bg-blue-100 text-blue-900')} className="w-6 h-6 rounded bg-blue-100 border border-blue-300" />
          <button onClick={() => pintarCelda('')} className="w-6 h-6 rounded bg-white border text-xs text-gray-400">✖</button>
        </div>

        <button onClick={agregarFila} className="ml-2 flex items-center gap-1 text-white px-3 py-1.5 text-sm rounded-lg shadow transition-colors bg-emerald-600 hover:bg-emerald-700"><Plus size={16} /> Fila</button>

        <input type="file" ref={fileInputRef} onChange={importarExcel} accept=".xlsx, .xls, .csv" className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 bg-slate-800 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-slate-900"><Upload size={16} /> Importar Costos</button>

        <div className="flex -space-x-2 ml-auto pr-4">
          {Object.values(activeUsers).map((u: any) => (
            <div key={u.name} title={u.name} className={`inline-flex h-8 w-8 rounded-full ring-2 ring-white items-center justify-center text-xs font-bold text-white ${obtenerColorUsuario(u.name).bg}`}>{u.name.charAt(0).toUpperCase()}</div>
          ))}
        </div>
      </div>

      {/* --- TABLA PRINCIPAL --- */}
      <div className="flex-1 bg-white border border-gray-300 shadow-sm relative flex flex-col rounded-t-lg min-h-0 z-0 overflow-x-auto max-w-[100vw]">
        <DataGrid 
           columns={columnas} 
           rows={hojaActiva.rows} 
           onRowsChange={procesarCambiosMain} 
           onCellClick={handleCellClick} 
           className="h-full w-full min-w-[800px]" 
           style={{ minHeight: 0 }} 
        />
      </div>

      {/* --- BARRA INFERIOR DE RESUMEN --- */}
      <div className="bg-emerald-900 text-white px-6 py-3 flex gap-10 text-sm shrink-0 shadow-inner items-center">
        <span className="font-bold uppercase tracking-widest text-emerald-300">Resumen Centro de Costos:</span>
        <span className="ml-auto flex items-center gap-3">
          TOTAL COSTOS: 
          <strong className="text-white bg-emerald-800 px-4 py-1.5 rounded-lg text-lg border border-emerald-700 shadow-sm">
            {formatMoney(sumaTotalCostos)}
          </strong>
        </span>
      </div>

      {/* --- PESTAÑAS (TABS EXCEL) --- */}
      <div className="flex items-center gap-1 pt-1 shrink-0 overflow-x-auto bg-gray-50">
        {hojas.map((hoja) => (
          <div key={hoja.id} onClick={() => setHojaActivaId(hoja.id)} className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-b-lg border-x border-b border-t-0 shadow-sm cursor-pointer transition-colors ${hojaActivaId === hoja.id ? 'bg-white text-emerald-600 border-t-2 border-t-emerald-500' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
            <FileText size={16} /> <span onDoubleClick={() => renombrarHoja(hoja.id, hoja.nombre)}>{hoja.nombre}</span>
            {hojaActivaId === hoja.id && (
              <div className="flex items-center gap-1 ml-2">
                 <Edit2 size={14} className="hover:text-emerald-500 text-gray-400" onClick={(e) => { e.stopPropagation(); renombrarHoja(hoja.id, hoja.nombre); }} />
                 {hojas.length > 1 && (<X size={14} className="text-gray-400 hover:text-red-500" onClick={(e) => { e.stopPropagation(); eliminarHoja(hoja.id); }} />)}
              </div>
            )}
          </div>
        ))}
        <button onClick={agregarHoja} className="flex items-center justify-center w-8 h-8 ml-2 rounded text-gray-500 hover:bg-gray-300"><Plus size={18} /></button>
      </div>

    </div>
  );
}