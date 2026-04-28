import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, Plus, FileText, X, Edit2, Landmark, Wallet, TrendingDown, PiggyBank, PaintBucket } from 'lucide-react';
import DataGrid, { textEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import 'react-data-grid/lib/styles.css';

// --- UTILIDADES ---
const crearFilaVacia = (id: number) => ({ 
  id, fecha: '', concepto: '', categoria: 'General', responsable: '', monto: '0', format: {} 
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
  return str;
};

const obtenerColorUsuario = (nombre: string) => {
  const p = [{ bg: 'bg-blue-500', border: 'ring-blue-500' }, { bg: 'bg-red-500', border: 'ring-red-500' }, { bg: 'bg-green-500', border: 'ring-green-500' }, { bg: 'bg-purple-500', border: 'ring-purple-500' }];
  let h = 0; for(let i=0;i<nombre.length;i++) h+=nombre.charCodeAt(i); return p[h%p.length];
};

const COLORES_GRAFICO = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function PlanillaViewCentroCostos() {
  const { id } = useParams();
  const userName = sessionStorage.getItem('userName') || 'Invitado';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- ESTADOS ---
  const [hojas, setHojas] = useState<any[]>([{ id: 'hoja-1', nombre: 'Mes 1', rows: [crearFilaVacia(1)], presupuesto: 0 }]);
  const [hojaActivaId, setHojaActivaId] = useState<string>('hoja-1');
  const [activeUsers, setActiveUsers] = useState<any>({});
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{rowId: number, columnKey: string} | null>(null);

  const [editandoPresupuesto, setEditandoPresupuesto] = useState(false);
  const [tempPresupuesto, setTempPresupuesto] = useState('');

  const hojaActiva = hojas.find(h => h.id === hojaActivaId) || hojas[0];
  const presupuestoActual = hojaActiva.presupuesto || 0;

  // --- CÁLCULOS DEL PANEL ---
  const totalGastado = useMemo(() => {
    return (hojaActiva.rows || []).reduce((sum: number, r: any) => sum + parseCurrency(r.monto), 0);
  }, [hojaActiva.rows]);

  const saldoDisponible = presupuestoActual - totalGastado;
  const porcentajeGastado = presupuestoActual > 0 ? (totalGastado / presupuestoActual) * 100 : 0;

  // Datos para el Gráfico de Dona
  const datosGrafico = useMemo(() => {
    const categorias: any = {};
    (hojaActiva.rows || []).forEach((r: any) => {
      const val = parseCurrency(r.monto);
      if (val > 0) {
        const cat = r.categoria?.trim() || 'Sin Categoría';
        categorias[cat] = (categorias[cat] || 0) + val;
      }
    });
    return Object.keys(categorias)
      .map(k => ({ name: k, value: categorias[k] }))
      .sort((a, b) => b.value - a.value);
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
    const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: nuevasFilas } : h);
    setHojas(nh); guardarEnNube(nh);
  };

  const actualizarPresupuesto = () => {
    setEditandoPresupuesto(false);
    const nuevoValor = parseCurrency(tempPresupuesto);
    const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, presupuesto: nuevoValor } : h);
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
    const nuevoNombre = prompt('Nombre del nuevo Centro (Ej: Mes 2, Proyecto B):'); if (!nuevoNombre) return;
    const nuevaHojaId = `hoja-${Date.now()}`;
    const nuevasHojas = [...hojas, { id: nuevaHojaId, nombre: nuevoNombre, rows: [crearFilaVacia(1)], presupuesto: 0 }];
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

  // --- LAS FUNCIONES QUE FALTABAN ---
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
        let hojaObj = { id: `hoja-${Date.now()}-${sheetIndex}`, nombre: sheetName, rows: [] as any[], presupuesto: 0 };
        
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
    { key: 'id', name: 'CÓDIGO', width: 90, resizable: true, renderCell: (p: any) => <strong className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded">SV-{p.row.id}</strong> },
    { key: 'fecha', name: 'FECHA', renderEditCell: textEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'fecha') },
    { key: 'concepto', name: 'CONCEPTO / DESCRIPCIÓN', renderEditCell: textEditor, width: 350, resizable: true, cellClass: (r: any) => getCellClass(r, 'concepto') },
    { key: 'categoria', name: 'CATEGORÍA (Sueldos, Insumos...)', renderEditCell: textEditor, width: 250, resizable: true, cellClass: (r: any) => getCellClass(r, 'categoria') },
    { key: 'responsable', name: 'RESPONSABLE', renderEditCell: textEditor, width: 200, resizable: true, cellClass: (r: any) => getCellClass(r, 'responsable') },
    { key: 'monto', name: 'MONTO DE GASTO', renderEditCell: textEditor, width: 150, resizable: true, renderCell: (p:any) => formatMoney(p.row.monto), cellClass: (r: any) => getCellClass(r, 'monto') }
  ], [hojaActivaId, activeUsers]);

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden relative">
      <style>{`.rdg { --rdg-border-color: #e2e8f0; height: 100%; border: none; border-radius: 12px;} .rdg-cell { border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; padding: 0 12px; } .rdg-header-cell { background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; font-weight: 800; color: #475569; } `}</style>

      {/* --- TOOLBAR --- */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center shrink-0 shadow-sm z-10">
        <Link to="/dashboard" className="text-slate-400 hover:text-emerald-600 transition-colors mr-4"><ArrowLeft size={24} /></Link>
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600"><Landmark size={24} /></div>
          <div>
            <h1 className="text-xl font-black uppercase text-slate-800 tracking-tight leading-none">{id?.replace(/-/g, ' ')}</h1>
            <p className="text-xs font-bold text-slate-400 mt-0.5">Centro de Costos y Panel Financiero</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 mr-2">
            <PaintBucket size={16} className="text-slate-400 mx-1" />
            <button onClick={() => pintarCelda('bg-yellow-100 text-yellow-900')} className="w-5 h-5 rounded bg-yellow-100 border border-yellow-300" />
            <button onClick={() => pintarCelda('bg-emerald-100 text-emerald-900')} className="w-5 h-5 rounded bg-emerald-100 border border-emerald-300" />
            <button onClick={() => pintarCelda('bg-red-100 text-red-900')} className="w-5 h-5 rounded bg-red-100 border border-red-300" />
            <button onClick={() => pintarCelda('')} className="w-5 h-5 rounded bg-white border border-slate-300 text-[10px] flex items-center justify-center text-slate-400">✖</button>
          </div>
          <div className="flex -space-x-2 mr-4">
            {Object.values(activeUsers).map((u: any) => (
              <div key={u.name} title={u.name} className={`inline-flex h-8 w-8 rounded-full ring-2 ring-white items-center justify-center text-xs font-bold text-white shadow-sm ${obtenerColorUsuario(u.name).bg}`}>{u.name.charAt(0).toUpperCase()}</div>
            ))}
          </div>
          
          <input type="file" ref={fileInputRef} onChange={importarExcel} accept=".xlsx, .xls, .csv" className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-slate-600 bg-white border border-slate-200 px-4 py-2 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 transition-all"><Upload size={16} /> Importar</button>
          
          <button onClick={agregarFila} className="flex items-center gap-2 text-white px-5 py-2 text-sm font-bold rounded-xl shadow-md bg-emerald-600 hover:bg-emerald-700 transition-all hover:-translate-y-0.5"><Plus size={18} /> Gasto</button>
        </div>
      </div>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <div className="flex-1 overflow-auto p-4 md:p-6 flex flex-col gap-6">
        
        {/* TARJETAS DE INDICADORES (KPIs) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
          
          {/* TARJETA 1: PRESUPUESTO ASIGNADO */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 text-blue-50 opacity-50 group-hover:scale-110 transition-transform"><Wallet size={120}/></div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1 relative z-10">Presupuesto Base</p>
            {editandoPresupuesto ? (
              <input 
                autoFocus 
                type="text" 
                value={tempPresupuesto} 
                onChange={(e) => setTempPresupuesto(e.target.value)} 
                onBlur={actualizarPresupuesto} 
                onKeyDown={(e) => e.key === 'Enter' && actualizarPresupuesto()}
                className="text-3xl font-black text-slate-800 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1 outline-none w-full relative z-10" 
                placeholder="Ej: 5000000"
              />
            ) : (
              <h3 onClick={() => { setTempPresupuesto(String(presupuestoActual)); setEditandoPresupuesto(true); }} className="text-3xl font-black text-slate-800 cursor-pointer hover:text-blue-600 flex items-center gap-2 relative z-10">
                {formatMoney(presupuestoActual)} <Edit2 size={16} className="text-slate-300"/>
              </h3>
            )}
            <p className="text-xs font-medium text-slate-400 mt-3 relative z-10">Haz clic en el monto para editarlo</p>
          </div>

          {/* TARJETA 2: TOTAL GASTADO */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 text-red-50 opacity-50 group-hover:scale-110 transition-transform"><TrendingDown size={120}/></div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Gastado</p>
            <h3 className="text-3xl font-black text-red-500 relative z-10">{formatMoney(totalGastado)}</h3>
            
            {/* Barra de progreso de gastos */}
            <div className="w-full bg-slate-100 h-2 rounded-full mt-4 overflow-hidden relative z-10">
              <div className={`h-full rounded-full ${porcentajeGastado > 90 ? 'bg-red-500' : porcentajeGastado > 75 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(porcentajeGastado, 100)}%` }}></div>
            </div>
            <p className="text-xs font-bold text-slate-400 mt-2 relative z-10 text-right">{porcentajeGastado.toFixed(1)}% consumido</p>
          </div>

          {/* TARJETA 3: SALDO DISPONIBLE */}
          <div className={`rounded-3xl p-6 border shadow-sm relative overflow-hidden group ${saldoDisponible < 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-500 border-emerald-600 text-white'}`}>
            <div className="absolute -right-6 -top-6 opacity-20 group-hover:scale-110 transition-transform"><PiggyBank size={120} className={saldoDisponible < 0 ? 'text-red-500' : 'text-white'}/></div>
            <p className={`text-sm font-bold uppercase tracking-widest mb-1 relative z-10 ${saldoDisponible < 0 ? 'text-red-400' : 'text-emerald-100'}`}>Saldo Disponible</p>
            <h3 className={`text-3xl font-black relative z-10 ${saldoDisponible < 0 ? 'text-red-600' : 'text-white'}`}>{formatMoney(saldoDisponible)}</h3>
            <p className={`text-sm font-medium mt-3 relative z-10 flex items-center gap-2 ${saldoDisponible < 0 ? 'text-red-500' : 'text-emerald-100'}`}>
              {saldoDisponible < 0 ? '¡Atención! Presupuesto excedido' : 'Fondo saludable para operar'}
            </p>
          </div>
        </div>

        {/* SECCIÓN INFERIOR: GRÁFICO Y TABLA */}
        <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
          
          {/* PANEL IZQUIERDO: GRÁFICA DE CATEGORÍAS */}
          <div className="w-full lg:w-1/3 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col shrink-0 lg:min-h-[400px]">
            <h3 className="text-lg font-black text-slate-800 mb-6 border-b border-slate-100 pb-4">Desglose por Categoría</h3>
            
            {datosGrafico.length > 0 ? (
              <div className="flex-1 flex flex-col">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={datosGrafico} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                        {datosGrafico.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORES_GRAFICO[index % COLORES_GRAFICO.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString('es-CL')}`} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-3 flex-1 overflow-y-auto pr-2">
                  {datosGrafico.map((cat, i) => (
                    <div key={cat.name} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORES_GRAFICO[i % COLORES_GRAFICO.length] }}></div>
                        <span className="font-bold text-slate-600 truncate max-w-[120px]" title={cat.name}>{cat.name}</span>
                      </div>
                      <span className="font-black text-slate-800">{formatMoney(cat.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 font-medium text-center p-6 border-2 border-dashed border-slate-100 rounded-2xl">
                Añade registros en la tabla para ver el gráfico
              </div>
            )}
          </div>

          {/* PANEL DERECHO: TABLA DE GASTOS */}
          <div className="w-full lg:w-2/3 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-[400px]">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-black text-slate-800">Registro de Movimientos</h3>
              <p className="text-xs font-bold text-slate-400 bg-slate-200 px-3 py-1 rounded-full hidden sm:block">Escribe "Sueldos" o "Materiales" en Categoría para agrupar</p>
            </div>
            <div className="flex-1 min-h-0 overflow-x-auto w-full p-2">
              <DataGrid columns={columnas} rows={hojaActiva.rows} onRowsChange={procesarCambiosMain} onCellClick={handleCellClick} className="h-full w-full min-w-[800px] border-none" style={{ minHeight: 0 }} />
            </div>
          </div>

        </div>
      </div>

      {/* --- PESTAÑAS INFERIORES --- */}
      <div className="flex items-center gap-1 shrink-0 overflow-x-auto bg-slate-200 px-4 pt-2 border-t border-slate-300">
        {hojas.map((hoja) => (
          <div key={hoja.id} onClick={() => setHojaActivaId(hoja.id)} className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-t-xl cursor-pointer transition-all ${hojaActivaId === hoja.id ? 'bg-white text-emerald-600 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]' : 'bg-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
            <Landmark size={16} /> <span onDoubleClick={() => renombrarHoja(hoja.id, hoja.nombre)}>{hoja.nombre}</span>
            {hojaActivaId === hoja.id && (
              <div className="flex items-center gap-2 ml-3 pl-3 border-l border-emerald-100">
                 <Edit2 size={14} className="hover:text-emerald-500 text-slate-300" onClick={(e) => { e.stopPropagation(); renombrarHoja(hoja.id, hoja.nombre); }} />
                 {hojas.length > 1 && (<X size={14} className="text-slate-300 hover:text-red-500" onClick={(e) => { e.stopPropagation(); eliminarHoja(hoja.id); }} />)}
              </div>
            )}
          </div>
        ))}
        <button onClick={agregarHoja} className="flex items-center justify-center px-4 py-2.5 ml-1 rounded-t-xl text-slate-500 hover:bg-slate-300 hover:text-slate-800 font-bold transition-colors"><Plus size={18} /> Nuevo Mes</button>
      </div>

    </div>
  );
}