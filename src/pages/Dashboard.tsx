import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { FileSpreadsheet, Plus, DollarSign, TrendingUp, TrendingDown, Clock, Search } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Dashboard() {
  const [planillas, setPlanillas] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const userName = localStorage.getItem('userName') || 'Usuario';

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'planillas'), (snapshot) => {
      setPlanillas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const crearNuevaPlanilla = async () => {
    const nombre = prompt('Nombre de la nueva planilla (Ej: facturas-calama):');
    if (nombre) {
      const formattedName = nombre.toLowerCase().replace(/\s+/g, '-');
      // Crear en Firebase con la nueva estructura de hojas vacía
      await setDoc(doc(db, 'planillas', formattedName), {
        creado: new Date().toISOString(),
        creador: userName,
        hojas: [{ id: 'hoja-1', nombre: 'Hoja 1', rows: [], sueldos: [], gastosOficina: 0, gastosFijos: 0, balanceGeneral: 0 }]
      });
    }
  };

  const parseCurrency = (val: any) => {
    if (!val) return 0;
    const num = parseInt(String(val).replace(/[^0-9-]/g, ''));
    return isNaN(num) ? 0 : num;
  };

  // Resumen global sumando todas las hojas de todas las planillas de Balance
  const stats = useMemo(() => {
    let ingresos = 0; let pendientes = 0; let iva = 0;

    planillas.forEach(p => {
      if (!p.id.includes('factura')) {
        const hojasAProcesar = p.hojas || (p.rows ? [{ rows: p.rows }] : []);
        hojasAProcesar.forEach((h: any) => {
          (h.rows || []).forEach((row: any) => {
            ingresos += parseCurrency(row.ventaNeta);
            iva += parseCurrency(row.pagoIva);
            if (String(row.estatus).toUpperCase() === 'PENDIENTE') {
              pendientes += parseCurrency(row.ventaNeta);
            }
          });
        });
      }
    });

    return { ingresos, pendientes, iva };
  }, [planillas]);

  // Datos extraídos específicamente para la nueva Gráfica de Gastos y Balances
  const datosGrafica = useMemo(() => {
    let datos: any[] = [];
    planillas.forEach(p => {
      if (!p.id.includes('factura') && p.hojas) {
        p.hojas.forEach((h: any) => {
          if (h.balanceGeneral || h.gastosFijos || h.gastosOficina) {
            datos.push({
              name: `${h.nombre} (${p.id.replace('balance-', '')})`,
              'Balance General': h.balanceGeneral || 0,
              'Gastos Fijos': h.gastosFijos || 0,
              'Gastos Oficina': h.gastosOficina || 0
            });
          }
        });
      }
    });
    return datos;
  }, [planillas]);

  const filteredPlanillas = planillas.filter(p => p.id.includes(searchTerm.toLowerCase()));

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* CABECERA */}
        <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Hola, {userName}</h1>
            <p className="text-gray-500 mt-1">Aquí está el resumen financiero de las planillas.</p>
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
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Ingresos Brutos</p>
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
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">IVA Generado</p>
              <p className="text-2xl font-bold text-gray-800">${stats.iva.toLocaleString('es-CL')}</p>
            </div>
          </div>
        </div>

        {/* GRÁFICA DE BALANCE MENSUAL (NUEVA) */}
        {datosGrafica.length > 0 && (
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-8">
            <h3 className="text-lg font-bold text-gray-800 mb-6">Resumen Mensual (Gastos Fijos y Balance General)</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datosGrafica} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} tickFormatter={(val) => `$${(val/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString('es-CL')}`, '']} cursor={{fill: 'transparent'}} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="Balance General" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gastos Fijos" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gastos Oficina" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

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
              <Link 
                key={planilla.id} 
                to={`/planilla/${planilla.id}`}
                className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors group"
              >
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
                <div className="text-gray-400 group-hover:text-green-600 font-medium">
                  Abrir →
                </div>
              </Link>
            ))}
            {filteredPlanillas.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No se encontraron planillas.
              </div>
            )}
          </div>
        </div>
        
      </div>
    </div>
  );
}