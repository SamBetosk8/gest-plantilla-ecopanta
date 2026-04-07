import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PlanillaView() {
  const { id } = useParams();

  return (
    <div className="p-6 h-screen flex flex-col">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          Editando Planilla: {id}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-sm text-gray-500">Sincronizado</span>
        </div>
      </div>
      
      <div className="flex-1 bg-white border border-gray-200 rounded-lg shadow-inner flex items-center justify-center bg-gray-50">
        {/* Aqui ira el componente react-data-grid */}
        <p className="text-gray-400">Cargando cuadrícula de datos...</p>
      </div>
    </div>
  );
}