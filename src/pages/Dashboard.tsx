import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { FileSpreadsheet, Plus, BarChart3, Calendar, LayoutDashboard, Search, FileText, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const parseCurrency = (val: any) => {
  if (!val) return 0;
  const num = parseInt(String(val).replace(/[^0-9-]/g, ''));
  return isNaN(num) ? 0 : num;
};

// LECTOR DE FECHAS ESTRICTO
const normalizarFecha = (fechaStr: string) => {
  if (!fechaStr || typeof fechaStr !== 'string' || !fechaStr.includes('-')) return null;
  const [day, month, year] = fechaStr.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  if (isNaN(d.getTime())) return null;

  const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
  const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
  const weekNo = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);

  return {
    mesKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    mesLabel: `${mesesNombres[d.getMonth()]} ${d.getFullYear()}`,
    semanaKey: `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`,
    semanaLabel: `Sem. ${weekNo} - ${d.getFullYear()}`
  };
};

// LAS 4 PLANILLAS CLÁSICAS FIJAS
const PLANILLAS_FIJAS = [
  { id: 'balance-calama', titulo: 'BALANCE CALAMA', tipo: 'balance' },
  { id: 'balance-copiapo', titulo: 'BALANCE COPIAPÓ', tipo: 'balance' },
  { id: 'facturas-calama', titulo: 'FACTURAS CALAMA', tipo: 'factura' },
  { id: 'facturas-copiapo', titulo: 'FACTURAS COPIAPÓ', tipo: 'factura' }
];

export default function Dashboard() {
  const [planillas, setPlanillas] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<string>('TODAS');
  const [vistaTiempo, setVistaTiempo] = useState<'MES' | 'SEMANA'>('MES');
  
  const userName = localStorage.getItem('userName') || 'Usuario';
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'planillas'), (snapshot) => {
      setPlanillas(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const crearPlanilla = async (idPlantilla: string) => {
    await setDoc(doc(db, 'planillas', idPlantilla), {
      creado: new Date().toISOString(), 
      creador: userName,
      hojas: [{ id: 'hoja-1', nombre: 'Mes 1', rows: [], sueldos: [], gastosOficina: [], gastosFijos: [], totalGastosOficina: 0, totalGastosFijos: 0, balanceGeneral: 0 }]
    });
    navigate(`/planilla/${idPlantilla}`);
  };

  const crearNuevaPersonalizada = () => {
    const nombre = prompt('Nombre de la nueva planilla:');
    if (nombre) crearPlanilla(nombre.toLowerCase().replace(/\s+/g, '-'));
  };

  const { listaEmpresas, datosGrafica } = useMemo(() => {
    const empresasSet = new Set<string>();
    const agrupado: any = {};

    planillas.forEach(p => {
      if (p.id.includes('factura')) return;
      (p.hojas || []).forEach((h: any) => {
        (h.rows || []).forEach((row: any) => {
          const vNeta = parseCurrency(row.ventaNeta);
          const vBalance = parseCurrency(row.balanceIngreso);
          const emp = String(row.empresa || row.cliente || '').trim().toUpperCase();
          
          if (emp) empresasSet.add(emp);

          const f = normalizarFecha(row.fecha);
          if (f && emp) {
            if (empresaSeleccionada === 'TODAS' || empresaSeleccionada === emp) {
              const key = vistaTiempo === 'MES' ? f.mesKey : f.semanaKey;
              const label = vistaTiempo === 'MES' ? f.mesLabel : f.semanaLabel;

              if (!agrupado[key]) agrupado[key] = { name: label, sortKey: key, "Venta Neta": 0, "Balance Real": 0 };
              agrupado[key]["Venta Neta"] += vNeta;
              agrupado[key]["Balance Real"] += vBalance;
            }
          }
        });
      });
    });

    const graficaOrdenada = Object.values(agrupado).sort((a: any, b: any) => a.sortKey.localeCompare(b.sortKey));
    return { listaEmpresas: Array.from(empresasSet).sort(), datosGrafica: graficaOrdenada };
  }, [planillas, empresaSeleccionada, vistaTiempo]);

  const filteredPlanillas = planillas.filter(p => p.id.includes(searchTerm.toLowerCase()) && !PLANILLAS_FIJAS.find(pf => pf.id === p.id));

  return (
    <div className="flex h-screen bg-[#f8fafc]">
      {/* MENÚ LATERAL */}
      <div className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-2xl font-black text-green-600 tracking-tight">Ecopanta</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link to="/dashboard" className="flex items-center gap-3 bg-green-50 text-green-700 px-4 py-3 rounded-xl font-bold">
            <LayoutDashboard size={20} /> Dashboard
          </Link>
        </nav>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 md:p-10 max-w-7xl mx-auto">
          
          <div className="flex justify-between items-end mb-10">
            <div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">Panel Principal</h2>
              <p className="text-slate-500 mt-1 font-medium">Bienvenido, {userName}</p>
            </div>
            <button onClick={crearNuevaPersonalizada} className="bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-900 shadow-sm transition-transform active:scale-95">
              <Plus size={20} /> Planilla Extra
            </button>
          </div>

          {/* --- LAS 4 PLANILLAS CLÁSICAS --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {PLANILLAS_FIJAS.map((pf) => {
              const existe = planillas.find(p => p.id === pf.id);
              const esFactura = pf.tipo === 'factura';

              if (existe) {
                return (
                  <Link key={pf.id} to={`/planilla/${pf.id}`} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-lg transition-all group flex flex-col justify-center items-center gap-5 h-52 relative overflow-hidden">
                    <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-10 transition-transform group-hover:scale-150 ${esFactura ? 'bg-purple-500' : 'bg-blue-500'}`}></div>
                    <div className={`p-4 rounded-2xl text-white shadow-inner transition-transform group-hover:-translate-y-1 ${esFactura ? 'bg-gradient-to-br from-purple-500 to-purple-600' : 'bg-gradient-to-br from-blue-500 to-blue-600'}`}>
                      {esFactura ? <FileText size={36} /> : <Wallet size={36} />}
                    </div>
                    <div className="text-center z-10">
                      <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight leading-tight">{pf.titulo}</h3>
                      <span className="px-3 py-1 mt-2 inline-block bg-slate-100 text-slate-500 text-xs font-bold rounded-full">
                        {existe.hojas?.length || 1} Pestañas
                      </span>
                    </div>
                  </Link>
                );
              } else {
                return (
                  <button key={pf.id} onClick={() => crearPlanilla(pf.id)} className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-3xl flex flex-col justify-center items-center gap-3 h-52 hover:bg-slate-100 hover:border-blue-400 transition-colors text-slate-500 group">
                    <div className="p-3 bg-white rounded-full shadow-sm group-hover:text-blue-500"><Plus size={28} /></div>
                    <span className="font-bold text-center px-4">Crear<br/>{pf.titulo}</span>
                  </button>
                );
              }
            })}
          </div>

          {/* --- GRÁFICA ADAPTATIVA --- */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 md:p-8 mb-10">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6 border-b border-slate-100 pb-6">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                <div className="p-2 bg-green-50 rounded-lg text-green-600"><BarChart3 size={24} /></div> 
                Analítica de Ventas y Balance
              </h2>
              
              <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                <select value={empresaSeleccionada} onChange={(e) => setEmpresaSeleccionada(e.target.value)} className="flex-1 lg:flex-none bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="TODAS">TODOS LOS CLIENTES (GLOBAL)</option>
                  {listaEmpresas.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
                  <button onClick={() => setVistaTiempo('MES')} className={`flex-1 sm:flex-none px-6 py-2 text-xs font-black rounded-lg transition-all ${vistaTiempo === 'MES' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>MES</button>
                  <button onClick={() => setVistaTiempo('SEMANA')} className={`flex-1 sm:flex-none px-6 py-2 text-xs font-black rounded-lg transition-all ${vistaTiempo === 'SEMANA' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>SEMANA</button>
                </div>
              </div>
            </div>

            <div className="h-80 w-full">
              {datosGrafica.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosGrafica}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 600}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 600}} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} dx={-10} />
                    <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'}} formatter={(value: number) => [`$${value.toLocaleString('es-CL')}`, '']} />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar dataKey="Venta Neta" name="Venta Neta (Ingreso Bruto)" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={40} />
                    <Bar dataKey="Balance Real" name="Balance (Ganancia Neta)" fill="#10b981" radius={[6, 6, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                  <Calendar size={56} className="opacity-30" />
                  <p className="font-bold text-slate-500">No hay datos de ventas.</p>
                </div>
              )}
            </div>
          </div>

          {/* --- OTRAS PLANILLAS (EXTRA) --- */}
          {filteredPlanillas.length > 0 && (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h2 className="text-xl font-black text-slate-800">Otras Planillas</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {filteredPlanillas.map((p) => (
                  <div key={p.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center border border-slate-200">
                        <FileSpreadsheet size={24} />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 uppercase group-hover:text-blue-600 transition-colors">{p.id.replace(/-/g, ' ')}</h3>
                      </div>
                    </div>
                    <Link to={`/planilla/${p.id}`} className="px-5 py-2 text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-100 rounded-lg transition-all">Abrir</Link>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}