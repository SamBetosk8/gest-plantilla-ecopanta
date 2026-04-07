import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { DataGrid, renderTextEditor } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';

const columnasBase = [
  { key: 'id', name: 'N°', width: 60 },
  { key: 'fecha', name: 'FECHA', renderEditCell: renderTextEditor, width: 120 },
  { key: 'cliente', name: 'CLIENTE', renderEditCell: renderTextEditor, width: 150 },
  { key: 'empresa', name: 'EMPRESA', renderEditCell: renderTextEditor, width: 200 },
  { key: 'ot', name: 'OT', renderEditCell: renderTextEditor, width: 80 },
  { key: 'equipo', name: 'EQUIPO', renderEditCell: renderTextEditor, width: 120 },
  { key: 'patente', name: 'PATENTE', renderEditCell: renderTextEditor, width: 100 },
  { key: 'trabajo', name: 'TRABAJO REALIZADO', renderEditCell: renderTextEditor, width: 300 },
  { key: 'ventaNeta', name: 'VENTA NETA', renderEditCell: renderTextEditor, width: 120 },
  { key: 'costoMateriales', name: 'COSTO MATERIALES', renderEditCell: renderTextEditor, width: 150 },
  { key: 'costoVarios', name: 'COSTO VARIOS', renderEditCell: renderTextEditor, width: 120 },
  // Columnas calculadas (no llevan renderEditCell para que sean de solo lectura)
  { key: 'balanceIngreso', name: 'BALANCE INGRESO', width: 150 },
  { key: 'estatus', name: 'ESTATUS', renderEditCell: renderTextEditor, width: 120 },
  { key: 'pagoNeto', name: 'PAGO NETO', renderEditCell: renderTextEditor, width: 120 },
  { key: 'pagoIva', name: 'TOTAL (C/ IVA)', width: 150 },
  { key: 'factura', name: 'FACTURA', renderEditCell: renderTextEditor, width: 100 },
  { key: 'fechaPago', name: 'FECHA DE PAGO', renderEditCell: renderTextEditor, width: 150 }
];

const filasEjemplo = [
  { 
    id: 1, 
    fecha: '2026-03-03', 
    cliente: 'PARTICULAR', 
    empresa: 'Sociedad Comercial Minera', 
    ot: '1464', 
    equipo: 'TOLVA', 
    patente: 'VSGX-17', 
    trabajo: 'Fabricacion e Instalacion Autoencarpe', 
    ventaNeta: '1900000', 
    costoMateriales: '1601000', 
    costoVarios: '0', 
    balanceIngreso: 299000, 
    estatus: 'CANCELADO', 
    pagoNeto: '1000000', 
    pagoIva: 2261000, 
    factura: '', 
    fechaPago: '2026-04-10' 
  }
];

export default function PlanillaView() {
  const { id } = useParams();
  const [rows, setRows] = useState(filasEjemplo);

  const titulo = id 
    ? id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') 
    : 'Planilla';

  // Funcion interceptora: Recibe los cambios y aplica las formulas matematicas
  const procesarCambiosDeFilas = (nuevasFilas: any[]) => {
    const filasActualizadas = nuevasFilas.map(fila => {
      const venta = parseInt(fila.ventaNeta) || 0;
      const mat = parseInt(fila.costoMateriales) || 0;
      const varCosto = parseInt(fila.costoVarios) || 0;

      return {
        ...fila,
        balanceIngreso: venta - mat - varCosto,
        pagoIva: Math.round(venta * 1.19)
      };
    });
    setRows(filasActualizadas);
  };

  const agregarFila = () => {
    const nuevaFila = {
      id: rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1,
      fecha: '', cliente: '', empresa: '', ot: '', equipo: '', patente: '', trabajo: '',
      ventaNeta: '0', costoMateriales: '0', costoVarios: '0', 
      balanceIngreso: 0, estatus: 'PENDIENTE', pagoNeto: '0', pagoIva: 0, 
      factura: '', fechaPago: ''
    };
    // Reutilizamos la funcion de formulas al crear una nueva fila
    procesarCambiosDeFilas([...rows, nuevaFila]);
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
          onRowsChange={procesarCambiosDeFilas}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}