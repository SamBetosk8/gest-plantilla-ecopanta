import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { Plus, BarChart3, Calendar, LayoutDashboard, FileText, Wallet, Users, Key, Trash2, ArrowLeft, Eye, EyeOff, X, ShoppingCart, Tags, Lightbulb } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// IMPORTAMOS TU LOGO
import logo from '../assets/logo.jpg';

const parseCurrency = (val: any) => {
  if (!val) return 0;
  const num = parseInt(String(val).replace(/[^0-9-]/g, ''));
  return isNaN(num) ? 0 : num;
};

// LECTOR DE FECHAS ESTRICTO Y BLINDADO CONTRA DATOS FANTASMAS
const normalizarFecha = (fechaStr: string) => {
  if (!fechaStr || typeof fechaStr !== 'string' || !fechaStr.includes('-')) return null;
  const parts = fechaStr.split('-');
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (year < 2024 || year > 2030) return null; // FILTRO ANTI-AÑOS FANTASMAS

  const d = new Date(year, month - 1, day);
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

const PLANILLAS_FIJAS = [
  { id: 'balance-calama', titulo: 'BALANCE CALAMA', tipo: 'balance', ciudad: 'calama' },
  { id: 'balance-copiapo', titulo: 'BALANCE COPIAPÓ', tipo: 'balance', ciudad: 'copiapo' },
  { id: 'facturas-calama', titulo: 'FACTURAS CALAMA', tipo: 'factura', ciudad: 'calama' },
  { id: 'facturas-copiapo', titulo: 'FACTURAS COPIAPÓ', tipo: 'factura', ciudad: 'copiapo' }
];

export default function Dashboard() {
  const [planillas, setPlanillas] = useState<any[]>([]);
  const [usuariosDB, setUsuariosDB] = useState<any[]>([]);
  
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<string>('TODAS');
  const [vistaTiempo, setVistaTiempo] = useState<'MES' | 'SEMANA'>('MES');
  const [vistaMenu, setVistaMenu] = useState<'PANEL' | 'USUARIOS'>('PANEL'); 
  
  const [drilldownTiempo, setDrilldownTiempo] = useState<string | null>(null);
  const [modalFactura, setModalFactura] = useState<string | null>(null); 
  
  const [mostrarPasswords, setMostrarPasswords] = useState<Record<string, boolean>>({});
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('Empleado');

  const userName = sessionStorage.getItem('userName') || 'Usuario';
  const navigate = useNavigate();

  const handleLogout = () => {
    sessionStorage.removeItem('userName');
    navigate('/');
  };

  useEffect(() => {
    const unsubPlanillas = onSnapshot(collection(db, 'planillas'), (snapshot) => {
      setPlanillas(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    const unsubUsuarios = onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      setUsuariosDB(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubPlanillas(); unsubUsuarios(); };
  }, []);

  const manejarClickBalance = async (idCompleto: string) => {
    const existe = planillas.find(p => p.id === idCompleto);
    if (existe) {
      navigate(`/balance/${idCompleto}`);
    } else {
      await setDoc(doc(db, 'planillas', idCompleto), {
        creado: new Date().toISOString(), creador: userName,
        hojas: [{ id: 'hoja-1', nombre: 'Mes 1', rows: [], sueldos: [], gastosOficina: [], gastosFijos: [], balanceGeneral: 0 }]
      });
      navigate(`/balance/${idCompleto}`);
    }
  };

  const abrirFacturaEspecifica = async (tipo: 'compra' | 'venta') => {
    if (!modalFactura) return;
    const idCompleto = `facturas-${tipo}-${modalFactura}`;
    const existe = planillas.find(p => p.id === idCompleto);
    
    if (existe) {
      navigate(`/factura-${tipo}/${idCompleto}`);
    } else {
      await setDoc(doc(db, 'planillas', idCompleto), {
        creado: new Date().toISOString(), creador: userName,
        hojas: [{ id: 'hoja-1', nombre: 'Mes 1', rows: [] }]
      });
      navigate(`/factura-${tipo}/${idCompleto}`);
    }
    setModalFactura(null);
  };

  const crearUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    const idUnico = newUsername.toLowerCase().replace(/\s+/g, '');
    await setDoc(doc(db, 'usuarios', idUnico), {
      username: newUsername, password: newPassword, role: newRole, creado: new Date().toISOString()
    });
    setNewUsername(''); setNewPassword(''); alert('Usuario Creado Exitosamente');
  };

  const eliminarUsuario = async (idUser: string) => {
    if (idUser === 'admin') return alert('No puedes eliminar al admin principal.');
    if (window.confirm('¿Seguro que deseas eliminar este usuario?')) {
      await deleteDoc(doc(db, 'usuarios', idUser));
    }
  };

  const { listaEmpresas, datosGraficaGlobal, datosDrilldown } = useMemo(() => {
    const empresasSet = new Set<string>();
    const agrupadoGlobal: any = {};
    const agrupadoDrilldown: any = {};

    planillas.forEach(p => {
      // Ignora las facturas para el gráfico de ingresos
      if (p.id.includes('factura')) return;
      
      (p.hojas || []).forEach((h: any) => {
        (h.rows || []).forEach((row: any) => {
          const vNeta = parseCurrency(row.ventaNeta); 
          const vBalance = parseCurrency(row.balanceIngreso);
          
          if (vNeta === 0 && vBalance === 0) return;

          const emp = String(row.empresa || row.cliente || 'SIN CLIENTE').trim().toUpperCase();
          const f = normalizarFecha(row.fecha);
          
          if (!f) return;
          empresasSet.add(emp);

          const timeKey = vistaTiempo === 'MES' ? f.mesKey : f.semanaKey;
          const timeLabel = vistaTiempo === 'MES' ? f.mesLabel : f.semanaLabel;

          if (empresaSeleccionada === 'TODAS' || empresaSeleccionada === emp) {
            if (!agrupadoGlobal[timeKey]) {
              agrupadoGlobal[timeKey] = { name: timeLabel, sortKey: timeKey, "Venta Neta": 0, "Balance Real": 0 };
            }
            agrupadoGlobal[timeKey]["Venta Neta"] += vNeta; 
            agrupadoGlobal[timeKey]["Balance Real"] += vBalance;
          }

          if (drilldownTiempo && timeLabel === drilldownTiempo) {
            if (!agrupadoDrilldown[emp]) {
              agrupadoDrilldown[emp] = { name: emp, "Venta Neta": 0, "Balance Real": 0 };
            }
            agrupadoDrilldown[emp]["Venta Neta"] += vNeta;
            agrupadoDrilldown[emp]["Balance Real"] += vBalance;
          }
        });
      });
    });

    const graficaOrdenadaGlobal = Object.values(agrupadoGlobal).sort((a: any, b: any) => a.sortKey.localeCompare(b.sortKey));
    const graficaOrdenadaDrilldown = Object.values(agrupadoDrilldown).sort((a: any, b: any) => b["Venta Neta"] - a["Venta Neta"]);

    return { 
      listaEmpresas: Array.from(empresasSet).sort(), 
      datosGraficaGlobal: graficaOrdenadaGlobal,
      datosDrilldown: graficaOrdenadaDrilldown
    };
  }, [planillas, empresaSeleccionada, vistaTiempo, drilldownTiempo]);

  const datosActuales = drilldownTiempo ? datosDrilldown : datosGraficaGlobal;

  return (
    <div className="flex h-screen bg-[#f8fafc]">
      {/* MENÚ LATERAL CON LOGO CENTRADO Y GRANDE */}
      <div className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col shadow-sm z-10">
        <div className="p-8 border-b border-slate-100 flex flex-col items-center gap-4 text-center">
          <img src={logo} alt="Ecopanta" className="w-32 h-32 object-contain rounded-3xl shadow-lg border-4 border-white transition-transform hover:scale-105" />
          <h1 className="text-2xl font-black text-green-600 tracking-tight">Ecopanta</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setVistaMenu('PANEL')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${vistaMenu === 'PANEL' ? 'bg-green-50 text-green-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
            <LayoutDashboard size={20} /> Panel Principal
          </button>
          <button onClick={() => setVistaMenu('USUARIOS')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${vistaMenu === 'USUARIOS' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Users size={20} /> Usuarios
          </button>
        </nav>
        <div className="p-4 border-t border-slate-100">
          <button onClick={handleLogout} className="w-full py-2 text-sm font-bold text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
            Cerrar Sesión
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 md:p-10 max-w-7xl mx-auto">

          {/* VISTA: PANEL PRINCIPAL */}
          {vistaMenu === 'PANEL' && (
            <>
              <div className="flex justify-between items-end mb-10">
                <div>
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight">Panel Principal</h2>
                  <p className="text-slate-500 mt-1 font-medium">Bienvenido, {userName}</p>
                </div>
              </div>

              {/* LAS 4 PLANILLAS CLÁSICAS */}
              <h3 className="text-lg font-bold text-slate-700 mb-4">Tus Planillas Principales</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                {PLANILLAS_FIJAS.map((pf) => {
                  const esFactura = pf.tipo === 'factura';

                  return (
                    <button 
                      key={pf.id} 
                      onClick={() => {
                        if (esFactura) setModalFactura(pf.ciudad);
                        else manejarClickBalance(pf.id);
                      }} 
                      className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-xl transition-all group flex flex-col justify-center items-center gap-5 h-52 relative overflow-hidden"
                    >
                      <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-10 transition-transform group-hover:scale-150 ${esFactura ? 'bg-purple-500' : 'bg-blue-500'}`}></div>
                      <div className={`p-4 rounded-2xl text-white shadow-inner transition-transform group-hover:-translate-y-1 ${esFactura ? 'bg-gradient-to-br from-purple-500 to-purple-600' : 'bg-gradient-to-br from-blue-500 to-blue-600'}`}>
                        {esFactura ? <FileText size={36} /> : <Wallet size={36} />}
                      </div>
                      <div className="text-center z-10">
                        <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight leading-tight">{pf.titulo}</h3>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* GRÁFICA ADAPTATIVA */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 md:p-8 mb-10">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6 border-b border-slate-100 pb-6">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                      <div className="p-2 bg-green-50 rounded-lg text-green-600"><BarChart3 size={24} /></div> 
                      {drilldownTiempo ? `Desglose de Clientes: ${drilldownTiempo}` : 'Analítica de Ventas'}
                    </h2>
                    {!drilldownTiempo && (
                      <p className="text-sm font-medium text-slate-500 mt-2 ml-12 animate-pulse flex items-center gap-1.5">
                        <Lightbulb size={16} className="text-amber-500" /> Haz clic en una barra para dividir por clientes
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                    {drilldownTiempo ? (
                      <button onClick={() => setDrilldownTiempo(null)} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-slate-900 transition-all shadow-md">
                        <ArrowLeft size={18} /> Volver a Meses
                      </button>
                    ) : (
                      <>
                        <select value={empresaSeleccionada} onChange={(e) => setEmpresaSeleccionada(e.target.value)} className="flex-1 lg:flex-none bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="TODAS">TODOS LOS CLIENTES (GLOBAL)</option>
                          {listaEmpresas.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
                          <button onClick={() => setVistaTiempo('MES')} className={`flex-1 sm:flex-none px-6 py-2 text-xs font-black rounded-lg transition-all ${vistaTiempo === 'MES' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>MES</button>
                          <button onClick={() => setVistaTiempo('SEMANA')} className={`flex-1 sm:flex-none px-6 py-2 text-xs font-black rounded-lg transition-all ${vistaTiempo === 'SEMANA' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>SEMANA</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="h-80 w-full">
                  {datosActuales.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={datosActuales} onClick={(state) => { if (!drilldownTiempo && state && state.activeLabel) setDrilldownTiempo(state.activeLabel as string); }} className={!drilldownTiempo ? "cursor-pointer" : ""}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 600}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 600}} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} dx={-10} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'}} formatter={(value: number) => [`$${value.toLocaleString('es-CL')}`, '']} />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Bar dataKey="Venta Neta" name="Venta Neta (Ingreso Bruto)" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={drilldownTiempo ? 60 : 40} />
                        <Bar dataKey="Balance Real" name="Balance (Ganancia Neta)" fill="#10b981" radius={[6, 6, 0, 0]} barSize={drilldownTiempo ? 60 : 40} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3"><Calendar size={56} className="opacity-30" /><p className="font-bold text-slate-500">No hay datos válidos en este período.</p></div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* VISTA: GESTIÓN DE USUARIOS */}
          {vistaMenu === 'USUARIOS' && (
            <>
              <div className="mb-10">
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">Gestión de Accesos</h2>
                <p className="text-slate-500 mt-1 font-medium">Crea y administra las cuentas de tus empleados.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 h-fit">
                  <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2"><Plus size={20} className="text-blue-500"/> Nuevo Usuario</h3>
                  <form onSubmit={crearUsuario} className="space-y-5">
                    <div>
                      <label className="text-sm font-bold text-slate-700 block mb-2">Nombre de Usuario</label>
                      <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej: Alan" />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-slate-700 block mb-2">Contraseña</label>
                      <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ingresa contraseña" />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-slate-700 block mb-2">Rol</label>
                      <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="Administrador">Administrador</option>
                        <option value="Empleado">Empleado</option>
                      </select>
                    </div>
                    <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all mt-4">Crear Cuenta</button>
                  </form>
                </div>

                <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-xl font-black text-slate-800">Usuarios Activos ({usuariosDB.length})</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {usuariosDB.map(u => (
                      <div key={u.id} className="p-6 flex items-center justify-between hover:bg-slate-50">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-lg border border-slate-200">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800 text-lg capitalize">{u.username}</h4>
                            <p className="text-sm text-slate-500 font-medium flex items-center gap-2 mt-1">
                              <Key size={14} /> Contraseña: 
                              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 flex items-center gap-2 font-mono tracking-widest">
                                {mostrarPasswords[u.id] ? u.password : '••••••••'}
                                <button onClick={() => setMostrarPasswords(prev => ({...prev, [u.id]: !prev[u.id]}))} className="text-slate-400 hover:text-blue-500 transition-colors ml-1" title="Mostrar/Ocultar contraseña">
                                  {mostrarPasswords[u.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${u.role === 'Administrador' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>{u.role}</span>
                          <button onClick={() => eliminarUsuario(u.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={20} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      {/* MODAL DE SELECCIÓN (COMPRAS O VENTAS) */}
      {modalFactura && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500 rounded-full opacity-10"></div>
            
            <div className="flex justify-between items-center mb-6 relative z-10">
              <h3 className="text-2xl font-black text-slate-800">Seleccionar Vista</h3>
              <button onClick={() => setModalFactura(null)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
            </div>
            
            <p className="text-slate-500 mb-8 font-medium relative z-10">¿Qué facturas de <strong className="text-slate-700 uppercase">{modalFactura}</strong> deseas gestionar?</p>
            
            <div className="flex flex-col gap-4 relative z-10">
              <button 
                onClick={() => abrirFacturaEspecifica('compra')} 
                className="bg-purple-50 border border-purple-200 text-purple-800 p-5 rounded-2xl font-black text-lg flex items-center justify-between hover:bg-purple-600 hover:text-white transition-all group shadow-sm hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  <ShoppingCart size={28} className="text-purple-500 group-hover:text-purple-200" /> 
                  Facturas de Compras
                </div>
              </button>
              
              <button 
                onClick={() => abrirFacturaEspecifica('venta')} 
                className="bg-blue-50 border border-blue-200 text-blue-800 p-5 rounded-2xl font-black text-lg flex items-center justify-between hover:bg-blue-600 hover:text-white transition-all group shadow-sm hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  <Tags size={28} className="text-blue-500 group-hover:text-blue-200" /> 
                  Facturas de Ventas
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}