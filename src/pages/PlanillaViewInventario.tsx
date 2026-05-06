import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, Plus, X, Edit2, Package, Boxes, Wrench, PaintBucket, Download, FileDown } from 'lucide-react';
import DataGrid, { textEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import 'react-data-grid/lib/styles.css';

// --- UTILIDADES ---
const crearFilaVacia = (id: number) => ({ 
  id, item: '', categoria: 'Herramienta', cantidad: '1', valorUnitario: '0', 
  valorTotal: '0', estado: 'Operativo', ubicacion: '', observaciones: '', format: {} 
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

const obtenerColorUsuario = (nombre: string) => {
  const p = [{ bg: 'bg-blue-500', border: 'ring-blue-500' }, { bg: 'bg-red-500', border: 'ring-red-500' }, { bg: 'bg-green-500', border: 'ring-green-500' }, { bg: 'bg-purple-500', border: 'ring-purple-500' }];
  let h = 0; for(let i=0;i<nombre.length;i++) h+=nombre.charCodeAt(i); return p[h%p.length];
};

export default function PlanillaViewInventario() {
  const { id } = useParams();
  const userName = sessionStorage.getItem('userName') || 'Invitado';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- ESTADOS ---
  const [hojas, setHojas] = useState<any[]>([{ id: 'hoja-1', nombre: 'Bodega Principal', rows: [crearFilaVacia(1)] }]);
  const [hojaActivaId, setHojaActivaId] = useState<string>('hoja-1');
  const [activeUsers, setActiveUsers] = useState<any>({});
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{rowId: number, columnKey: string} | null>(null);

  const hojaActiva = hojas.find(h => h.id === hojaActivaId) || hojas[0];

  // --- CÁLCULOS DEL PANEL DE INVENTARIO ---
  const kpis = useMemo(() => {
    let totalItems = 0;
    let valorTotalInventario = 0;
    let valorHerramientas = 0;

    (hojaActiva.rows || []).forEach((r: any) => {
      const cant = parseInt(r.cantidad) || 0;
      const vTotal = parseCurrency(r.valorTotal);
      const cat = (r.categoria || '').toLowerCase();

      totalItems += cant;
      valorTotalInventario += vTotal;
      if (cat.includes('herramienta') || cat.includes('activo')) {
        valorHerramientas += vTotal;
      }
    });

    return { totalItems, valorTotalInventario, valorHerramientas };
  }, [hojaActiva.rows]);

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
    // Auto-calcular Valor Total (Cantidad * Valor Unitario)
    const filasCalculadas = nuevasFilas.map(fila => {
      const cant = parseInt(fila.cantidad) || 0;
      const unitario = parseCurrency(fila.valorUnitario);
      return { ...fila, valorTotal: String(cant * unitario) };
    });

    const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: filasCalculadas } : h);
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
    const nuevoNombre = prompt('Nombre de la nueva Bodega o Ubicación:'); if (!nuevoNombre) return;
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

  // --- EXPORTAR A EXCEL Y PDF ---
  const exportarExcel = () => {
    const datosMapeados = hojaActiva.rows.map((r: any) => ({
      "CÓDIGO": `INV-${r.id}`,
      "ITEM / DESCRIPCIÓN": r.item || '',
      "CATEGORÍA": r.categoria || '',
      "CANTIDAD": parseInt(r.cantidad) || 0,
      "VALOR UNITARIO": parseCurrency(r.valorUnitario),
      "VALOR TOTAL": parseCurrency(r.valorTotal),
      "ESTADO": r.estado || '',
      "UBICACIÓN / ASIGNADO": r.ubicacion || '',
      "OBSERVACIONES": r.observaciones || ''
    }));

    const ws = XLSX.utils.json_to_sheet(datosMapeados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, hojaActiva.nombre);
    XLSX.writeFile(wb, `Inventario_${hojaActiva.nombre}.xlsx`);
  };

  const exportarPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(16);
    doc.text(`Reporte de Inventario y Activos`, 14, 15);
    
    doc.setFontSize(10);
    doc.text(`Ubicación: ${hojaActiva.nombre}`, 14, 23);
    doc.text(`Valor Total Inventario: ${formatMoney(kpis.valorTotalInventario)}`, 100, 23);

    const tableData = hojaActiva.rows.map((r: any) => [
      `INV-${r.id}`, r.item || '', r.categoria || '', r.cantidad || '0',
      formatMoney(r.valorUnitario), formatMoney(r.valorTotal), r.ubicacion || ''
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['CÓDIGO', 'ITEM', 'CATEGORÍA', 'CANT', 'V. UNITARIO', 'V. TOTAL', 'ASIGNADO A']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [249, 115, 22] } // orange-500
    });

    doc.save(`Inventario_${hojaActiva.nombre}.pdf`);
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
        let idxItem = -1, idxCat = -1, idxCant = -1, idxVUnit = -1, idxUbi = -1, idxEst = -1;

        for (let i = 0; i < rawData.length; i++) {
          const rowArr = rawData[i] as string[];
          const rowStr = rowArr.join(' ').toUpperCase();
          if (!rowStr.trim()) continue;

          if (estado === 'BUSCANDO_TITULOS') {
            if (rowStr.includes('ITEM') || rowStr.includes('DESCRIPCION') || rowStr.includes('CANTIDAD')) {
              estado = 'EXTRAYENDO_DATOS';
              mainHeaders = rowArr.map(h => String(h).toUpperCase().trim());
              
              idxItem = mainHeaders.findIndex(h => h.includes('ITEM') || h.includes('DESCRIPCION'));
              idxCat = mainHeaders.findIndex(h => h.includes('CATEGORIA') || h.includes('TIPO'));
              idxCant = mainHeaders.findIndex(h => h.includes('CANTIDAD') || h === 'CANT');
              idxVUnit = mainHeaders.findIndex(h => h.includes('UNITARIO') || h.includes('VALOR'));
              idxUbi = mainHeaders.findIndex(h => h.includes('UBICACION') || h.includes('ASIGNADO'));
              idxEst = mainHeaders.findIndex(h => h.includes('ESTADO'));
              continue;
            }
          }

          if (estado === 'EXTRAYENDO_DATOS') {
            if (rowStr.includes('TOTAL GENERAL')) { estado = 'BUSCANDO_TITULOS'; continue; }

            const valItem = idxItem !== -1 ? rowArr[idxItem] : '';
            const valCat = idxCat !== -1 ? rowArr[idxCat] : 'General';
            const valCant = idxCant !== -1 ? rowArr[idxCant] : '1';
            const valVUnit = idxVUnit !== -1 ? rowArr[idxVUnit] : '0';
            const valUbi = idxUbi !== -1 ? rowArr[idxUbi] : '';
            const valEst = idxEst !== -1 ? rowArr[idxEst] : 'Operativo';

            if (!valItem && parseCurrency(valVUnit) === 0) continue;

            const c = parseInt(valCant) || 0;
            const vu = parseCurrency(valVUnit);
            const vt = String(c * vu);

            hojaObj.rows.push({
              id: idBase++, item: valItem, categoria: valCat, cantidad: String(c),
              valorUnitario: valVUnit, valorTotal: vt, estado: valEst, ubicacion: valUbi, observaciones: '', format: {}
            });
          }
        }
        if (hojaObj.rows.length === 0) hojaObj.rows.push(crearFilaVacia(idBase++));
        hojasExtraidas.push(hojaObj);
      });

      if (hojasExtraidas.length > 0) {
        const nh = modoReemplazo ? hojasExtraidas : [...hojas, ...hojasExtraidas];
        setHojas(nh); setHojaActivaId(nh[0].id); guardarEnNube(nh);
      } else { alert("No se detectó la estructura de Inventario. Revisa tu Excel."); }
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
    { key: 'id', name: 'CÓDIGO', width: 90, resizable: true, renderCell: (p: any) => <strong className="text-orange-700 bg-orange-50 px-2 py-1 rounded">INV-{p.row.id}</strong> },
    { key: 'item', name: 'ITEM / DESCRIPCIÓN', renderEditCell: textEditor, width: 350, resizable: true, cellClass: (r: any) => getCellClass(r, 'item') },
    { key: 'categoria', name: 'CATEGORÍA (Activo, Herramienta, Insumo)', renderEditCell: textEditor, width: 250, resizable: true, cellClass: (r: any) => getCellClass(r, 'categoria') },
    { key: 'cantidad', name: 'CANTIDAD', renderEditCell: textEditor, width: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'cantidad') },
    { key: 'valorUnitario', name: 'VALOR UNIT.', renderEditCell: textEditor, width: 150, resizable: true, renderCell: (p:any) => formatMoney(p.row.valorUnitario), cellClass: (r: any) => getCellClass(r, 'valorUnitario') },
    { key: 'valorTotal', name: 'VALOR TOTAL', width: 150, resizable: true, renderCell: (p:any) => <strong className="text-orange-600">{formatMoney(p.row.valorTotal)}</strong> },
    { key: 'estado', name: 'ESTADO (Nuevo, Usado, Dañado)', renderEditCell: textEditor, width: 200, resizable: true, cellClass: (r: any) => getCellClass(r, 'estado') },
    { key: 'ubicacion', name: 'UBICACIÓN / ASIGNADO A', renderEditCell: textEditor, width: 250, resizable: true, cellClass: (r: any) => getCellClass(r, 'ubicacion') },
    { key: 'observaciones', name: 'OBSERVACIONES', renderEditCell: textEditor, width: 300, resizable: true, cellClass: (r: any) => getCellClass(r, 'observaciones') }
  ], [hojaActivaId, activeUsers]);

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden relative">
      <style>{`.rdg { --rdg-border-color: #e2e8f0; height: 100%; border: none; border-radius: 12px;} .rdg-cell { border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; padding: 0 12px; } .rdg-header-cell { background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; font-weight: 800; color: #475569; } `}</style>

      {/* --- TOOLBAR --- */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center shrink-0 shadow-sm z-10 overflow-x-auto">
        <Link to="/dashboard" className="text-slate-400 hover:text-orange-600 transition-colors mr-4"><ArrowLeft size={24} /></Link>
        <div className="flex items-center gap-3 mr-4">
          <div className="bg-orange-100 p-2 rounded-lg text-orange-600"><Package size={24} /></div>
          <div>
            <h1 className="text-xl font-black uppercase text-slate-800 tracking-tight leading-none min-w-[200px]">{id?.replace(/-/g, ' ')}</h1>
            <p className="text-xs font-bold text-slate-400 mt-0.5">Control de Inventario y Activos</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 hidden md:flex">
            <PaintBucket size={16} className="text-slate-400 mx-1 self-center" />
            <button onClick={() => pintarCelda('bg-yellow-100 text-yellow-900')} className="w-5 h-5 rounded bg-yellow-100 border border-yellow-300 mx-0.5" />
            <button onClick={() => pintarCelda('bg-orange-100 text-orange-900')} className="w-5 h-5 rounded bg-orange-100 border border-orange-300 mx-0.5" />
            <button onClick={() => pintarCelda('bg-red-100 text-red-900')} className="w-5 h-5 rounded bg-red-100 border border-red-300 mx-0.5" />
            <button onClick={() => pintarCelda('')} className="w-5 h-5 rounded bg-white border border-slate-300 text-[10px] flex items-center justify-center text-slate-400 mx-0.5">✖</button>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <input type="file" ref={fileInputRef} onChange={importarExcel} accept=".xlsx, .xls, .csv" className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 text-slate-600 hover:bg-white px-3 py-1.5 rounded-lg text-sm font-bold transition-all">
              <Upload size={16} /> <span className="hidden sm:inline">Importar</span>
            </button>
            <div className="w-px bg-slate-200 mx-1"></div>
            <button onClick={exportarExcel} className="flex items-center gap-1.5 text-green-600 hover:bg-white px-3 py-1.5 rounded-lg text-sm font-bold transition-all">
              <Download size={16} /> <span className="hidden sm:inline">Excel</span>
            </button>
            <button onClick={exportarPDF} className="flex items-center gap-1.5 text-red-600 hover:bg-white px-3 py-1.5 rounded-lg text-sm font-bold transition-all">
              <FileDown size={16} /> <span className="hidden sm:inline">PDF</span>
            </button>
          </div>
          
          <button onClick={agregarFila} className="flex items-center gap-2 text-white px-4 md:px-5 py-2 text-sm font-bold rounded-xl shadow-md bg-orange-600 hover:bg-orange-700 transition-all hover:-translate-y-0.5 whitespace-nowrap"><Plus size={18} /> Item</button>
        </div>
      </div>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <div className="flex-1 overflow-auto p-4 md:p-6 flex flex-col gap-6">
        
        {/* TARJETAS DE INDICADORES (KPIs) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 text-orange-50 opacity-50 group-hover:scale-110 transition-transform"><Boxes size={120}/></div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Items en Bodega</p>
            <h3 className="text-4xl font-black text-slate-800 relative z-10">{kpis.totalItems}</h3>
            <p className="text-xs font-medium text-slate-400 mt-2 relative z-10">Unidades físicas registradas</p>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 text-blue-50 opacity-50 group-hover:scale-110 transition-transform"><Wrench size={120}/></div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1 relative z-10">Inversión en Herramientas</p>
            <h3 className="text-3xl font-black text-blue-600 relative z-10">{formatMoney(kpis.valorHerramientas)}</h3>
            <p className="text-xs font-medium text-slate-400 mt-3 relative z-10">Suma de activos y herramientas</p>
          </div>

          <div className="bg-orange-500 rounded-3xl p-6 border border-orange-600 shadow-sm relative overflow-hidden group text-white">
            <div className="absolute -right-6 -top-6 opacity-20 group-hover:scale-110 transition-transform"><Package size={120}/></div>
            <p className="text-sm font-bold uppercase tracking-widest mb-1 relative z-10 text-orange-100">Valor Total Inventario</p>
            <h3 className="text-3xl font-black relative z-10">{formatMoney(kpis.valorTotalInventario)}</h3>
            <p className="text-sm font-medium mt-3 relative z-10 flex items-center gap-2 text-orange-100">
              Capital total inmovilizado
            </p>
          </div>
        </div>

        {/* TABLA DE INVENTARIO */}
        <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-[400px]">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-black text-slate-800">Registro de Existencias</h3>
            <p className="text-xs font-bold text-slate-400 bg-slate-200 px-3 py-1 rounded-full hidden sm:block">El Valor Total se calcula automáticamente</p>
          </div>
          <div className="flex-1 min-h-0 overflow-x-auto w-full p-2">
            <DataGrid columns={columnas} rows={hojaActiva.rows} onRowsChange={procesarCambiosMain} onCellClick={handleCellClick} className="h-full w-full min-w-[800px] border-none" style={{ minHeight: 0 }} />
          </div>
        </div>

      </div>

      {/* --- PESTAÑAS INFERIORES --- */}
      <div className="flex items-center gap-1 shrink-0 overflow-x-auto bg-slate-200 px-4 pt-2 border-t border-slate-300">
        {hojas.map((hoja) => (
          <div key={hoja.id} onClick={() => setHojaActivaId(hoja.id)} className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-t-xl cursor-pointer transition-all ${hojaActivaId === hoja.id ? 'bg-white text-orange-600 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]' : 'bg-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
            <Package size={16} /> <span onDoubleClick={() => renombrarHoja(hoja.id, hoja.nombre)}>{hoja.nombre}</span>
            {hojaActivaId === hoja.id && (
              <div className="flex items-center gap-2 ml-3 pl-3 border-l border-orange-100">
                 <Edit2 size={14} className="hover:text-orange-500 text-slate-300" onClick={(e) => { e.stopPropagation(); renombrarHoja(hoja.id, hoja.nombre); }} />
                 {hojas.length > 1 && (<X size={14} className="text-slate-300 hover:text-red-500" onClick={(e) => { e.stopPropagation(); eliminarHoja(hoja.id); }} />)}
              </div>
            )}
          </div>
        ))}
        <button onClick={agregarHoja} className="flex items-center justify-center px-4 py-2.5 ml-1 rounded-t-xl text-slate-500 hover:bg-slate-300 hover:text-slate-800 font-bold transition-colors"><Plus size={18} /> Nueva Bodega</button>
      </div>

    </div>
  );
}