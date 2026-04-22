import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  // Estado para capturar el nombre del usuario
  const [nombre, setNombre] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Guardar el nombre en el almacenamiento local
    if (nombre.trim() !== '') {
      localStorage.setItem('userName', nombre);
    } else {
      localStorage.setItem('userName', 'Invitado');
    }

    // Proximamente: Logica de Firebase Auth real
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">
          Ecopanta Gestión
        </h1>
        <form onSubmit={handleLogin} className="space-y-4">
          
          {/* Nuevo campo para identificar al usuario */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Tu Nombre</label>
            <input 
              type="text" 
              required
              placeholder="Ej: Alan, Samuel..."
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input 
              type="email" 
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Contraseña</label>
            <input 
              type="password" 
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
            />
          </div>
          
          <button 
            type="submit" 
            className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 mt-4"
          >
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}
