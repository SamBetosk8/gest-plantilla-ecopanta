import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Users, Upload } from 'lucide-react';
import { DataGrid, renderTextEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
import 'react-data-grid/lib/styles.css';

// Función auxiliar para crear filas limpias
const crearFilaVacia = (id: number) => ({
  id, fecha: '', cliente: '', empresa: '', ot: '', equipo: '', patente: '', trabajo: '',
  ventaNeta: '0', costoMateriales: '0', costoVarios: '0', 
  balanceIngreso: 0, estatus: 'PENDIENTE', pagoNeto: '0', pagoIva: 0, 
  factura: '', fechaPago: ''
});

// Comprueba si una fila está completamente en blanco
const esFilaVacia = (fila: any) => {
  return !fila.cliente && !fila.empresa && !fila.trabajo && fila.ventaNeta === '0';
};

// Generador de colores consistentes basados en el nombre
const obtenerColorUsuario = (nombre: string) => {
  const paleta = [
    { bg: 'bg-blue-500', border: 'ring-blue-500 bg-blue-50' }, // Azul
    { bg: 'bg-red-500', border: 'ring-red-500 bg-red-50' },   // Rojo
    { bg: 'bg-green-500', border: 'ring-green-500 bg-green-50' }, // Verde
    { bg: 'bg-purple-500', border: 'ring-purple-500 bg-purple-50' }, // Morado
    { bg: 'bg-orange-500', border: 'ring-orange-500 bg-orange-50' } // Naranja
  ];
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash += nombre.charCodeAt(i);
  return paleta[hash % paleta.length];
};

export default function PlanillaView() {
  const { id } = useParams();
  const [rows, setRows] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState<any>({});
  const userName = localStorage.getItem('userName') || 'Invitado';
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'planillas', id), (docSnap) => {
      if (docSnap.exists()) {
        const datos = docSnap.data().rows || [];
        // Magia 1: Si la tabla carga y no tiene una fila vacía al final, la agregamos
        if (datos.length === 0 || !esFilaVacia(datos[datos.length - 1])) {
          datos.push(crearFilaVacia(datos.length > 0 ? Math.max(...datos.map((r: any) => r.id)) + 1 : 1));
        }
        setRows(datos);
      } else {
        setRows([crearFilaVacia(1)]);
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
    let actualizadas = nuevasFilas.map(fila => {
      const venta = parseInt(fila.ventaNeta) || 0;
      const mat = parseInt(fila.costoMateriales) || 0;
      const varC = parseInt(fila.costoVarios) || 0;
      return {
        ...fila,
        balanceIngreso: venta - mat - varC,
        pagoIva: Math.round(venta * 1.19)
      };
    });

    // Magia 2: Auto-generador de filas al escribir
    const ultimaFila = actualizadas[actualizadas.length - 1];
    if (ultimaFila && !esFilaVacia(ultimaFila)) {
      actualizadas.push(crearFilaVacia(Math.max(...actualizadas.map(r => r.id)) + 1));
    }

    setRows(actualizadas);
    guardarEnNube(actualizadas);
  };

  // Magia 3: Iluminar la celda que están tocando los demás
  const getCellClass = (rowId: number, columnKey: string) => {
    for (const key in activeUsers) {
      const user = activeUsers[key];
      // Si el usuario está editando ESTA celda específica
      if (user.editing && user.editing.row === rowId && user.editing.column === columnKey) {
        return `ring-2 ring-inset ${obtenerColorUsuario(user.name).border}`;
      }
    }
    return ''; // Sin color si nadie la toca
  };

  // Columnas dinámicas que reaccionan a los usuarios activos
  const columnasBase = useMemo(() => [
    { key: 'id', name: 'N°', width: 60 },
    { key: 'fecha', name: 'FECHA', renderEditCell: renderTextEditor, width: 120, cellClass: (r: any) => getCellClass(r.id, 'fecha') },
    { key: 'cliente', name: 'CLIENTE', renderEditCell: renderTextEditor, width: 150, cellClass: (r: any) => getCellClass(r.id, 'cliente') },
    { key: 'empresa', name: 'EMPRESA', renderEditCell: renderTextEditor, width: 200, cellClass: (r: any) => getCellClass(r.id, 'empresa') },
    { key: 'ot', name: 'OT', renderEditCell: renderTextEditor, width: 80, cellClass: (r: any) => getCellClass(r.id, 'ot') },
    { key: 'equipo', name: 'EQUIPO', renderEditCell: renderTextEditor, width: 120, cellClass: (r: any) => getCellClass(r.id, 'equipo') },
    { key: 'patente', name: 'PATENTE', renderEditCell: renderTextEditor, width: 100, cellClass: (r: any) => getCellClass(r.id, 'patente') },
    { key: 'trabajo', name: 'TRABAJO REALIZADO', renderEditCell: renderTextEditor, width: 300, cellClass: (r: any) => getCellClass(r.id, 'trabajo') },
    { key: 'ventaNeta', name: 'VENTA NETA', renderEditCell: renderTextEditor, width: 120, cellClass: (r: any) => getCellClass(r.id, 'ventaNeta') },
    { key: 'costoMateriales', name: 'COSTO MATERIALES', renderEditCell: renderTextEditor, width: 150, cellClass: (r: any) => getCellClass(r.id, 'costoMateriales') },
    { key: 'costoVarios', name: 'COSTO VARIOS', renderEditCell: renderTextEditor, width: 120, cellClass: (r: any) => getCellClass(r.id, 'costoVarios') },
    { key: 'balanceIngreso', name: 'BALANCE INGRESO', width: 150 },
    { key: 'estatus', name: 'ESTATUS', renderEditCell: renderTextEditor, width: 120, cellClass: (r: any) => getCellClass(r.id, 'estatus') },
    { key: 'pagoNeto', name: 'PAGO NETO', renderEditCell: renderTextEditor, width: 120, cellClass: (r: any) => getCellClass(r.id, 'pagoNeto') },
    { key: 'pagoIva', name: 'TOTAL (C/ IVA)', width: 150 },
    { key: 'factura', name: 'FACTURA', renderEditCell: renderTextEditor, width: 100, cellClass: (r: any) => getCellClass(r.id, 'factura') },
    { key: 'fechaPago', name: 'FECHA DE PAGO', renderEditCell: renderTextEditor, width: 150, cellClass: (r: any) => getCellClass(r.id, 'fechaPago') }
  ], [activeUsers]); 

  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Quitamos la fila vacía del final antes de importar para que no quede colgando
      const filasActuales = rows.filter(r => !esFilaVacia(r));
      let maxId = filasActuales.length > 0 ? Math.max(...filasActuales.map(r => r.id)) : 0;

      const filasImportadas = jsonData.map((row: any) => {
        maxId += 1;
        return {
          id: maxId,
          fecha: row['FECHA'] || '', cliente: row['CLIENTE'] || '', empresa: row['EMPRESA '] || row['EMPRESA'] || '',
          ot: row['OT'] || '', equipo: row['EQUIPO'] || '', patente: row['PATENTE'] || '', trabajo: row['TRABAJO REALIZADO'] || '',
          ventaNeta: row['VENTA NETA']?.toString() || '0', costoMateriales: row['COSTO MATERIALES']?.toString() || '0',
          costoVarios: row['COSTO VARIOS']?.toString() || '0', estatus: row['ESTATUS'] || 'PENDIENTE',
          pagoNeto: row['PAGO NETO']?.toString() || '0', factura: row['FACTURA '] || row['FACTURA'] || '',
          fechaPago: row['FECHA DE PAGO'] || row['FECHA PAGO'] || ''
        };
      });

      procesarCambios([...filasActuales, ...filasImportadas]);
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCellClick = (args: any) => {
    const presenceRef = ref(rtdb, `presence/${id}/${userName}`);
    set(presenceRef, { 
      name: userName, 
      editing: { row: args.row.id, column: args.column.key } 
    });
  };

  return (
    <div className="p-6 h-screen flex flex-col bg-gray-50">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-2xl font-bold uppercase text-gray-800">{id?.replace('-', ' ')}</h1>
        
        <input type="file" ref={fileInputRef} onChange={importarExcel} accept=".xlsx, .xls, .csv" className="hidden" />
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="ml-4 flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg shadow hover:bg-green-700 transition-colors"
        >
          <Upload size={20} />
          Importar Archivo
        </button>

        <div className="flex -space-x-2 overflow-hidden ml-auto pr-4">
          {Object.values(activeUsers).map((user: any) => (
            <div 
              key={user.name}
              title={user.name}
              className={`inline-flex h-10 w-10 rounded-full ring-2 ring-white items-center justify-center text-sm font-bold text-white shadow-sm ${obtenerColorUsuario(user.name).bg}`}
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-gray-200 shadow-sm">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
          </span>
          <span className="text-sm font-medium text-gray-600">{Object.keys(activeUsers).length} en línea</span>
        </div>
      </div>
      
      <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden relative">
        <DataGrid 
          columns={columnasBase} 
          rows={rows} 
          onRowsChange={procesarCambios}
          onCellClick={handleCellClick}
          rowKeyGetter={(row) => row.id}
          className="h-full w-full custom-grid"
        />
      </div>
    </div>
  );
}