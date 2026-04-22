import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, PaintBucket, Plus, FileSpreadsheet, Calculator, X, Edit2 } from 'lucide-react';
import DataGrid, { textEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
import 'react-data-grid/lib/styles.css';

const crearFilaVacia = (id: number) => ({ id, format: {} });
const crearFilaSueldo = (id: number) => ({ id, fecha: '', trabajador: '', sueldo: '0', cotizacion: '0', format: {} });
const crearFilaGasto = (id: number, tipo: string = 'Oficina') => ({ id, tipo, detalle: '', monto: '0', format: {} });

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

export default function PlanillaViewBalance() {
  const { id } = useParams();
  const userName = localStorage.getItem('userName') || 'Invitado';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hojas, setHojas] = useState<any[]>([{ 
    id: 'hoja-1', nombre: 'Mes 1', rows: [crearFilaVacia(1)], 
    sueldos: [crearFilaSueldo(1)], gastos: [crearFilaGasto(1, 'Oficina')], 
    totalGastosOficina: 0, totalGastosFijos: 0, balanceGeneral: 0 
  }]);
  const [hojaActivaId, setHojaActivaId] = useState<string>('hoja-1');
  const [activeUsers, setActiveUsers] = useState<any>({});
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{rowId: number, columnKey: string} | null>(null);
  const [mostrarModalSecundario, setMostrarModalSecundario] = useState(false);

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

  const procesarCambiosMain = (nuevasFilas: any[]) => {
    let actualizadas = nuevasFilas.map(fila => {
      const v = parseCurrency(fila.ventaNeta); const m = parseCurrency(fila.costoMateriales); const c = parseCurrency(fila.costoVarios);
      fila.balanceIngreso = v - m - c; fila.pagoIva = Math.round(v * 1.19);
      return { ...fila, format: fila.format || {} };
    });
    const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: actualizadas } : h);
    setHojas(nh); guardarEnNube(nh);
  };

  const procesarSueldos = (nuevasFilas: any[]) => {
    const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, sueldos: nuevasFilas } : h);
    setHojas(nh); guardarEnNube(nh);
  };

  const procesarGastos = (nuevasFilas: any[]) => {
    let tOficina = 0, tFijos = 0;
    nuevasFilas.forEach(f => {
      if (f.tipo === 'Oficina') tOficina += parseCurrency(f.monto);
      else tFijos += parseCurrency(f.monto);
    });
    const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, gastos: nuevasFilas, totalGastosOficina: tOficina, totalGastosFijos: tFijos } : h);
    setHojas(nh); guardarEnNube(nh);
  };

  const agregarFila = (tipo: 'main' | 'sueldo' | 'gasto') => {
    let nh = [...hojas];
    const idx = nh.findIndex(h => h.id === hojaActivaId);
    
    if (tipo === 'main') {
      const maxId = nh[idx].rows.length > 0 ? Math.max(...nh[idx].rows.map((r:any) => r.id)) : 0;
      nh[idx].rows.push(crearFilaVacia(maxId + 1));
    } else if (tipo === 'sueldo') {
      const maxId = (nh[idx].sueldos||[]).length > 0 ? Math.max(...(nh[idx].sueldos||[]).map((r:any) => r.id)) : 0;
      nh[idx].sueldos = [...(nh[idx].sueldos||[]), crearFilaSueldo(maxId + 1)];
    } else if (tipo === 'gasto') {
      const maxId = (nh[idx].gastos||[]).length > 0 ? Math.max(...(nh[idx].gastos||[]).map((r:any) => r.id)) : 0;
      nh[idx].gastos = [...(nh[idx].gastos||[]), crearFilaGasto(maxId + 1, 'Oficina')];
    }
    
    setHojas(nh); guardarEnNube(nh);
  };

  const agregarHoja = () => {
    const nuevoNombre = prompt('Nombre de la nueva hoja:'); if (!nuevoNombre) return;
    const nuevasHojas = [...hojas, { id: `hoja-${Date.now()}`, nombre: nuevoNombre, rows: [crearFilaVacia(1)], sueldos: [crearFilaSueldo(1)], gastos: [crearFilaGasto(1, 'Oficina')], totalGastosOficina: 0, totalGastosFijos: 0, balanceGeneral: 0 }];
    setHojas(nuevasHojas); setHojaActivaId(nuevasHojas[nuevasHojas.length - 1].id); guardarEnNube(nuevasHojas);
  };

  const renombrarHoja = (hojaId: string, nombreActual: string) => {
    const nuevoNombre = prompt('Renombrar hoja a:', nombreActual); if (!nuevoNombre || nuevoNombre === nombreActual) return;
    const nuevasHojas = hojas.map(h => h.id === hojaId ? { ...h, nombre: nuevoNombre } : h);
    setHojas(nuevasHojas); guardarEnNube(nuevasHojas);
  };

  const eliminarHoja = (hojaId: string) => {
    if (hojas.length <= 1) return alert("No puedes eliminar la única hoja.");
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
      let idBase = 1, idSueldoBase = 1000, idGastoBase = 5000;

      workbook.SheetNames.forEach((sheetName, sheetIndex) => {
        const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });
        let hojaObj = { id: `hoja-${Date.now()}-${sheetIndex}`, nombre: sheetName, rows: [] as any[], sueldos: [] as any[], gastos: [] as any[], totalGastosOficina: 0, totalGastosFijos: 0, balanceGeneral: 0 };
        
        let estado = 'IDLE'; 
        let mainHeaders: string[] = [];
        let idxVNeta = -1, idxCMat = -1, idxCVar = -1, idxBal = -1, idxFecha = -1;
        let capOficina = false, capFijos = false;

        for (let i = 0; i < rawData.length; i++) {
          const rowArr = rawData[i] as string[];
          const rowStr = rowArr.join(' ').toUpperCase();
          if (!rowStr.trim()) continue;

          if (estado === 'IDLE' && rowStr.includes('FECHA') && rowStr.includes('VENTA NETA')) {
            estado = 'TABLA_MAIN';
            mainHeaders = rowArr.map(h => String(h).toUpperCase().trim());
            idxVNeta = mainHeaders.findIndex(h => h.includes('VENTA NETA'));
            idxCMat = mainHeaders.findIndex(h => h.includes('COSTO MATERIALES'));
            idxCVar = mainHeaders.findIndex(h => h.includes('COSTO VARIOS'));
            idxBal = mainHeaders.findIndex(h => h.includes('BALANCE INGRESO'));
            idxFecha = mainHeaders.findIndex(h => h.includes('FECHA'));
            continue;
          }

          let textVNeta = idxVNeta !== -1 && rowArr[idxVNeta] ? String(rowArr[idxVNeta]).toUpperCase().trim() : '';
          let textBal = idxBal !== -1 && rowArr[idxBal] ? String(rowArr[idxBal]).toUpperCase().trim() : '';
          let textCVar = idxCVar !== -1 && rowArr[idxCVar] ? String(rowArr[idxCVar]).toUpperCase().trim() : '';

          if (textVNeta.includes('GASTOS FIJOS OFICINA') || textVNeta === 'GASTOS OFICINA') { estado = 'GASTOS_OFICINA'; capOficina = true; continue; }
          if (textBal === 'GASTOS FIJOS' || (textBal.includes('GASTOS FIJOS') && !textBal.includes('OFICINA'))) { estado = 'GASTOS_FIJOS'; capFijos = true; continue; }
          if (textCVar.includes('BALANCE GENERAL')) { hojaObj.balanceGeneral = parseCurrency(rowArr[idxBal] || rowArr[idxBal + 1]); estado = 'IDLE'; continue; }
          if (textVNeta === 'SUELDO' || textVNeta === 'TRABAJADOR' || rowStr.includes('SUELDO LÍQUIDO')) { estado = 'SUELDOS'; continue; }

          if (estado === 'TABLA_MAIN') {
            if (rowStr.includes('TOTAL') || rowStr.includes('RESUMEN')) continue;
            const vNeta = rowArr[idxVNeta] || '0';
            const fechaLimpia = parseExcelDate(rowArr[idxFecha]);
            if (!fechaLimpia && parseCurrency(vNeta) === 0 && !rowArr[idxFecha + 1]) continue;

            hojaObj.rows.push({
              id: idBase++, fecha: fechaLimpia, cliente: rowArr[idxFecha + 1] || '', empresa: rowArr[idxFecha + 2] || '',
              ot: rowArr[idxFecha + 3] || '', equipo: rowArr[idxFecha + 4] || '', patente: rowArr[idxFecha + 5] || '',
              trabajo: rowArr[idxFecha + 6] || '', ventaNeta: vNeta, costoMateriales: rowArr[idxCMat] || '0', costoVarios: rowArr[idxCVar] || '0',
              balanceIngreso: parseCurrency(vNeta) - parseCurrency(rowArr[idxCMat]) - parseCurrency(rowArr[idxCVar]),
              estatus: rowArr[idxBal + 1] || 'PENDIENTE', pagoNeto: rowArr[idxBal + 2] || '0', pagoIva: Math.round(parseCurrency(vNeta) * 1.19),
              factura: rowArr[idxBal + 4] || '', fechaPago: parseExcelDate(rowArr[idxBal + 5]), format: {}
            });
          }

          if (estado === 'GASTOS_OFICINA') {
            if (textVNeta.includes('TOTAL')) { hojaObj.totalGastosOficina = parseCurrency(rowArr[idxCMat]); estado = 'IDLE'; capOficina = false; continue; }
            if (rowArr[idxVNeta] && parseCurrency(rowArr[idxCMat]) > 0) {
              hojaObj.gastos.push({ id: idGastoBase++, tipo: 'Oficina', detalle: rowArr[idxVNeta], monto: rowArr[idxCMat], format: {} });
            }
          }

          if (estado === 'GASTOS_FIJOS') {
            if (textBal.includes('TOTAL')) { hojaObj.totalGastosFijos = parseCurrency(rowArr[idxBal + 1] || rowArr[idxBal+2] || rowArr[idxBal]); estado = 'IDLE'; capFijos = false; continue; }
            const montoGasto = rowArr[idxBal + 1] || rowArr[idxBal + 2] || rowArr[idxBal];
            if (rowArr[idxBal] && parseCurrency(montoGasto) > 0) {
              hojaObj.gastos.push({ id: idGastoBase++, tipo: 'Fijo', detalle: rowArr[idxBal], monto: montoGasto, format: {} });
            }
          }

          if (estado === 'SUELDOS') {
            let trab = String(rowArr[idxVNeta] || '').trim();
            if (trab.toUpperCase() === 'SUELDO') trab = String(rowArr[idxVNeta + 1] || '').trim();
            if (trab.toUpperCase().includes('TOTAL')) { estado = 'IDLE'; continue; }
            
            let sueldo = String(rowArr[idxCMat] || '0').trim();
            let cotiz = String(rowArr[idxCVar] || '0').trim();
            if (!trab && parseCurrency(sueldo) === 0 && parseCurrency(cotiz) === 0) continue;

            hojaObj.sueldos.push({ id: idSueldoBase++, fecha: '', trabajador: trab, sueldo, cotizacion: cotiz, format: {} });
          }
        }

        if (hojaObj.rows.length === 0) hojaObj.rows.push(crearFilaVacia(idBase++));
        if (hojaObj.sueldos.length === 0) hojaObj.sueldos.push(crearFilaSueldo(idSueldoBase++));
        if (hojaObj.gastos.length === 0) hojaObj.gastos.push(crearFilaGasto(idGastoBase++));
        
        hojasExtraidas.push(hojaObj);
      });

      if (hojasExtraidas.length > 0) {
        const nh = modoReemplazo ? hojasExtraidas : [...hojas, ...hojasExtraidas];
        setHojas(nh); setHojaActivaId(nh[0].id); guardarEnNube(nh);
      } else { alert("No se detectó el formato correcto en el Excel."); }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const pintarCelda = (colorClass: string) => {
    if (!celdaSeleccionada) return;
    const pintarEn = (filas: any[]) => filas.map((fila: any) => fila.id === celdaSeleccionada.rowId ? { ...fila, format: { ...fila.format, [celdaSeleccionada.columnKey]: colorClass } } : fila);
    const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: pintarEn(h.rows), sueldos: pintarEn(h.sueldos||[]), gastos: pintarEn(h.gastos||[]) } : h);
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

  const colsBase = useMemo(() => [
    { key: 'id', name: 'N°', width: 60, resizable: true },
    { key: 'fecha', name: 'FECHA', renderEditCell: textEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'fecha') },
    { key: 'cliente', name: 'CLIENTE', renderEditCell: textEditor, width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'cliente') },
    { key: 'empresa', name: 'EMPRESA', renderEditCell: textEditor, width: 200, resizable: true, cellClass: (r: any) => getCellClass(r, 'empresa') },
    { key: 'ot', name: 'OT', renderEditCell: textEditor, width: 80, resizable: true },
    { key: 'equipo', name: 'EQUIPO', renderEditCell: textEditor, width: 150, resizable: true },
    { key: 'patente', name: 'PATENTE', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'trabajo', name: 'TRABAJO REALIZADO', renderEditCell: textEditor, width: 350, resizable: true },
    { key: 'ventaNeta', name: 'VENTA NETA', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'costoMateriales', name: 'COSTO MATERIALES', renderEditCell: textEditor, width: 150, resizable: true },
    { key: 'costoVarios', name: 'COSTO VARIOS', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'balanceIngreso', name: 'BALANCE INGRESO', width: 150, renderCell: (p:any) => formatMoney(p.row.balanceIngreso) },
    { key: 'estatus', name: 'ESTATUS', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'pagoNeto', name: 'PAGO NETO', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'pagoIva', name: 'TOTAL (C/ IVA)', width: 150, renderCell: (p:any) => formatMoney(p.row.pagoIva) },
    { key: 'factura', name: 'FACTURA', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'fechaPago', name: 'FECHA PAGO', renderEditCell: textEditor, width: 150, resizable: true }
  ], [hojaActivaId, activeUsers]);

  const colsSueldos = useMemo(() => [
    { key: 'id', name: 'N°', width: 60, resizable: true },
    { key: 'fecha', name: 'FECHA', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'trabajador', name: 'TRABAJADOR', renderEditCell: textEditor, width: 250, resizable: true },
    { key: 'sueldo', name: 'SUELDO LÍQUIDO', renderEditCell: textEditor, width: 150, resizable: true },
    { key: 'cotizacion', name: 'COTIZACIONES', renderEditCell: textEditor, width: 150, resizable: true }
  ], [hojaActivaId]);

  const colsGastos = useMemo(() => [
    { key: 'id', name: 'N°', width: 60, resizable: true },
    { key: 'tipo', name: 'TIPO GASTO', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'detalle', name: 'DETALLE / CONCEPTO', renderEditCell: textEditor, width: 300, resizable: true },
    { key: 'monto', name: 'MONTO', renderEditCell: textEditor, width: 150, resizable: true }
  ], [hojaActivaId]);

  return (
    <div className="p-2 h-screen flex flex-col bg-gray-50 overflow-hidden relative">
      <style>{`.rdg { --rdg-border-color: #d1d5db; height: 100%; border: none; } .rdg-cell { border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 0 8px; } .rdg-header-cell { background-color: #f3f4f6; border-bottom: 2px solid #9ca3af; font-weight: bold; color: #374151; } `}</style>

      <div className="flex items-center gap-2 mb-2 px-2 shrink-0 flex-wrap">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800 mr-2"><ArrowLeft size={24} /></Link>
        <h1 className="text-xl font-bold uppercase text-blue-800 mr-2 flex items-center gap-2"><FileSpreadsheet size={20}/> {id?.replace('-', ' ')}</h1>
        
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border shadow-sm">
          <PaintBucket size={18} className="text-gray-400 mx-2" />
          <button onClick={() => pintarCelda('bg-yellow-100 text-yellow-900')} className="w-6 h-6 rounded bg-yellow-100 border border-yellow-300" />
          <button onClick={() => pintarCelda('bg-green-100 text-green-900')} className="w-6 h-6 rounded bg-green-100 border border-green-300" />
          <button onClick={() => pintarCelda('bg-red-100 text-red-900')} className="w-6 h-6 rounded bg-red-100 border border-red-300" />
          <button onClick={() => pintarCelda('bg-blue-100 text-blue-900')} className="w-6 h-6 rounded bg-blue-100 border border-blue-300" />
          <button onClick={() => pintarCelda('')} className="w-6 h-6 rounded bg-white border text-xs text-gray-400">✖</button>
        </div>

        <button onClick={() => agregarFila('main')} className="ml-2 flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-blue-700"><Plus size={16} /> Fila</button>

        <input type="file" ref={fileInputRef} onChange={importarExcel} accept=".xlsx, .xls, .csv" className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-green-700"><Upload size={16} /> Importar Balance</button>

        <button onClick={() => setMostrarModalSecundario(!mostrarModalSecundario)} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-indigo-700">
          <Calculator size={16} /> Sueldos y Gastos
        </button>

        <div className="flex -space-x-2 ml-auto pr-4">
          {Object.values(activeUsers).map((u: any) => (
            <div key={u.name} title={u.name} className={`inline-flex h-8 w-8 rounded-full ring-2 ring-white items-center justify-center text-xs font-bold text-white ${obtenerColorUsuario(u.name).bg}`}>{u.name.charAt(0).toUpperCase()}</div>
          ))}
        </div>
      </div>

      {mostrarModalSecundario && (
        <div className="absolute top-14 right-6 z-50 bg-white border-2 border-indigo-200 shadow-2xl rounded-xl w-[800px] h-[650px] flex flex-col overflow-hidden">
          <div className="bg-indigo-50 px-4 py-3 border-b flex justify-between items-center shrink-0">
            <h2 className="font-bold text-indigo-800 text-lg">Sueldos y Gastos Operativos ({hojaActiva.nombre})</h2>
            <button onClick={() => setMostrarModalSecundario(false)} className="text-gray-500 hover:text-red-500"><X size={24} /></button>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-gray-50 space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col h-[260px]">
              <div className="bg-gray-100 p-2 border-b flex justify-between items-center shrink-0">
                <span className="font-bold text-sm text-gray-700">1. Nómina de Sueldos</span>
                <button onClick={() => agregarFila('sueldo')} className="bg-indigo-600 text-white px-2 py-1 text-xs rounded hover:bg-indigo-700"><Plus size={14}/></button>
              </div>
              <div className="flex-1 min-h-0"><DataGrid columns={colsSueldos} rows={hojaActiva.sueldos || []} onRowsChange={procesarSueldos} onCellClick={(a)=>setCeldaSeleccionada({rowId:a.row.id, columnKey:a.column.key})} className="h-full w-full" style={{ minHeight: 0 }} /></div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col h-[260px]">
              <div className="bg-gray-100 p-2 border-b flex justify-between items-center shrink-0">
                <span className="font-bold text-sm text-gray-700">2. Gastos (Fijos y Oficina)</span>
                <button onClick={() => agregarFila('gasto')} className="bg-amber-600 text-white px-2 py-1 text-xs rounded hover:bg-amber-700"><Plus size={14}/></button>
              </div>
              <div className="flex-1 min-h-0"><DataGrid columns={colsGastos} rows={hojaActiva.gastos || []} onRowsChange={procesarGastos} onCellClick={(a)=>setCeldaSeleccionada({rowId:a.row.id, columnKey:a.column.key})} className="h-full w-full" style={{ minHeight: 0 }} /></div>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex-1 bg-white border border-gray-300 shadow-sm relative flex flex-col rounded-t-lg min-h-0">
        <DataGrid columns={colsBase} rows={hojaActiva.rows} onRowsChange={procesarCambiosMain} onCellClick={(args) => {
          setCeldaSeleccionada({ rowId: args.row.id, columnKey: args.column.key });
          set(ref(rtdb, `presence/${id}/${userName}`), { name: userName, editing: { row: args.row.id, column: args.column.key }, activeSheet: hojaActivaId });
        }} className="h-full w-full" style={{ minHeight: 0 }} />
      </div>

      <div className="bg-gray-800 text-white px-4 py-2 flex gap-8 text-sm shrink-0 shadow-inner items-center">
        <span className="font-bold text-gray-400 uppercase tracking-widest">Resumen Mensual:</span>
        <span>Oficina: <strong className="text-yellow-400 ml-1">{formatMoney(hojaActiva.totalGastosOficina)}</strong></span>
        <span>Fijos: <strong className="text-red-400 ml-1">{formatMoney(hojaActiva.totalGastosFijos)}</strong></span>
        <span className="ml-auto">Balance General Extr.: <strong className="text-green-400 ml-1 text-base">{formatMoney(hojaActiva.balanceGeneral)}</strong></span>
      </div>

      <div className="flex items-center gap-1 pt-1 shrink-0 overflow-x-auto bg-gray-50">
        {hojas.map((hoja) => (
          <div key={hoja.id} onClick={() => setHojaActivaId(hoja.id)} className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-b-lg border-x border-b border-t-0 shadow-sm cursor-pointer ${hojaActivaId === hoja.id ? 'bg-white text-blue-600 border-t-2 border-t-blue-500' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
            <FileSpreadsheet size={16} /> <span onDoubleClick={() => renombrarHoja(hoja.id, hoja.nombre)}>{hoja.nombre}</span>
            {hojaActivaId === hoja.id && (
              <div className="flex items-center gap-1 ml-2">
                 <Edit2 size={14} className="text-gray-400 hover:text-blue-500" onClick={(e) => { e.stopPropagation(); renombrarHoja(hoja.id, hoja.nombre); }} />
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