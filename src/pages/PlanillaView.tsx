import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DataGrid } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';

const columnasBase = [
  { key: 'fecha', name: 'Fecha' },
  { key: 'cliente', name: 'Cliente / Empresa' },
  { key: 'detalle', name: 'Trabajo Realizado / Insumo' },
  { key: 'monto', name: 'Monto Total' }
];

const filasEjemplo = [
  { id: 1, fecha: '2026-04-01', cliente: 'Ejemplo S.A.', detalle: 'Reparación Tolva', monto: '150000' },
  { id: 2, fecha: '2026-04-02', cliente: 'Proveedor XYZ', detalle: 'Compra Materiales', monto: '45000' }
];

export default function PlanillaView() {
  const { id } = useParams();
  const [rows, setRows] = useState(filasEjemplo);

  const titulo = id 
    ? id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') 
    : 'Planilla';

  return (
    <div className="p-6 h-screen flex flex-col">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          {titulo}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-sm text-gray-500">Sincronizado</span>
        </div>
      </div>
      
      <div className="flex-1 bg-white border border-gray-200 rounded-lg shadow-inner overflow-hidden">
        <DataGrid 
          columns={columnasBase} 
          rows={rows} 
          onRowsChange={setRows}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}