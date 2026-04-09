import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Users, Upload } from 'lucide-react';
import { DataGrid, renderTextEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
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
  { key: 'balanceIngreso', name: 'BALANCE INGRESO', width: 150 },
  { key: 'estatus', name: 'ESTATUS', renderEditCell: renderTextEditor, width: 120 },
  { key: 'pagoNeto', name: 'PAGO NETO', renderEditCell: renderTextEditor, width: 120 },
  { key: 'pagoIva', name: 'TOTAL (C/ IVA)', width: 150 },
  { key: 'factura', name: 'FACTURA', renderEditCell: renderTextEditor, width: 100 },
  { key: 'fechaPago', name: 'FECHA DE PAGO', renderEditCell: renderTextEditor, width: 150 }
];

export default function PlanillaView() {
  const { id } = useParams();
  const [rows, setRows] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState<any>({});
  const userName = localStorage.getItem('userName') || 'Invitado';
  
  // Referencia para el input de archivo oculto
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'planillas', id), (docSnap) => {
      if (docSnap.exists()) {
        setRows(docSnap.data().rows || []);
      }
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const presenceRef = ref(rtdb, `presence/${id}/${userName}`);
    const totalPresenceRef = ref(rtdb, `presence/${id}`);

    set(presenceRef, { name: userName, lastSeen: Date.now(), editing: null });
    onDisconnect(presenceRef).remove();

    const unsubPresence = onValue(totalPresenceRef, (snapshot) => {
      setActiveUsers(snapshot.val() || {});
    });

    return () => unsubPresence();
  }, [id, userName]);

  const guardarEnNube = async (nuevasFilas: any[]) => {
    if (!id) return;
    await setDoc(doc(db, 'planillas', id), { rows: nuevasFilas }, { merge: true });
  };

  const procesarCambios = (nuevasFilas: any[]) => {
    const actualizadas = nuevasFilas.map(fila => {
      const venta = parseInt(fila.ventaNeta) || 0;
      const mat = parseInt(fila.costoMateriales) || 0;
      const varC = parseInt(fila.costoVarios) || 0;
      return {
        ...fila,
        balanceIngreso: venta - mat - varC,
        pagoIva: Math.round(venta * 1.19)
      };
    });
    setRows(actualizadas);
    guardarEnNube(actualizadas);
  };

  const agregarFila = () => {
    const nuevaFila = {
      id: rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1,
      fecha: '', cliente: '', empresa: '', ot: '', equipo: '', patente: '', trabajo: '',
      ventaNeta: '0', costoMateriales: '0', costoVarios: '0', 
      balanceIngreso: 0, estatus: 'PENDIENTE', pagoNeto: '0', pagoIva: 0, 
      factura: '', fechaPago: ''
    };
    const nuevasFilas = [...rows, nuevaFila];
    setRows(nuevasFilas);
    guardarEnNube(nuevasFilas);
  };

  // Funcion para leer e importar el archivo Excel/CSV sin perder datos
  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      let maxId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) : 0;

      // Mapeamos las columnas de tu Excel a las llaves de nuestro sistema
      const filasImportadas = jsonData.map((row: any) => {
        maxId += 1;
        return {
          id: maxId,
          fecha: row['FECHA'] || '',
          cliente: row['CLIENTE'] || '',
          empresa: row['EMPRESA '] || row['EMPRESA'] || '',
          ot: row['OT'] || '',
          equipo: row['EQUIPO'] || '',
          patente: row['PATENTE'] || '',
          trabajo: row['TRABAJO REALIZADO'] || '',
          ventaNeta: row['VENTA NETA']?.toString() || '0',
          costoMateriales: row['COSTO MATERIALES']?.toString() || '0',
          costoVarios: row['COSTO VARIOS']?.toString() || '0',
          estatus: row['ESTATUS'] || 'PENDIENTE',
          pagoNeto: row['PAGO NETO']?.toString() || '0',
          factura: row['FACTURA '] || row['FACTURA'] || '',
          fechaPago: row['FECHA DE PAGO'] || row['FECHA PAGO'] || ''
        };
      });

      // Sumamos lo que ya estaba en la base de datos con lo que acabamos de importar
      const nuevasFilas = [...rows, ...filasImportadas];
      
      // Pasamos las filas por la calculadora automática y guardamos en la nube
      procesarCambios(nuevasFilas);
    };
    reader.readAsArrayBuffer(file);
    
    // Reseteamos el input para que puedas subir el mismo archivo dos veces si te equivocas
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCellClick = (args: any) => {
    const presenceRef = ref(rtdb, `presence/${id}/${userName}`);
    set(presenceRef, { 
      name: userName, 
      editing: { row: args.row.id, column: args.column.key } 
    });
  };

  return (
    <div className="p-6 h-screen flex flex-col">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-2xl font-bold uppercase">{id?.replace('-', ' ')}</h1>
        
        <button 
          onClick={agregarFila}
          className="ml-4 flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Agregar Fila
        </button>

        {/* Boton y logica de Importar Excel */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={importarExcel} 
          accept=".xlsx, .xls, .csv" 
          className="hidden" 
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="ml-2 flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
        >
          <Upload size={20} />
          Importar Datos
        </button>

        <div className="flex -space-x-2 overflow-hidden ml-4">
          {Object.values(activeUsers).map((user: any) => (
            <div 
              key={user.name}
              title={`${user.name} esta ${user.editing ? 'editando' : 'viendo'}`}
              className={`inline-block h-8 w-8 rounded-full ring-2 ring-white flex items-center justify-center text-xs font-bold text-white ${user.name === userName ? 'bg-blue-500' : 'bg-green-500'}`}
            >
              {user.name[0]?.toUpperCase()}
            </div>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Users size={16} className="text-green-500" />
          <span className="text-sm text-gray-500">{Object.keys(activeUsers).length} activos</span>
        </div>
      </div>
      
      <div className="flex-1 bg-white border border-gray-200 rounded-lg shadow-inner overflow-hidden relative">
        <DataGrid 
          columns={columnasBase} 
          rows={rows} 
          onRowsChange={procesarCambios}
          onCellClick={handleCellClick}
          rowKeyGetter={(row) => row.id} 
          className="h-full w-full"
        />
      </div>
    </div>
  );
}