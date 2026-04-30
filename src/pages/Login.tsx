import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, LogIn, AlertCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';

import logo from '../assets/logo.jpg';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const inputUser = username.trim().toLowerCase();

      if (inputUser === 'admin' && password === 'admin') {
        await setDoc(doc(db, 'usuarios', 'admin'), {
          username: 'Admin',
          password: 'admin',
          role: 'Administrador',
          creado: new Date().toISOString()
        });
        sessionStorage.setItem('userName', 'Admin');
        navigate('/dashboard');
        return;
      }

      const usuariosRef = collection(db, 'usuarios');
      const snapshot = await getDocs(usuariosRef);
      
      let usuarioValido = false;
      let nombreReal = '';

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.username && data.username.toLowerCase() === inputUser && data.password === password) {
          usuarioValido = true;
          nombreReal = data.username; 
        }
      });

      if (usuarioValido) {
        sessionStorage.setItem('userName', nombreReal.toUpperCase());
        navigate('/dashboard');
      } else {
        setError('Usuario o contraseña incorrectos.');
      }
    } catch (err) {
      setError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Fondo decorativo con animaciones sutiles */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-green-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      
      <div className="bg-white/80 backdrop-blur-xl p-8 md:p-12 rounded-3xl shadow-2xl w-full max-w-lg border border-white relative z-10">
        
        <div className="text-center mb-10 space-y-3">
          {/* EL LOGO GIGANTE Y CENTRADO */}
          <div className="mx-auto w-40 h-40 bg-white rounded-3xl flex items-center justify-center shadow-lg shadow-green-500/10 mb-8 p-1.5 transform transition hover:scale-105 border border-slate-100">
            <img src={logo} alt="Ecopanta Logo" className="w-full h-full object-contain rounded-2xl" />
          </div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tight">Ecopanta</h1>
          <p className="text-lg text-slate-500 font-medium">Sistema de Gestión de Planillas</p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-100 text-red-600 text-sm font-bold rounded-xl flex items-center gap-3 animate-shake">
            <AlertCircle size={20} className="shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 ml-1">Usuario</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                <User size={20} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:bg-white outline-none transition-all font-medium text-slate-700 placeholder-slate-400"
                placeholder="Ingresa tu usuario (Ej: Alan)"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 ml-1">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                <Lock size={20} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:bg-white outline-none transition-all font-medium text-slate-700 placeholder-slate-400"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-4.5 rounded-xl font-bold text-xl hover:from-green-700 hover:to-green-600 focus:ring-4 focus:ring-green-500/30 transition-all shadow-lg shadow-green-500/25 flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? 'Verificando...' : (
              <>
                <LogIn size={22} /> Iniciar Sesión
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}