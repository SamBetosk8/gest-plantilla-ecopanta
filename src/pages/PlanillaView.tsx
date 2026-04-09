import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Users, Upload, PaintBucket } from 'lucide-react';
import { DataGrid, renderTextEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
import 'react-data-grid/lib/styles.css';

// Función auxiliar para crear filas limpias (ahora incluye "format" para guardar los colores)
const crearFilaVacia = (id: number) => ({
  id, fecha: '', cliente: '', empresa: '', ot: '', equipo: '', patente: '', trabajo: '',
  ventaNeta: '0', costoMateriales: '0', costoVarios: '0', 
  balanceIngreso: 0, estatus: 'PENDIENTE', pagoNeto: '0', pagoIva: 0, 
  factura: '', fechaPago: '', format: {} 
});

const esFilaVacia = (fila: any) => {
  return !fila.cliente && !fila.empresa && !fila.trabajo && fila.ventaNeta === '0';
};

const obtenerColorUsuario = (nombre: string) => {
  const paleta = [
    { bg: 'bg-blue-500', border: 'ring-blue-500' },
    { bg: 'bg-red-500', border: 'ring-red-500' },   
    { bg: 'bg-green-500', border: 'ring-green-500' }, 
    { bg: 'bg-purple-500', border: 'ring-purple-500' }, 
    { bg: 'bg-orange-500', border: 'ring-orange-500' } 
  ];
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash += nombre.charCodeAt(i);
  return paleta[hash % paleta.length];
};

export default function PlanillaView() {
  const { id } = useParams();
  const [rows, setRows] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState<any>({});
  
  // Nuevo estado para saber qué celda seleccionaste para poder pintarla
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{rowId: number, columnKey: string} | null>(null);
  
  const userName = localStorage.getItem('userName') || 'Invitado';
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'planillas', id), (docSnap) => {
      if (docSnap.exists()) {
        const datos = docSnap.data().rows || [];
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
        pagoIva: Math.round(venta * 1.19),
        format: fila.format || {} // Asegurar que format exista
      };
    });

    const ultimaFila = actualizadas[actualizadas.length - 1];
    if (ultimaFila && !esFilaVacia(ultimaFila)) {
      actualizadas.push(crearFilaVacia(Math.max(...actualizadas.map(r => r.id)) + 1));
    }

    setRows(actualizadas);
    guardarEnNube(actualizadas);
  };

  // Función para pintar la celda seleccionada
  const pintarCelda = (colorClass: string) => {
    if (!celdaSeleccionada) return;
    
    const nuevasFilas = rows.map(fila => {
      if (fila.id === celdaSeleccionada.rowId) {
        return {
          ...fila,
          format: {
            ...fila.format,
            [celdaSeleccionada.columnKey]: colorClass
          }
        };
      }
      return fila;
    });
    
    setRows(nuevasFilas);
    guardarEnNube(nuevasFilas);
  };

  // Lógica Visual: Mezcla el color de fondo guardado con el borde de quien está editando
  const getCellClass = (row: any, columnKey: string) => {
    let classes = row.format?.[columnKey] || ''; // Color de fondo si lo tiene
    
    for (const key in activeUsers) {
      const user = activeUsers[key];
      if (user.editing && user.editing.row === row.id && user.editing.column === columnKey) {
        // z-10 y ring-2 aseguran que el borde resalte fuerte por encima del resto
        classes += ` ring-2 ring-inset z-10 relative ${obtenerColorUsuario(user.name).border}`;
      }
    }
    return classes;
  };

  const columnasBase = useMemo(() => [
    { key: 'id', name: 'N°', width: 60 },
    { key: 'fecha', name: 'FECHA', renderEditCell: renderTextEditor, width: 120, cellClass: (r: any) => getCellClass(r, 'fecha') },
    { key: 'cliente', name: 'CLIENTE', renderEditCell: renderTextEditor, width: 150, cellClass: (r: any) => getCellClass(r, 'cliente') },
    { key: 'empresa', name: 'EMPRESA', renderEditCell: renderTextEditor, width: 200, cellClass: (r: any) => getCellClass(r, 'empresa') },
    { key: 'ot', name: 'OT', renderEditCell: renderTextEditor, width: 80, cellClass: (r: any) => getCellClass(r, 'ot') },
    { key: 'equipo', name: 'EQUIPO', renderEditCell: renderTextEditor, width: 120, cellClass: (r: any) => getCellClass(r, 'equipo') },
    { key: 'patente', name: 'PATENTE', renderEditCell: renderTextEditor, width: 100, cellClass: (r: any) => getCellClass(r, 'patente') },
    { key: 'trabajo', name: 'TRABAJO REALIZADO', renderEditCell: renderTextEditor, width: 300, cellClass: (r: any) => getCellClass(r, 'trabajo') },
    { key: 'ventaNeta', name: 'VENTA NETA', renderEditCell: renderTextEditor, width: 120, cellClass: (r: any) => getCellClass(r, 'ventaNeta') },
    { key: 'costoMateriales', name: 'COSTO MATERIALES', renderEditCell: renderTextEditor, width: 150, cellClass: (r: any) => getCellClass(r, 'costoMateriales') },
    { key: 'costoVarios', name: 'COSTO VARIOS', renderEditCell: renderTextEditor, width: 120, cellClass: (r: any) => getCellClass(r, 'costoVarios') },
    { key: 'balanceIngreso', name: 'BALANCE INGRESO', width: 150, cellClass: (r: any) => getCellClass(r, 'balanceIngreso') },
    { key: 'estatus', name: 'ESTATUS', renderEditCell: renderTextEditor, width: 120, cellClass: (r: any) => getCellClass(r, 'estatus') },
    { key: 'pagoNeto', name: 'PAGO NETO', renderEditCell: renderTextEditor, width: 120, cellClass: (r: any) => getCellClass(r, 'pagoNeto') },
    { key: 'pagoIva', name: 'TOTAL (C/ IVA)', width: 150, cellClass: (r: any) => getCellClass(r, 'pagoIva') },
    { key: 'factura', name: 'FACTURA', renderEditCell: renderTextEditor, width: 100, cellClass: (r: any) => getCellClass(r, 'factura') },
    { key: 'fechaPago', name: 'FECHA DE PAGO', renderEditCell: renderTextEditor, width: 150, cellClass: (r: any) => getCellClass(r, 'fechaPago') }
  ], [activeUsers, rows]); // Ahora las columnas se actualizan si cambian las filas (por los colores)

  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    // ... (Mismo código de importación de antes)
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

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
          fechaPago: row['FECHA DE PAGO'] || row['FECHA PAGO'] || '', format: {}
        };
      });

      procesarCambios([...filasActuales, ...filasImportadas]);
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCellClick = (args: any) => {
    // Guarda localmente qué celda tocaste por si quieres pintarla
    setCeldaSeleccionada({ rowId: args.row.id, columnKey: args.column.key });

    // Avisa a Firebase dónde estás editando
    const presenceRef = ref(rtdb, `presence/${id}/${userName}`);
    set(presenceRef, { 
      name: userName, 
      editing: { row: args.row.id, column: args.column.key } 
    });
  };

  return (
    // Reduje el padding principal (p-2) para hacer la tabla más ancha y alta
    <div className="p-2 h-screen flex flex-col bg-gray-50">
      
      {/* Barra de Herramientas Superior */}
      <div className="flex items-center gap-4 mb-3 px-2">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-xl font-bold uppercase text-gray-800 mr-4">{id?.replace('-', ' ')}</h1>
        
        {/* Herramienta de Relleno de Color (Estilo Excel) */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
          <PaintBucket size={18} className="text-gray-400 mx-2" />
          <button onClick={() => pintarCelda('bg-yellow-100 text-yellow-900')} className="w-6 h-6 rounded bg-yellow-100 border border-yellow-300 hover:scale-110 transition-transform" title="Amarillo" />
          <button onClick={() => pintarCelda('bg-green-100 text-green-900')} className="w-6 h-6 rounded bg-green-100 border border-green-300 hover:scale-110 transition-transform" title="Verde" />
          <button onClick={() => pintarCelda('bg-red-100 text-red-900')} className="w-6 h-6 rounded bg-red-100 border border-red-300 hover:scale-110 transition-transform" title="Rojo" />
          <button onClick={() => pintarCelda('bg-blue-100 text-blue-900')} className="w-6 h-6 rounded bg-blue-100 border border-blue-300 hover:scale-110 transition-transform" title="Azul" />
          <button onClick={() => pintarCelda('')} className="w-6 h-6 rounded bg-white border border-gray-300 hover:scale-110 transition-transform flex items-center justify-center text-xs text-gray-400" title="Quitar Color">✖</button>
        </div>

        <input type="file" ref={fileInputRef} onChange={importarExcel} accept=".xlsx, .xls, .csv" className="hidden" />
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="ml-4 flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-green-700 transition-colors"
        >
          <Upload size={16} />
          Importar
        </button>

        {/* Avatares de Usuarios (Solo 1 Letra) */}
        <div className="flex -space-x-2 overflow-hidden ml-auto pr-4">
          {Object.values(activeUsers).map((user: any) => (
            <div 
              key={user.name}
              title={user.name}
              className={`inline-flex h-8 w-8 rounded-full ring-2 ring-white items-center justify-center text-xs font-bold text-white shadow-sm ${obtenerColorUsuario(user.name).bg}`}
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-gray-200 shadow-sm">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-xs font-medium text-gray-600">{Object.keys(activeUsers).length} en línea</span>
        </div>
      </div>
      
      {/* Contenedor de la Tabla Extendida */}
      <div className="flex-1 bg-white border border-gray-300 shadow-sm overflow-hidden relative">
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