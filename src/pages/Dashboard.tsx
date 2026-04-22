import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { 
  FileSpreadsheet, Plus, DollarSign, TrendingUp, 
  Clock, Search, BarChart3, Building2, 
  Calendar, Users 
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// --- UTILIDADES DE LIMPIEZA ---
const parseCurrency = (val: any) => {
  if (!val) return 0;
  const num = parseInt(String(val).replace(/[^0-9-]/g, ''));
  return isNaN(num) ? 0 : num;
};

// NORMALIZADOR DE FECHAS ESTRICTO
const normalizarFecha = (fechaStr: string) => {
  if (!fechaStr) return null;
  let d: Date | null = null;

  // Si viene del nuevo importador con formato exacto (DD-MM-YYYY)
  if (typeof fechaStr === 'string' && fechaStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
    const [day, month, year] = fechaStr.split('-');
    d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  } else {
    // Intento genérico si quedó algún dato viejo
    d = new Date(fechaStr);
  }

  if (!d || isNaN(d.getTime())) return null;

  const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const mesLabel = `${mesesNombres[d.getMonth()]} ${d.getFullYear()}`;

  // Cálculo de Semana real
  const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
  const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
  const weekNo = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  const semanaKey = `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  const semanaLabel = `Sem. ${weekNo} - ${d.getFullYear()}`;

  return { mesKey, mesLabel, semanaKey, semanaLabel };
};

export default function Dashboard() {
  const [planillas, setPlanillas] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<string>('TODAS');
  const [vistaTiempo, setVistaTiempo] = useState<'MES' | 'SEMANA'>('MES');
  
  const userName = localStorage.getItem('userName') || 'Usuario';

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'planillas'), (snapshot) => {
      setPlanillas(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const crearNuevaPlanilla = async () => {
    const nombre = prompt('Nombre de la nueva planilla (Ej: balance-calama-2026):');
    if (nombre) {
      const formattedName = nombre.toLowerCase().replace(/\s+/g, '-');
      await setDoc(doc(db, 'planillas', formattedName), {
        creado: new Date().toISOString(),
        creador: userName,
        hojas: [{ id: 'hoja-1', nombre: 'Hoja 1', rows: [], sueldos: [], gastosOficina: 0, gastosFijos: 0, balanceGeneral: 0 }]
      });
    }
  };

  // --- PROCESAMIENTO CENTRAL DE DATOS ---
  const { stats, listaEmpresas, datosGrafica } = useMemo(() => {
    let ingresos = 0; let pendientes = 0; let iva = 0;
    const empresasSet = new Set<string>();
    const agrupado: any = {};

    planillas.forEach(p => {
      // Ignoramos las de facturas para los gráficos de ventas
      if (p.id.includes('factura')) return;
      
      (p.hojas || []).forEach((h: any) => {
        (h.rows || []).forEach((row: any) => {
          const vNeta = parseCurrency(row.ventaNeta);
          const vIva = parseCurrency(row.pagoIva);
          const vBalance = parseCurrency(row.balanceIngreso);
          const emp = String(row.empresa || row.cliente || '').trim().toUpperCase();
          
          // KPIs Globales (Tarjetas de arriba)
          ingresos += vNeta;
          iva += vIva;
          if (String(row.estatus).toUpperCase().includes('PENDIENTE')) pendientes += vNeta;

          // Registrar Empresa si existe
          if (emp) empresasSet.add(emp);

          // Lógica de Gráfica
          const f = normalizarFecha(row.fecha);
          if (f && emp) {
            if (empresaSeleccionada === 'TODAS' || empresaSeleccionada === emp) {
              const key = vistaTiempo === 'MES' ? f.mesKey : f.semanaKey;
              const label = vistaTiempo === 'MES' ? f.mesLabel : f.semanaLabel;

              if (!agrupado[key]) {
                agrupado[key] = { name: label, sortKey: key, "Venta Neta": 0, "Balance Real": 0 };
              }
              agrupado[key]["Venta Neta"] += vNeta;
              agrupado[key]["Balance Real"] += vBalance;
            }
          }
        });
      });
    });

    // Ordenar barras de la más vieja a la más nueva
    const graficaOrdenada = Object.values(agrupado).sort((a: any, b: any) => a.sortKey.localeCompare(b.sortKey));

    return { 
      stats: { ingresos, pendientes, iva },
      listaEmpresas: Array.from(empresasSet).sort(),
      datosGrafica: graficaOrdenada
    };
  }, [planillas, empresaSeleccionada, vistaTiempo]);

  const filteredPlanillas = planillas.filter(p => p.id.includes(searchTerm.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">Panel de Control</h1>
          <p className="text-slate-500 text-sm mt-1">Bienvenido de nuevo, {userName}</p>
        </div>

        {/* --- 4 OPCIONES PRINCIPALES A PRIMERA VISTA --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          
          {/* Botón Nueva Planilla */}
          <button 
            onClick={crearNuevaPlanilla} 
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center gap-4 hover:border-blue-500 hover:shadow-md transition-all group"
          >
            <div className="p-4 bg-blue-50 rounded-2xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Plus size={28} />
            </div>
            <span className="font-bold text-slate-700 text-lg">Nueva Planilla</span>
          </button>

          {/* KPI: Ingresos */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center gap-3">
            <div className="p-3 bg-green-50 rounded-xl text-green-600">
              <TrendingUp size={24} />
            </div>
            <div className="text-center">
              <span className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">Total Ventas (Global)</span>
              <span className="text-2xl font-black text-slate-800">${stats.ingresos.toLocaleString('es-CL')}</span>
            </div>
          </div>

          {/* KPI: Pendientes */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center gap-3">
            <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
              <Clock size={24} />
            </div>
            <div className="text-center">
              <span className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">Por Cobrar (Pendiente)</span>
              <span className="text-2xl font-black text-slate-800">${stats.pendientes.toLocaleString('es-CL')}</span>
            </div>
          </div>

          {/* KPI: Empresas */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center gap-3">
            <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
              <Building2 size={24} />
            </div>
            <div className="text-center">
              <span className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">Clientes Activos</span>
              <span className="text-2xl font-black text-slate-800">{listaEmpresas.length}</span>
            </div>
          </div>

        </div>

        {/* --- SECCIÓN DE GRÁFICA ADAPTATIVA --- */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 border-b border-slate-100 pb-4">
            
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 size={24} className="text-blue-600" /> Analítica de Resultados
            </h2>

            <div className="flex flex-wrap items-center gap-3">
              {/* Filtro Empresa */}
              <select 
                value={empresaSeleccionada}
                onChange={(e) => setEmpresaSeleccionada(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-700 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="TODAS">TODOS LOS CLIENTES (GLOBAL)</option>
                {listaEmpresas.map(e => <option key={e} value={e}>{e}</option>)}
              </select>

              {/* Botones Mes/Semana */}
              <div className="flex bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                <button 
                  onClick={() => setVistaTiempo('MES')}
                  className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${vistaTiempo === 'MES' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >POR MES</button>
                <button 
                  onClick={() => setVistaTiempo('SEMANA')}
                  className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${vistaTiempo === 'SEMANA' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >POR SEMANA</button>
              </div>
            </div>

          </div>

          {/* Gráfico */}
          <div className="h-[380px] w-full">
            {datosGrafica.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datosGrafica} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 13, fontWeight: 500}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 13}} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}}
                    formatter={(value: number) => [`$${value.toLocaleString('es-CL')}`, '']}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="Venta Neta" name="Venta Neta (Ingreso Bruto)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={45} />
                  <Bar dataKey="Balance Real" name="Balance (Ganancia Neta)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={45} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                <Calendar size={48} strokeWidth={1} className="opacity-50" />
                <p className="text-base font-medium">No hay datos de fechas válidas para graficar en esta selección.</p>
                <p className="text-sm">Asegúrate de haber importado el Excel con fechas correctas.</p>
              </div>
            )}
          </div>
        </div>

        {/* --- LISTADO DE PLANILLAS --- */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800">Tus Planillas Activas</h2>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar planilla..." 
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all" 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredPlanillas.map((p) => (
              <div key={p.id} className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between hover:bg-slate-50 transition-colors gap-4">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm border border-blue-100">
                    <FileSpreadsheet size={28} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg uppercase tracking-tight">{p.id.replace(/-/g, ' ')}</h3>
                    <p className="text-sm text-slate-500 font-medium mt-0.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                      {(p.hojas?.length || 1)} Meses registrados
                    </p>
                  </div>
                </div>
                <Link 
                  to={`/planilla/${p.id}`} 
                  className="w-full sm:w-auto text-center px-6 py-2.5 text-sm font-bold text-blue-600 bg-white border border-blue-200 hover:bg-blue-50 hover:border-blue-300 rounded-lg transition-all shadow-sm"
                >
                  Abrir Planilla
                </Link>
              </div>
            ))}
            
            {filteredPlanillas.length === 0 && (
              <div className="p-12 text-center text-slate-500">
                <FileSpreadsheet size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">No se encontraron planillas.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}