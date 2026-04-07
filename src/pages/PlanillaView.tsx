import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { DataGrid, textEditor } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';

const columnasBase = [
  { key: 'fecha', name: 'Fecha', renderEditCell: textEditor },
  { key: 'cliente', name: 'Cliente / Empresa', renderEditCell: textEditor },
  { key: 'detalle', name: 'Trabajo Realizado / Insumo', renderEditCell: textEditor },
  { key: 'monto', name: 'Monto Total', renderEditCell: textEditor }
];

const filasEjemplo = [
  { id: 1, fecha: '2026-04-01', cliente: 'Ejemplo S.A.', detalle: 'Reparacion Tolva', monto: '150000' },
  { id: 2, fecha: '2026-04-02', cliente: 'Proveedor XYZ', detalle: 'Compra Materiales', monto: '45000' }
];

export default function PlanillaView() {
  const { id } = useParams();
  const [rows, setRows] = useState(filasEjemplo);

  const titulo = id 
    ? id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') 
    : 'Planilla';

  const agregarFila = () => {
    const nuevaFila = {
      id: rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1,
      fecha: '',
      cliente: '',
      detalle: '',
      monto: ''
    };
    setRows([...rows, nuevaFila]);
  };

  return (
    <div className="p-6 h-screen flex flex-col">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          {titulo}
        </h1>
        
        <button 
          onClick={agregarFila}
          className="ml-4 flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Agregar Fila
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-sm text-gray-500">Local (Sin guardar)</span>
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