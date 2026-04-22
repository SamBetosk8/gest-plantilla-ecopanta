import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, PaintBucket, Plus, FileSpreadsheet, X, Edit2 } from 'lucide-react';
import DataGrid, { textEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
import 'react-data-grid/lib/styles.css';

const crearFilaVacia = (id: number) => ({ id, format: {} });

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

export default function PlanillaViewFactura() {
  const { id } = useParams();
  const userName = localStorage.getItem('userName') || 'Invitado';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hojas, setHojas] = useState<any[]>([{ id: 'hoja-1', nombre: 'Mes 1', rows: [crearFilaVacia(1)] }]);
  const [hojaActivaId, setHojaActivaId] = useState<string>('hoja-1');
  const [activeUsers, setActiveUsers] = useState<any>({});
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{rowId: number, columnKey: string} | null>(null);

  const hojaActiva = hojas.find(h => h.id === hojaActivaId) || hojas[0];

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

  const agregarFilaManual = () => {
    const maxId = hojaActiva.rows.length > 0 ? Math.max(...hojaActiva.rows.map((r:any) => r.id)) : 0;
    const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: [...h.rows, crearFilaVacia(maxId + 1)] } : h);
    setHojas(nh); guardarEnNube(nh);
  };

  const agregarHoja = () => {
    const nuevoNombre = prompt('Nombre de la nueva hoja:'); if (!nuevoNombre) return;
    const nuevasHojas = [...hojas, { id: `hoja-${Date.now()}`, nombre: nuevoNombre, rows: [crearFilaVacia(1)] }];
    setHojas(nuevasHojas); setHojaActivaId(nuevasHojas[nuevasHojas.length - 1].id); guardarEnNube(nuevasHojas);
  };

  const renombrarHoja = (hojaId: string, nombreActual: string) => {
    const nuevoNombre = prompt('Renombrar hoja a:', nombreActual); if (!nuevoNombre || nuevoNombre === nombreActual) return;
    const nuevasHojas = hojas.map(h => h.id === hojaId ? { ...h, nombre: nuevoNombre } : h);
    setHojas(nuevasHojas); guardarEnNube(nuevasHojas);
  };

  const eliminarHoja = (hojaId: string) => {
    if (hojas.length <= 1) return alert("No puedes eliminar la única hoja.");
    if (window.confirm("¿Seguro que deseas eliminar esta hoja?")) {
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
        const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });
        let hojaObj = { id: `hoja-${Date.now()}-${sheetIndex}`, nombre: sheetName, rows: [] as any[] };
        let enTabla = false; let mainHeaders: string[] = []; let idxFecha = -1;

        for (let i = 0; i < rawData.length; i++) {
          const rowArr = rawData[i] as string[];
          const rowStr = rowArr.join(' ').toUpperCase();
          if (!rowStr.trim()) continue;

          if (!enTabla && (rowStr.includes('PROVEEDOR') || rowStr.includes('FACTURA')) && rowStr.includes('FECHA')) {
            enTabla = true;
            mainHeaders = rowArr.map(h => String(h).toUpperCase().trim());
            idxFecha = mainHeaders.findIndex(h => h.includes('FECHA'));
            continue;
          }

          if (enTabla) {
            if (rowStr.includes('TOTAL') || rowStr.includes('RESUMEN')) continue;
            const getValue = (...nombres: string[]) => {
              for (let name of nombres) {
                const idx = mainHeaders.findIndex(h => h.includes(name));
                if (idx !== -1 && rowArr[idx]) return String(rowArr[idx]).trim();
              } return '';
            };

            const fechaLimpia = parseExcelDate(rowArr[idxFecha]);
            if (!fechaLimpia && !getValue('PROVEEDOR')) continue;

            hojaObj.rows.push({
              id: idBase++, fecha: fechaLimpia, nFactura: getValue('FACTURA'), nBoleta: getValue('BOLETA'),
              proveedor: getValue('PROVEEDOR') || rowArr[idxFecha + 1] || '', 
              insumo: getValue('INSUMO', 'DETALLE') || rowArr[idxFecha + 5] || '', 
              totalFactura: getValue('TOTAL FACTURA') || '0', totalBoleta: getValue('TOTAL BOLETA') || '0', 
              observaciones: getValue('OBSERVA'), format: {}
            });
          }
        }
        if (hojaObj.rows.length === 0) hojaObj.rows.push(crearFilaVacia(idBase++));
        hojasExtraidas.push(hojaObj);
      });

      if (hojasExtraidas.length > 0) {
        const nh = modoReemplazo ? hojasExtraidas : [...hojas, ...hojasExtraidas];
        setHojas(nh); setHojaActivaId(nh[0].id); guardarEnNube(nh);
      } else { alert("No se detectó el formato en el Excel."); }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    { key: 'id', name: 'N°', width: 60, resizable: true },
    { key: 'fecha', name: 'FECHA', renderEditCell: textEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'fecha') },
    { key: 'nFactura', name: 'N° FACTURA', renderEditCell: textEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'nFactura') },
    { key: 'nBoleta', name: 'N° BOLETA', renderEditCell: textEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'nBoleta') },
    { key: 'proveedor', name: 'PROVEEDOR', renderEditCell: textEditor, width: 250, resizable: true, cellClass: (r: any) => getCellClass(r, 'proveedor') },
    { key: 'insumo', name: 'INSUMO / DETALLE', renderEditCell: textEditor, width: 400, resizable: true, cellClass: (r: any) => getCellClass(r, 'insumo') },
    { key: 'totalFactura', name: 'TOTAL FACTURA', renderEditCell: textEditor, width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'totalFactura') },
    { key: 'totalBoleta', name: 'TOTAL BOLETA', renderEditCell: textEditor, width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'totalBoleta') },
    { key: 'observaciones', name: 'OBSERVACIONES', renderEditCell: textEditor, width: 300, resizable: true, cellClass: (r: any) => getCellClass(r, 'observaciones') }
  ], [hojaActivaId, activeUsers]);

  return (
    <div className="p-2 h-screen flex flex-col bg-gray-50 overflow-hidden relative">
      <style>{`.rdg { --rdg-border-color: #d1d5db; height: 100%; border: none; } .rdg-cell { border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 0 8px; } .rdg-header-cell { background-color: #f3f4f6; border-bottom: 2px solid #9ca3af; font-weight: bold; color: #374151; } `}</style>
      <div className="flex items-center gap-2 mb-2 px-2 shrink-0 flex-wrap">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800 mr-2"><ArrowLeft size={24} /></Link>
        <h1 className="text-xl font-bold uppercase text-purple-800 mr-2 flex items-center gap-2"><FileSpreadsheet size={20}/> {id?.replace('-', ' ')}</h1>
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border shadow-sm">
          <PaintBucket size={18} className="text-gray-400 mx-2" />
          <button onClick={() => pintarCelda('bg-yellow-100 text-yellow-900')} className="w-6 h-6 rounded bg-yellow-100 border border-yellow-300" />
          <button onClick={() => pintarCelda('bg-green-100 text-green-900')} className="w-6 h-6 rounded bg-green-100 border border-green-300" />
          <button onClick={() => pintarCelda('bg-red-100 text-red-900')} className="w-6 h-6 rounded bg-red-100 border border-red-300" />
          <button onClick={() => pintarCelda('bg-blue-100 text-blue-900')} className="w-6 h-6 rounded bg-blue-100 border border-blue-300" />
          <button onClick={() => pintarCelda('')} className="w-6 h-6 rounded bg-white border text-xs text-gray-400">✖</button>
        </div>
        <button onClick={agregarFilaManual} className="ml-2 flex items-center gap-1 bg-purple-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-purple-700"><Plus size={16} /> Fila</button>
        <input type="file" ref={fileInputRef} onChange={importarExcel} accept=".xlsx, .xls, .csv" className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-green-700"><Upload size={16} /> Importar Facturas</button>
        <div className="flex -space-x-2 ml-auto pr-4">
          {Object.values(activeUsers).map((u: any) => (
            <div key={u.name} title={u.name} className={`inline-flex h-8 w-8 rounded-full ring-2 ring-white items-center justify-center text-xs font-bold text-white ${obtenerColorUsuario(u.name).bg}`}>{u.name.charAt(0).toUpperCase()}</div>
          ))}
        </div>
      </div>
      <div className="flex-1 bg-white border border-gray-300 shadow-sm relative flex flex-col rounded-t-lg min-h-0">
        <DataGrid columns={columnas} rows={hojaActiva.rows} onRowsChange={(rf) => {
          const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: rf } : h);
          setHojas(nh); guardarEnNube(nh);
        }} onCellClick={(args) => {
          setCeldaSeleccionada({ rowId: args.row.id, columnKey: args.column.key });
          set(ref(rtdb, `presence/${id}/${userName}`), { name: userName, editing: { row: args.row.id, column: args.column.key }, activeSheet: hojaActivaId });
        }} className="h-full w-full" style={{ minHeight: 0 }} />
      </div>
      <div className="flex items-center gap-1 pt-1 shrink-0 overflow-x-auto bg-gray-50">
        {hojas.map((hoja) => (
          <div key={hoja.id} onClick={() => setHojaActivaId(hoja.id)} className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-b-lg border-x border-b border-t-0 shadow-sm cursor-pointer ${hojaActivaId === hoja.id ? 'bg-white text-purple-600 border-t-2 border-t-purple-500' : 'bg-gray-200 text-gray-500'}`}>
            <FileSpreadsheet size={16} /> <span onDoubleClick={() => renombrarHoja(hoja.id, hoja.nombre)}>{hoja.nombre}</span>
            {hojaActivaId === hoja.id && (
              <div className="flex items-center gap-1 ml-2">
                 <Edit2 size={14} className="text-gray-400 hover:text-purple-500" onClick={(e) => { e.stopPropagation(); renombrarHoja(hoja.id, hoja.nombre); }} />
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