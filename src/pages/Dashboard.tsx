import { Link } from 'react-router-dom';
import { FileSpreadsheet } from 'lucide-react';

export default function Dashboard() {
  const planillas = [
    { id: 'calama-2026', nombre: 'Balances Calama 2026' },
    { id: 'copiapo-2026', nombre: 'Balances Copiapó 2026' },
    { id: 'gastos-taller', nombre: 'Gastos de Taller' }
  ];

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Panel de Control</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {planillas.map((planilla) => (
          <Link 
            key={planilla.id} 
            to={`/planilla/${planilla.id}`}
            className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200 flex items-center gap-4"
          >
            <div className="bg-green-100 p-3 rounded-full text-green-600">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h2 className="font-semibold text-gray-700">{planilla.nombre}</h2>
              <p className="text-sm text-gray-500">Última edición: Hoy</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}