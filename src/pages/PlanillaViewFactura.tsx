import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, PaintBucket, Plus, FileText, X, Edit2 } from 'lucide-react';
import DataGrid, { textEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
import 'react-data-grid/lib/styles.css';

// --- UTILIDADES ---
const crearFilaVacia = (id: number) => ({ 
  id, fecha: '', nFactura: '', nBoleta: '', proveedor: '', insumo: '', 
  totalFactura: '0', totalBoleta: '0', observaciones: '', 
  descripcion: '', valorUnitario: '0', cantidad: '', unidad: '', valorNeto: '0', nOrden: '', format: {} 
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

// LECTOR ESTRICTO DE FECHAS (Arregla el 1/15/2026 a 15-01-2026)
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
  const userName = sessionStorage.getItem('userName') || 'Invitado';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCopiapo = (id || '').toLowerCase().includes('copiapo');

  // --- ESTADOS BASE ---
  const [hojas, setHojas] = useState<any[]>([{ id: 'hoja-1', nombre: 'Mes 1', rows: [crearFilaVacia(1)] }]);
  const [hojaActivaId, setHojaActivaId] = useState<string>('hoja-1');
  const [activeUsers, setActiveUsers] = useState<any>({});
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{rowId: number, columnKey: string} | null>(null);

  const hojaActiva = hojas.find(h => h.id === hojaActivaId) || hojas[0];

  // --- CÁLCULOS EN VIVO PARA TOTALES (Barra Inferior) ---
  const sumaFacturas = useMemo(() => {
    return (hojaActiva.rows || []).reduce((sum: number, r: any) => sum + parseCurrency(r.totalFactura), 0);
  }, [hojaActiva.rows]);

  const sumaBoletas = useMemo(() => {
    return (hojaActiva.rows || []).reduce((sum: number, r: any) => sum + parseCurrency(r.totalBoleta), 0);
  }, [hojaActiva.rows]);

  const sumaCopiapoNeto = useMemo(() => {
    return (hojaActiva.rows || []).reduce((sum: number, r: any) => sum + parseCurrency(r.valorNeto), 0);
  }, [hojaActiva.rows]);

  const sumaTotal = isCopiapo ? sumaCopiapoNeto : sumaFacturas + sumaBoletas;

  // --- FIREBASE SYNC ---
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

  // --- ESCÁNER INTELIGENTE DE FACTURAS (BIFURCADO CALAMA/COPIAPÓ) ---
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
        
        // Indices comunes
        let idxFecha = -1, idxFactura = -1, idxProv = -1;
        // Indices Calama
        let idxInsumo = -1, idxTotalGen = -1, idxTotalFac = -1, idxTotalBol = -1;
        // Indices Copiapó
        let idxDesc = -1, idxValUnit = -1, idxCant = -1, idxUnidad = -1, idxValNeto = -1, idxOrden = -1;

        for (let i = 0; i < rawData.length; i++) {
          const rowArr = rawData[i] as string[];
          const rowStr = rowArr.join(' ').toUpperCase();
          if (!rowStr.trim()) continue;

          // 1. Detectar Títulos dinámicamente
          if (estado === 'BUSCANDO_TITULOS') {
            
            // Si es COPIAPÓ (Busca Fecha y Descripción)
            if (isCopiapo && rowStr.includes('FECHA') && rowStr.includes('DESCRIPCION') && rowStr.includes('PROVEEDOR')) {
              estado = 'EXTRAYENDO_DATOS';
              mainHeaders = rowArr.map(h => String(h).toUpperCase().trim());
              
              idxFecha = mainHeaders.findIndex(h => h.includes('FECHA'));
              idxFactura = mainHeaders.findIndex(h => h === 'FACTURA' || h.includes('Nº FACTURA') || h.includes('N° FACTURA'));
              idxDesc = mainHeaders.findIndex(h => h.includes('DESCRIPCION') || h.includes('DESCRIPCIÓN'));
              idxValUnit = mainHeaders.findIndex(h => h.includes('VALOR UNIT'));
              idxProv = mainHeaders.findIndex(h => h.includes('PROVEEDOR'));
              idxCant = mainHeaders.findIndex(h => h.includes('CANTIDAD') || h === 'CANT');
              idxUnidad = mainHeaders.findIndex(h => h.includes('UNIDAD'));
              idxValNeto = mainHeaders.findIndex(h => h.includes('VALOR NETO'));
              idxOrden = mainHeaders.findIndex(h => h.includes('ORDEN'));
              continue;
            }
            
            // Si es CALAMA (Busca Fecha y Factura/Insumo/Total)
            if (!isCopiapo && rowStr.includes('FECHA') && (rowStr.includes('FACTURA') || rowStr.includes('INSUMO') || rowStr.includes('TOTAL'))) {
              estado = 'EXTRAYENDO_DATOS';
              mainHeaders = rowArr.map(h => String(h).toUpperCase().trim());
              
              idxFecha = mainHeaders.findIndex(h => h.includes('FECHA'));
              idxFactura = mainHeaders.findIndex(h => h.includes('FACTURA') && !h.includes('TOTAL')); 
              idxInsumo = mainHeaders.findIndex(h => h.includes('INSUMO'));
              idxProv = mainHeaders.findIndex(h => h.includes('PROVEEDOR'));
              
              idxTotalGen = mainHeaders.findIndex(h => h === 'TOTAL');
              idxTotalFac = mainHeaders.findIndex(h => h.includes('TOTAL FACTURA'));
              idxTotalBol = mainHeaders.findIndex(h => h.includes('TOTAL BOLETA'));
              continue;
            }
          }

          // 2. Extraer Datos
          if (estado === 'EXTRAYENDO_DATOS') {
            if (rowStr.includes('TOTAL') || rowStr.includes('RESUMEN')) continue;

            const valFecha = parseExcelDate(rowArr[idxFecha]);
            const valFactura = idxFactura !== -1 ? rowArr[idxFactura] : '';
            const valProv = idxProv !== -1 ? rowArr[idxProv] : '';

            // --- EXTRACCIÓN COPIAPÓ ---
            if (isCopiapo) {
              const valDesc = idxDesc !== -1 ? rowArr[idxDesc] : '';
              const valUnit = idxValUnit !== -1 ? rowArr[idxValUnit] : '0';
              const valCant = idxCant !== -1 ? rowArr[idxCant] : '';
              const valUnidad = idxUnidad !== -1 ? rowArr[idxUnidad] : '';
              const valNeto = idxValNeto !== -1 ? rowArr[idxValNeto] : '0';
              const valOrden = idxOrden !== -1 ? rowArr[idxOrden] : '';

              if (!valFecha && !valDesc && !valProv && parseCurrency(valNeto) === 0) continue;

              hojaObj.rows.push({
                id: idBase++, fecha: valFecha, nFactura: valFactura, descripcion: valDesc,
                proveedor: valProv, valorUnitario: valUnit, cantidad: valCant, unidad: valUnidad,
                valorNeto: valNeto, nOrden: valOrden, format: {}
              });
            } 
            // --- EXTRACCIÓN CALAMA ---
            else {
              const valInsumo = idxInsumo !== -1 ? rowArr[idxInsumo] : '';
              let vTotalFactura = '0', vTotalBoleta = '0';

              if (idxTotalFac !== -1) vTotalFactura = rowArr[idxTotalFac] || '0';
              else if (idxTotalGen !== -1) vTotalFactura = rowArr[idxTotalGen] || '0';
              if (idxTotalBol !== -1) vTotalBoleta = rowArr[idxTotalBol] || '0';

              if (!valFecha && !valFactura && !valInsumo && parseCurrency(vTotalFactura) === 0 && parseCurrency(vTotalBoleta) === 0) continue;

              hojaObj.rows.push({
                id: idBase++, fecha: valFecha, nFactura: valFactura, nBoleta: '', 
                proveedor: valProv, insumo: valInsumo, totalFactura: vTotalFactura, 
                totalBoleta: vTotalBoleta, observaciones: '', format: {}
              });
            }
          }
        }

        if (hojaObj.rows.length === 0) hojaObj.rows.push(crearFilaVacia(idBase++));
        hojasExtraidas.push(hojaObj);
      });

      if (hojasExtraidas.length > 0) {
        const nh = modoReemplazo ? hojasExtraidas : [...hojas, ...hojasExtraidas];
        setHojas(nh); setHojaActivaId(nh[0].id); guardarEnNube(nh);
      } else { alert("No se detectó la estructura de Facturas. Revisa los títulos en tu Excel."); }
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

  // --- COLUMNAS (CALAMA VS COPIAPÓ) ---
  const colsCalama = useMemo(() => [
    { key: 'id', name: 'N°', width: 60, resizable: true },
    { key: 'fecha', name: 'FECHA', renderEditCell: textEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'fecha') },
    { key: 'nFactura', name: 'N° FACTURA', renderEditCell: textEditor, width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'nFactura') },
    { key: 'nBoleta', name: 'N° BOLETA', renderEditCell: textEditor, width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'nBoleta') },
    { key: 'proveedor', name: 'PROVEEDOR', renderEditCell: textEditor, width: 200, resizable: true, cellClass: (r: any) => getCellClass(r, 'proveedor') },
    { key: 'insumo', name: 'INSUMO / DETALLE', renderEditCell: textEditor, width: 350, resizable: true, cellClass: (r: any) => getCellClass(r, 'insumo') },
    { key: 'totalFactura', name: 'TOTAL FACTURA', width: 150, resizable: true, renderEditCell: textEditor, renderCell: (p:any) => formatMoney(p.row.totalFactura), cellClass: (r: any) => getCellClass(r, 'totalFactura') },
    { key: 'totalBoleta', name: 'TOTAL BOLETA', width: 150, resizable: true, renderEditCell: textEditor, renderCell: (p:any) => formatMoney(p.row.totalBoleta), cellClass: (r: any) => getCellClass(r, 'totalBoleta') },
    { key: 'observaciones', name: 'OBSERVACIONES', renderEditCell: textEditor, width: 300, resizable: true, cellClass: (r: any) => getCellClass(r, 'observaciones') }
  ], [hojaActivaId, activeUsers]);

  const colsCopiapo = useMemo(() => [
    { key: 'id', name: 'N°', width: 60, resizable: true },
    { key: 'fecha', name: 'FECHA', renderEditCell: textEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'fecha') },
    { key: 'descripcion', name: 'DESCRIPCIÓN', renderEditCell: textEditor, width: 300, resizable: true, cellClass: (r: any) => getCellClass(r, 'descripcion') },
    { key: 'nFactura', name: 'N° FACTURA', renderEditCell: textEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'nFactura') },
    { key: 'valorUnitario', name: 'VALOR UNIT.', renderEditCell: textEditor, width: 150, resizable: true, renderCell: (p:any) => formatMoney(p.row.valorUnitario), cellClass: (r: any) => getCellClass(r, 'valorUnitario') },
    { key: 'proveedor', name: 'PROVEEDOR', renderEditCell: textEditor, width: 200, resizable: true, cellClass: (r: any) => getCellClass(r, 'proveedor') },
    { key: 'cantidad', name: 'CANT.', renderEditCell: textEditor, width: 80, resizable: true, cellClass: (r: any) => getCellClass(r, 'cantidad') },
    { key: 'unidad', name: 'UNIDAD', renderEditCell: textEditor, width: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'unidad') },
    { key: 'valorNeto', name: 'VALOR NETO', width: 150, resizable: true, renderEditCell: textEditor, renderCell: (p:any) => formatMoney(p.row.valorNeto), cellClass: (r: any) => getCellClass(r, 'valorNeto') },
    { key: 'nOrden', name: 'N° ORDEN', renderEditCell: textEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'nOrden') }
  ], [hojaActivaId, activeUsers]);

  return (
    <div className="p-2 h-screen flex flex-col bg-gray-50 overflow-hidden relative">
      <style>{`.rdg { --rdg-border-color: #d1d5db; height: 100%; border: none; } .rdg-cell { border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 0 8px; } .rdg-header-cell { background-color: #f3f4f6; border-bottom: 2px solid #9ca3af; font-weight: bold; color: #374151; } `}</style>

      {/* --- TOOLBAR SUPERIOR --- */}
      <div className="flex items-center gap-2 mb-2 px-2 shrink-0 flex-wrap">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800 mr-2"><ArrowLeft size={24} /></Link>
        <h1 className="text-xl font-bold uppercase text-purple-800 mr-2 flex items-center gap-2"><FileText size={20}/> {id?.replace('-', ' ')}</h1>
        
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border shadow-sm">
          <PaintBucket size={18} className="text-gray-400 mx-2" />
          <button onClick={() => pintarCelda('bg-yellow-100 text-yellow-900')} className="w-6 h-6 rounded bg-yellow-100 border border-yellow-300" />
          <button onClick={() => pintarCelda('bg-green-100 text-green-900')} className="w-6 h-6 rounded bg-green-100 border border-green-300" />
          <button onClick={() => pintarCelda('bg-red-100 text-red-900')} className="w-6 h-6 rounded bg-red-100 border border-red-300" />
          <button onClick={() => pintarCelda('bg-blue-100 text-blue-900')} className="w-6 h-6 rounded bg-blue-100 border border-blue-300" />
          <button onClick={() => pintarCelda('')} className="w-6 h-6 rounded bg-white border text-xs text-gray-400">✖</button>
        </div>

        <button onClick={agregarFila} className="ml-2 flex items-center gap-1 bg-purple-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-purple-700"><Plus size={16} /> Fila</button>

        <input type="file" ref={fileInputRef} onChange={importarExcel} accept=".xlsx, .xls, .csv" className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-green-700"><Upload size={16} /> Importar Facturas</button>

        <div className="flex -space-x-2 ml-auto pr-4">
          {Object.values(activeUsers).map((u: any) => (
            <div key={u.name} title={u.name} className={`inline-flex h-8 w-8 rounded-full ring-2 ring-white items-center justify-center text-xs font-bold text-white ${obtenerColorUsuario(u.name).bg}`}>{u.name.charAt(0).toUpperCase()}</div>
          ))}
        </div>
      </div>

      {/* --- TABLA PRINCIPAL --- */}
      <div className="flex-1 bg-white border border-gray-300 shadow-sm relative flex flex-col rounded-t-lg min-h-0">
        <DataGrid 
           columns={isCopiapo ? colsCopiapo : colsCalama} 
           rows={hojaActiva.rows} 
           onRowsChange={procesarCambiosMain} 
           onCellClick={handleCellClick} 
           className="h-full w-full" 
           style={{ minHeight: 0 }} 
        />
      </div>

      {/* --- BARRA INFERIOR DE RESUMEN --- */}
      <div className="bg-purple-900 text-white px-6 py-3 flex gap-10 text-sm shrink-0 shadow-inner items-center">
        <span className="font-bold text-purple-300 uppercase tracking-widest">Resumen Facturación:</span>
        
        {isCopiapo ? (
           <span className="flex items-center gap-2 text-purple-200">Suma Valor Neto: <strong className="text-white bg-purple-800 px-3 py-1 rounded-lg border border-purple-700">{formatMoney(sumaCopiapoNeto)}</strong></span>
        ) : (
           <>
              <span className="flex items-center gap-2 text-purple-200">Suma Boletas: <strong className="text-white bg-purple-800 px-3 py-1 rounded-lg border border-purple-700">{formatMoney(sumaBoletas)}</strong></span>
              <span className="flex items-center gap-2 text-purple-200">Suma Facturas: <strong className="text-white bg-purple-800 px-3 py-1 rounded-lg border border-purple-700">{formatMoney(sumaFacturas)}</strong></span>
           </>
        )}
        
        <span className="ml-auto flex items-center gap-3">
          TOTAL MES: 
          <strong className="text-green-400 bg-gray-800 px-4 py-1.5 rounded-lg text-lg border border-gray-700 shadow-sm">{formatMoney(sumaTotal)}</strong>
        </span>
      </div>

      {/* --- PESTAÑAS (TABS EXCEL) --- */}
      <div className="flex items-center gap-1 pt-1 shrink-0 overflow-x-auto bg-gray-50">
        {hojas.map((hoja) => (
          <div key={hoja.id} onClick={() => setHojaActivaId(hoja.id)} className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-b-lg border-x border-b border-t-0 shadow-sm cursor-pointer ${hojaActivaId === hoja.id ? 'bg-white text-purple-600 border-t-2 border-t-purple-500' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
            <FileText size={16} /> <span onDoubleClick={() => renombrarHoja(hoja.id, hoja.nombre)}>{hoja.nombre}</span>
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