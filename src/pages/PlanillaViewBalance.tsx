import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, PaintBucket, Plus, X, Edit2, Wallet, Download } from 'lucide-react';
import DataGrid, { textEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
import 'react-data-grid/lib/styles.css';

// --- UTILIDADES ---
const crearFilaVacia = (id: number) => ({ 
  id, fecha: '', descripcion: '', empresa: '', ventaNeta: '0', 
  iva: '0', ingresoBruto: '0', balanceIngreso: '0', observaciones: '', format: {} 
});

const crearGastoVacio = (id: number) => ({ id, nombre: '', monto: '0', format: {} });

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
  return str;
};

const obtenerColorUsuario = (nombre: string) => {
  const p = [{ bg: 'bg-blue-500', border: 'ring-blue-500' }, { bg: 'bg-red-500', border: 'ring-red-500' }, { bg: 'bg-green-500', border: 'ring-green-500' }, { bg: 'bg-purple-500', border: 'ring-purple-500' }];
  let h = 0; for(let i=0;i<nombre.length;i++) h+=nombre.charCodeAt(i); return p[h%p.length];
};

export default function PlanillaViewBalance() {
  const { id } = useParams();
  const userName = sessionStorage.getItem('userName') || 'Invitado';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- ESTADOS ---
  const [hojas, setHojas] = useState<any[]>([{ 
    id: 'hoja-1', nombre: 'Mes 1', rows: [crearFilaVacia(1)], 
    sueldos: [crearGastoVacio(1)], gastosOficina: [crearGastoVacio(1)], gastosFijos: [crearGastoVacio(1)], balanceGeneral: 0 
  }]);
  const [hojaActivaId, setHojaActivaId] = useState<string>('hoja-1');
  const [activeUsers, setActiveUsers] = useState<any>({});
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{rowId: number, columnKey: string, tableType: string} | null>(null);

  const hojaActiva = hojas.find(h => h.id === hojaActivaId) || hojas[0];

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

  // --- CÁLCULOS PRINCIPALES ---
  const procesarCambiosMain = (nuevasFilas: any[]) => {
    const filasCalculadas = nuevasFilas.map(fila => {
      const vNeta = parseCurrency(fila.ventaNeta);
      const iva = Math.round(vNeta * 0.19);
      const iBruto = vNeta + iva;
      const bIngreso = Math.round(vNeta * 0.40); // 40% Balance Real
      return { ...fila, iva: String(iva), ingresoBruto: String(iBruto), balanceIngreso: String(bIngreso) };
    });
    actualizarHoja({ rows: filasCalculadas });
  };

  const procesarCambiosTabla = (tipo: 'sueldos'|'gastosOficina'|'gastosFijos', nuevasFilas: any[]) => {
    actualizarHoja({ [tipo]: nuevasFilas });
  };

  const actualizarHoja = (cambios: any) => {
    const nh = hojas.map(h => {
      if (h.id === hojaActivaId) {
        const hTemp = { ...h, ...cambios };
        const sumIngresos = (hTemp.rows || []).reduce((acc: number, r: any) => acc + parseCurrency(r.balanceIngreso), 0);
        const sumSueldos = (hTemp.sueldos || []).reduce((acc: number, r: any) => acc + parseCurrency(r.monto), 0);
        const sumOficina = (hTemp.gastosOficina || []).reduce((acc: number, r: any) => acc + parseCurrency(r.monto), 0);
        const sumFijos = (hTemp.gastosFijos || []).reduce((acc: number, r: any) => acc + parseCurrency(r.monto), 0);
        hTemp.balanceGeneral = sumIngresos - (sumSueldos + sumOficina + sumFijos);
        return hTemp;
      }
      return h;
    });
    setHojas(nh); guardarEnNube(nh);
  };

  const agregarFila = (tipo: 'rows'|'sueldos'|'gastosOficina'|'gastosFijos') => {
    const nh = [...hojas];
    const idx = nh.findIndex(h => h.id === hojaActivaId);
    const targetArray = nh[idx][tipo] || [];
    const maxId = targetArray.length > 0 ? Math.max(...targetArray.map((r:any) => r.id)) : 0;
    
    if (tipo === 'rows') nh[idx].rows.push(crearFilaVacia(maxId + 1));
    else nh[idx][tipo].push(crearGastoVacio(maxId + 1));
    
    setHojas(nh); guardarEnNube(nh);
  };

  const agregarHoja = () => {
    const nuevoNombre = prompt('Nombre de la nueva hoja:'); if (!nuevoNombre) return;
    const nuevaHojaId = `hoja-${Date.now()}`;
    const nuevasHojas = [...hojas, { id: nuevaHojaId, nombre: nuevoNombre, rows: [crearFilaVacia(1)], sueldos: [crearGastoVacio(1)], gastosOficina: [crearGastoVacio(1)], gastosFijos: [crearGastoVacio(1)], balanceGeneral: 0 }];
    setHojas(nuevasHojas); setHojaActivaId(nuevaHojaId); guardarEnNube(nuevasHojas);
  };

  const renombrarHoja = (hojaId: string, nombreActual: string) => {
    const nuevoNombre = prompt('Renombrar hoja a:', nombreActual); if (!nuevoNombre || nuevoNombre === nombreActual) return;
    const nuevasHojas = hojas.map(h => h.id === hojaId ? { ...h, nombre: nuevoNombre } : h);
    setHojas(nuevasHojas); guardarEnNube(nuevasHojas);
  };

  const eliminarHoja = (hojaId: string) => {
    if (hojas.length <= 1) return alert("No puedes eliminar la única hoja.");
    if (window.confirm("¿Seguro que deseas ELIMINAR esta hoja y todos sus datos?")) {
      const nuevasHojas = hojas.filter(h => h.id !== hojaId);
      setHojas(nuevasHojas); setHojaActivaId(nuevasHojas[0].id); guardarEnNube(nuevasHojas);
    }
  };

  // --- EXPORTACIÓN A EXCEL (4 PESTAÑAS) ---
  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();

    // 1. Hoja de Ingresos
    const ingresosMapeados = (hojaActiva.rows || []).map((r: any) => ({
      "N°": r.id, 
      "FECHA": r.fecha || '', 
      "DESCRIPCIÓN": r.descripcion || '', 
      "CLIENTE": r.empresa || '',
      "VENTA NETA": parseCurrency(r.ventaNeta), 
      "IVA": parseCurrency(r.iva), 
      "INGRESO BRUTO": parseCurrency(r.ingresoBruto),
      "BALANCE (40%)": parseCurrency(r.balanceIngreso), 
      "OBSERVACIONES": r.observaciones || ''
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ingresosMapeados), "Ingresos Principales");

    // Función para mapear gastos
    const mapearGastos = (arr: any[]) => arr.map(r => ({ "N°": r.id, "DESCRIPCIÓN": r.nombre || '', "MONTO": parseCurrency(r.monto) }));

    // 2, 3 y 4. Hojas de Gastos
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mapearGastos(hojaActiva.sueldos || [])), "Sueldos y Anticipos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mapearGastos(hojaActiva.gastosOficina || [])), "Gastos Oficina");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mapearGastos(hojaActiva.gastosFijos || [])), "Gastos Fijos");

    // Descargar
    XLSX.writeFile(wb, `Balance_${id}_${hojaActiva.nombre}.xlsx`);
  };

  // --- IMPORTACIÓN ---
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
        let hojaObj = { id: `hoja-${Date.now()}-${sheetIndex}`, nombre: sheetName, rows: [] as any[], sueldos: [crearGastoVacio(1)], gastosOficina: [crearGastoVacio(1)], gastosFijos: [crearGastoVacio(1)], balanceGeneral: 0 };
        
        let estado = 'BUSCANDO_TITULOS'; 
        let mainHeaders: string[] = [];
        let idxFecha = -1, idxDesc = -1, idxEmp = -1, idxNeta = -1;

        for (let i = 0; i < rawData.length; i++) {
          const rowArr = rawData[i] as string[];
          const rowStr = rowArr.join(' ').toUpperCase();
          if (!rowStr.trim()) continue;

          if (estado === 'BUSCANDO_TITULOS') {
            if (rowStr.includes('FECHA') && (rowStr.includes('CLIENTE') || rowStr.includes('EMPRESA') || rowStr.includes('NETA'))) {
              estado = 'EXTRAYENDO_DATOS';
              mainHeaders = rowArr.map(h => String(h).toUpperCase().trim());
              idxFecha = mainHeaders.findIndex(h => h.includes('FECHA'));
              idxDesc = mainHeaders.findIndex(h => h.includes('DESCRIPCION') || h.includes('DESCRIPCIÓN'));
              idxEmp = mainHeaders.findIndex(h => h.includes('CLIENTE') || h.includes('EMPRESA'));
              idxNeta = mainHeaders.findIndex(h => h.includes('NETA') || h.includes('NETO'));
              continue;
            }
          }

          if (estado === 'EXTRAYENDO_DATOS') {
            if (rowStr.includes('TOTAL') || rowStr.includes('RESUMEN')) { estado = 'BUSCANDO_TITULOS'; continue; }
            const valFecha = parseExcelDate(rowArr[idxFecha]);
            const valDesc = idxDesc !== -1 ? rowArr[idxDesc] : '';
            const valEmp = idxEmp !== -1 ? rowArr[idxEmp] : '';
            const valNeta = idxNeta !== -1 ? rowArr[idxNeta] : '0';

            if (!valFecha && !valDesc && !valEmp && parseCurrency(valNeta) === 0) continue;

            const vNetaNum = parseCurrency(valNeta);
            const iva = Math.round(vNetaNum * 0.19);
            const iBruto = vNetaNum + iva;
            const bIngreso = Math.round(vNetaNum * 0.40);

            hojaObj.rows.push({
              id: idBase++, fecha: valFecha, descripcion: valDesc, empresa: valEmp,
              ventaNeta: String(vNetaNum), iva: String(iva), ingresoBruto: String(iBruto),
              balanceIngreso: String(bIngreso), observaciones: '', format: {}
            });
          }
        }
        if (hojaObj.rows.length === 0) hojaObj.rows.push(crearFilaVacia(idBase++));
        hojasExtraidas.push(hojaObj);
      });

      if (hojasExtraidas.length > 0) {
        const nh = modoReemplazo ? hojasExtraidas : [...hojas, ...hojasExtraidas];
        setHojas(nh); setHojaActivaId(nh[0].id); guardarEnNube(nh);
      } else { alert("No se detectó la estructura de Ingresos en el Excel."); }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- INTERACCIÓN CELDAS ---
  const handleCellClick = (args: any, tableType: string) => {
    setCeldaSeleccionada({ rowId: args.row.id, columnKey: args.column.key, tableType });
    const presenceRef = ref(rtdb, `presence/${id}/${userName}`);
    set(presenceRef, { name: userName, editing: { row: args.row.id, column: args.column.key, table: tableType }, activeSheet: hojaActivaId });
  };

  const pintarCelda = (colorClass: string) => {
    if (!celdaSeleccionada) return;
    const { rowId, columnKey, tableType } = celdaSeleccionada;
    
    const nh = hojas.map(h => {
      if (h.id === hojaActivaId) {
        const filasNuevas = (h[tableType] || []).map((fila: any) => 
          fila.id === rowId ? { ...fila, format: { ...fila.format, [columnKey]: colorClass } } : fila
        );
        return { ...h, [tableType]: filasNuevas };
      }
      return h;
    });
    setHojas(nh); guardarEnNube(nh);
  };

  const getCellClass = (row: any, columnKey: string, tableType: string) => {
    let classes = row.format?.[columnKey] || ''; 
    for (const key in activeUsers) {
      const user = activeUsers[key];
      if (user.activeSheet === hojaActivaId && user.editing && user.editing.row === row.id && user.editing.column === columnKey && user.editing.table === tableType) {
        classes += ` ring-2 ring-inset z-10 relative ${obtenerColorUsuario(user.name).border}`;
      }
    }
    return classes;
  };

  // --- COLUMNAS INGRESOS PRINCIPALES ---
  const colIngresos = useMemo(() => [
    { key: 'id', name: 'N°', width: 60, resizable: true },
    { key: 'fecha', name: 'FECHA', renderEditCell: textEditor, width: 110, resizable: true, cellClass: (r:any) => getCellClass(r, 'fecha', 'rows') },
    { key: 'descripcion', name: 'DESCRIPCIÓN', renderEditCell: textEditor, width: 250, resizable: true, cellClass: (r:any) => getCellClass(r, 'descripcion', 'rows') },
    { key: 'empresa', name: 'EMPRESA/CLIENTE', renderEditCell: textEditor, width: 200, resizable: true, cellClass: (r:any) => getCellClass(r, 'empresa', 'rows') },
    { key: 'ventaNeta', name: 'VENTA NETA', renderEditCell: textEditor, width: 130, resizable: true, renderCell: (p:any) => formatMoney(p.row.ventaNeta), cellClass: (r:any) => getCellClass(r, 'ventaNeta', 'rows') },
    { key: 'iva', name: 'IVA (19%)', width: 120, resizable: true, renderCell: (p:any) => formatMoney(p.row.iva) },
    { key: 'ingresoBruto', name: 'INGRESO BRUTO', width: 150, resizable: true, renderCell: (p:any) => formatMoney(p.row.ingresoBruto) },
    { key: 'balanceIngreso', name: 'BALANCE (40%)', width: 150, resizable: true, renderCell: (p:any) => <strong className="text-blue-600">{formatMoney(p.row.balanceIngreso)}</strong> },
    { key: 'observaciones', name: 'OBSERVACIONES', renderEditCell: textEditor, width: 200, resizable: true, cellClass: (r:any) => getCellClass(r, 'observaciones', 'rows') }
  ], [hojaActivaId, activeUsers]);

  // --- COLUMNAS GASTOS (Reutilizables para las 3 tablas de abajo) ---
  const colsGastos = (tableType: string) => [
    { key: 'id', name: 'N°', width: 60, resizable: true },
    { key: 'nombre', name: 'DESCRIPCIÓN', renderEditCell: textEditor, width: 250, resizable: true, cellClass: (r:any) => getCellClass(r, 'nombre', tableType) },
    { key: 'monto', name: 'MONTO', renderEditCell: textEditor, width: 150, resizable: true, renderCell: (p:any) => formatMoney(p.row.monto), cellClass: (r:any) => getCellClass(r, 'monto', tableType) }
  ];

  return (
    <div className="p-2 h-screen flex flex-col bg-gray-50 overflow-hidden relative">
      <style>{`.rdg { --rdg-border-color: #d1d5db; height: 100%; border: none; } .rdg-cell { border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 0 8px; } .rdg-header-cell { background-color: #f3f4f6; border-bottom: 2px solid #9ca3af; font-weight: bold; color: #374151; } `}</style>

      {/* --- TOOLBAR --- */}
      <div className="flex items-center gap-2 mb-2 px-2 shrink-0 flex-wrap">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800 mr-2"><ArrowLeft size={24} /></Link>
        <h1 className="text-xl font-black uppercase text-blue-800 mr-2 flex items-center gap-2"><Wallet size={22}/> {id?.replace(/-/g, ' ')}</h1>
        
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border shadow-sm ml-4">
          <PaintBucket size={18} className="text-gray-400 mx-2" />
          <button onClick={() => pintarCelda('bg-yellow-100 text-yellow-900')} className="w-6 h-6 rounded bg-yellow-100 border border-yellow-300" />
          <button onClick={() => pintarCelda('bg-blue-100 text-blue-900')} className="w-6 h-6 rounded bg-blue-100 border border-blue-300" />
          <button onClick={() => pintarCelda('bg-red-100 text-red-900')} className="w-6 h-6 rounded bg-red-100 border border-red-300" />
          <button onClick={() => pintarCelda('bg-green-100 text-green-900')} className="w-6 h-6 rounded bg-green-100 border border-green-300" />
          <button onClick={() => pintarCelda('')} className="w-6 h-6 rounded bg-white border text-xs text-gray-400">✖</button>
        </div>

        {/* BOTONES IMPORTAR/EXPORTAR */}
        <div className="flex bg-white p-1 rounded-xl border border-gray-200 ml-2 shadow-sm">
          <input type="file" ref={fileInputRef} onChange={importarExcel} accept=".xlsx, .xls, .csv" className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-sm font-bold transition-all">
            <Upload size={16} /> <span className="hidden sm:inline">Importar</span>
          </button>
          <div className="w-px bg-gray-200 mx-1"></div>
          <button onClick={exportarExcel} className="flex items-center gap-1.5 text-green-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-sm font-bold transition-all">
            <Download size={16} /> <span className="hidden sm:inline">Excel</span>
          </button>
        </div>

        <div className="flex -space-x-2 ml-auto pr-4 hidden md:flex">
          {Object.values(activeUsers).map((u: any) => (
            <div key={u.name} title={u.name} className={`inline-flex h-8 w-8 rounded-full ring-2 ring-white items-center justify-center text-xs font-bold text-white ${obtenerColorUsuario(u.name).bg}`}>{u.name.charAt(0).toUpperCase()}</div>
          ))}
        </div>
      </div>

      {/* --- ÁREA DE TABLAS --- */}
      <div className="flex-1 overflow-auto bg-gray-50 flex flex-col gap-4 min-h-0 px-2 pb-4">
        
        {/* TABLA PRINCIPAL: INGRESOS */}
        <div className="bg-white border border-gray-300 shadow-sm flex flex-col rounded-xl overflow-hidden min-h-[300px]">
          <div className="bg-blue-800 text-white px-4 py-2 flex justify-between items-center">
            <h2 className="font-bold">1. Ingresos Principales (Ventas y Servicios)</h2>
            <button onClick={() => agregarFila('rows')} className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-sm font-bold shadow-sm flex items-center gap-1"><Plus size={14}/> Fila</button>
          </div>
          <DataGrid columns={colIngresos} rows={hojaActiva.rows || []} onRowsChange={procesarCambiosMain} onCellClick={(args) => handleCellClick(args, 'rows')} className="flex-1 min-h-[250px]" />
        </div>

        {/* TABLAS SECUNDARIAS (3 COLUMNAS) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[300px]">
          
          <div className="bg-white border border-gray-300 shadow-sm flex flex-col rounded-xl overflow-hidden min-h-[250px]">
            <div className="bg-slate-700 text-white px-4 py-2 flex justify-between items-center">
              <h2 className="font-bold">2. Sueldos y Anticipos</h2>
              <button onClick={() => agregarFila('sueldos')} className="bg-slate-600 hover:bg-slate-500 px-3 py-1 rounded text-sm font-bold flex items-center gap-1"><Plus size={14}/> Fila</button>
            </div>
            <DataGrid columns={colsGastos('sueldos')} rows={hojaActiva.sueldos || []} onRowsChange={(r) => procesarCambiosTabla('sueldos', r)} onCellClick={(args) => handleCellClick(args, 'sueldos')} className="flex-1" />
          </div>

          <div className="bg-white border border-gray-300 shadow-sm flex flex-col rounded-xl overflow-hidden min-h-[250px]">
            <div className="bg-slate-700 text-white px-4 py-2 flex justify-between items-center">
              <h2 className="font-bold">3. Gastos Oficina</h2>
              <button onClick={() => agregarFila('gastosOficina')} className="bg-slate-600 hover:bg-slate-500 px-3 py-1 rounded text-sm font-bold flex items-center gap-1"><Plus size={14}/> Fila</button>
            </div>
            <DataGrid columns={colsGastos('gastosOficina')} rows={hojaActiva.gastosOficina || []} onRowsChange={(r) => procesarCambiosTabla('gastosOficina', r)} onCellClick={(args) => handleCellClick(args, 'gastosOficina')} className="flex-1" />
          </div>

          <div className="bg-white border border-gray-300 shadow-sm flex flex-col rounded-xl overflow-hidden min-h-[250px]">
            <div className="bg-slate-700 text-white px-4 py-2 flex justify-between items-center">
              <h2 className="font-bold">4. Gastos Fijos</h2>
              <button onClick={() => agregarFila('gastosFijos')} className="bg-slate-600 hover:bg-slate-500 px-3 py-1 rounded text-sm font-bold flex items-center gap-1"><Plus size={14}/> Fila</button>
            </div>
            <DataGrid columns={colsGastos('gastosFijos')} rows={hojaActiva.gastosFijos || []} onRowsChange={(r) => procesarCambiosTabla('gastosFijos', r)} onCellClick={(args) => handleCellClick(args, 'gastosFijos')} className="flex-1" />
          </div>

        </div>
      </div>

      {/* --- BARRA INFERIOR DE RESUMEN GLOBAL --- */}
      <div className="bg-blue-900 text-white px-6 py-4 flex gap-4 md:gap-10 text-sm shrink-0 shadow-inner items-center flex-wrap z-10">
        <span className="font-bold uppercase tracking-widest text-blue-300">Resumen Financiero:</span>
        <span className="ml-auto flex items-center gap-3">
          BALANCE GENERAL: 
          <strong className={`px-4 py-1.5 rounded-lg text-lg border shadow-sm ${hojaActiva.balanceGeneral < 0 ? 'bg-red-800 text-red-200 border-red-700' : 'bg-gray-800 text-green-400 border-gray-700'}`}>
            {formatMoney(hojaActiva.balanceGeneral)}
          </strong>
        </span>
      </div>

      {/* --- PESTAÑAS --- */}
      <div className="flex items-center gap-1 pt-1 shrink-0 overflow-x-auto bg-gray-50 border-t border-gray-200 px-2">
        {hojas.map((hoja) => (
          <div key={hoja.id} onClick={() => setHojaActivaId(hoja.id)} className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-t-lg border-x border-t border-b-0 shadow-sm cursor-pointer transition-colors ${hojaActivaId === hoja.id ? 'bg-white text-blue-600 border-t-2 border-t-blue-500 z-10' : 'bg-gray-200 text-gray-500 hover:bg-gray-300 -mb-px'}`}>
            <Wallet size={16} /> <span onDoubleClick={() => renombrarHoja(hoja.id, hoja.nombre)}>{hoja.nombre}</span>
            {hojaActivaId === hoja.id && (
              <div className="flex items-center gap-1 ml-2">
                 <Edit2 size={14} className="hover:text-blue-500 text-gray-400" onClick={(e) => { e.stopPropagation(); renombrarHoja(hoja.id, hoja.nombre); }} />
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