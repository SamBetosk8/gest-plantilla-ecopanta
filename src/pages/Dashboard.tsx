import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { FileSpreadsheet, Plus, DollarSign, TrendingUp, Clock, Search, BarChart3, Building2, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// Limpieza de moneda
const parseCurrency = (val: any) => {
  if (!val) return 0;
  const num = parseInt(String(val).replace(/[^0-9-]/g, ''));
  return isNaN(num) ? 0 : num;
};

// Extractor de Fechas para agrupar por Mes o Semana
const procesarFecha = (fechaStr: string) => {
  if (!fechaStr) return null;
  const parts = String(fechaStr).split(/[-/]/);
  let d = new Date(fechaStr);
  
  if (parts.length === 3) {
    let day = parseInt(parts[0]), month = parseInt(parts[1]) - 1, year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    d = new Date(year, month, day);
  }
  
  if (isNaN(d.getTime())) return null;

  // Formato Mes (Ej: 2026-01)
  const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mesLabel = `${mesesNombres[d.getMonth()]} ${d.getFullYear()}`;

  // Formato Semana (Ej: 2026-W05)
  const tempDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tempDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const semanaKey = `${tempDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  const semanaLabel = `Semana ${weekNo}, ${tempDate.getUTCFullYear()}`;

  return { mesKey, mesLabel, semanaKey, semanaLabel };
};

export default function Dashboard() {
  const [planillas, setPlanillas] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filtros de Gráfica
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

  // 1. KPI Globales (Tarjetas superiores)
  const stats = useMemo(() => {
    let ingresos = 0; let pendientes = 0; let iva = 0;
    planillas.forEach(p => {
      if (!p.id.includes('factura')) {
        (p.hojas || []).forEach((h: any) => {
          (h.rows || []).forEach((row: any) => {
            ingresos += parseCurrency(row.ventaNeta);
            iva += parseCurrency(row.pagoIva);
            if (String(row.estatus).toUpperCase().includes('PENDIENTE')) pendientes += parseCurrency(row.ventaNeta);
          });
        });
      }
    });
    return { ingresos, pendientes, iva };
  }, [planillas]);

  // 2. Procesamiento de todas las filas para sacar lista de Empresas y Gráficas
  const { listaEmpresas, datosGrafica } = useMemo(() => {
    const empresasSet = new Set<string>();
    const filasProcesadas: any[] = [];

    // Extraer todas las filas de todas las planillas
    planillas.forEach(p => {
      if (!p.id.includes('factura')) {
        (p.hojas || []).forEach((h: any) => {
          (h.rows || []).forEach((row: any) => {
            const emp = (row.empresa || row.cliente || '').trim().toUpperCase();
            if (!emp) return;
            empresasSet.add(emp);
            
            const vNeta = parseCurrency(row.ventaNeta);
            const vBalance = parseCurrency(row.balanceIngreso);
            if (vNeta === 0 && vBalance === 0) return;

            const fechas = procesarFecha(row.fecha);
            if (fechas) {
              filasProcesadas.push({ empresa: emp, ...fechas, ventaNeta: vNeta, balanceIngreso: vBalance });
            }
          });
        });
      }
    });

    // Agrupar filas por Empresa y Tiempo (Mes/Semana)
    const agrupado: any = {};
    filasProcesadas.forEach(fila => {
      // Filtrar por empresa seleccionada
      if (empresaSeleccionada !== 'TODAS' && fila.empresa !== empresaSeleccionada) return;

      const key = vistaTiempo === 'MES' ? fila.mesKey : fila.semanaKey;
      const label = vistaTiempo === 'MES' ? fila.mesLabel : fila.semanaLabel;

      if (!agrupado[key]) agrupado[key] = { name: label, sortKey: key, 'Venta Neta': 0, 'Balance Real': 0 };
      agrupado[key]['Venta Neta'] += fila.ventaNeta;
      agrupado[key]['Balance Real'] += fila.balanceIngreso;
    });

    // Convertir a Array y ordenar cronológicamente
    const datosOrdenados = Object.values(agrupado).sort((a: any, b: any) => a.sortKey.localeCompare(b.sortKey));

    return { 
      listaEmpresas: Array.from(empresasSet).sort(), 
      datosGrafica: datosOrdenados 
    };
  }, [planillas, empresaSeleccionada, vistaTiempo]);

  const filteredPlanillas = planillas.filter(p => p.id.includes(searchTerm.toLowerCase()));

  return (
    <div className="min-h-screen bg-gray-50 p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        
        {/* CABECERA */}
        <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Hola, {userName}</h1>
            <p className="text-gray-500 mt-1">Resumen financiero general.</p>
          </div>
          <button onClick={crearNuevaPlanilla} className="bg-green-600 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 shadow-md hover:bg-green-700 transition-colors">
            <Plus size={20} /> Nueva Planilla
          </button>
        </div>

        {/* TARJETAS KPI */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="bg-green-100 p-4 rounded-full text-green-600"><TrendingUp size={28} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Ingresos Brutos Globales</p>
              <p className="text-2xl font-bold text-gray-800">${stats.ingresos.toLocaleString('es-CL')}</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="bg-yellow-100 p-4 rounded-full text-yellow-600"><Clock size={28} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Por Cobrar (Pendiente)</p>
              <p className="text-2xl font-bold text-gray-800">${stats.pendientes.toLocaleString('es-CL')}</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="bg-blue-100 p-4 rounded-full text-blue-600"><DollarSign size={28} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">IVA Generado Global</p>
              <p className="text-2xl font-bold text-gray-800">${stats.iva.toLocaleString('es-CL')}</p>
            </div>
          </div>
        </div>

        {/* --- NUEVO: PANEL DE ANÁLISIS POR EMPRESA --- */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-8">
          
          {/* Controles del Gráfico */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 border-b border-gray-100 pb-4">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <BarChart3 className="text-indigo-600" /> Rendimiento por Empresa
            </h3>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-1">
                <Building2 size={16} className="text-gray-400 ml-2" />
                <select 
                  value={empresaSeleccionada} 
                  onChange={(e) => setEmpresaSeleccionada(e.target.value)}
                  className="bg-transparent border-none text-sm font-medium text-gray-700 py-1.5 pr-8 focus:ring-0 cursor-pointer"
                >
                  <option value="TODAS">Todas las Empresas (Global)</option>
                  {listaEmpresas.map(emp => (
                    <option key={emp} value={emp}>{emp}</option>
                  ))}
                </select>
              </div>

              <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                <button 
                  onClick={() => setVistaTiempo('SEMANA')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${vistaTiempo === 'SEMANA' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Por Semana
                </button>
                <button 
                  onClick={() => setVistaTiempo('MES')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${vistaTiempo === 'MES' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Por Mes
                </button>
              </div>
            </div>
          </div>

          {/* Gráfico Recharts */}
          {datosGrafica.length > 0 ? (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datosGrafica} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} tickFormatter={(val) => `$${(val/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString('es-CL')}`, '']} cursor={{fill: '#f3f4f6'}} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="Venta Neta" name="Venta Neta (Ingreso)" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Balance Real" name="Balance Real (Ganancia)" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-gray-400">
              <Calendar size={48} className="mb-4 opacity-50" />
              <p>No hay datos de fechas válidas para graficar en esta selección.</p>
            </div>
          )}
        </div>

        {/* BUSCADOR Y LISTA DE PLANILLAS */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-800">Tus Planillas Activas</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar planilla..." 
                className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="divide-y divide-gray-100">
            {filteredPlanillas.map((planilla) => (
              <Link key={planilla.id} to={`/planilla/${planilla.id}`} className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="bg-gray-100 p-3 rounded-lg text-gray-500 group-hover:bg-green-100 group-hover:text-green-600 transition-colors">
                    <FileSpreadsheet size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 text-lg uppercase">{planilla.id.replace('-', ' ')}</h3>
                    <p className="text-sm text-gray-500 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span> 
                      {(planilla.hojas?.length || 1)} Meses registrados
                    </p>
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-green-600 font-medium">Abrir →</div>
              </Link>
            ))}
          </div>
        </div>
        
      </div>
    </div>
  );
}