import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, PaintBucket, Plus, FileSpreadsheet, Calculator, X, Edit2 } from 'lucide-react';
import { DataGrid, renderTextEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
import 'react-data-grid/lib/styles.css';

// --- GENERADORES Y AUXILIARES ---
const crearFilaVacia = (id: number) => ({ id, format: {} });
const crearFilaSueldo = (id: number) => ({ id, trabajador: '', sueldo: '0', cotizacion: '0' });

const esFilaVacia = (fila: any) => Object.keys(fila).every(k => k === 'id' || k === 'format' || !fila[k] || fila[k] === '0');
const esFilaSueldoVacia = (fila: any) => !fila.trabajador && (!fila.sueldo || fila.sueldo === '0') && (!fila.cotizacion || fila.cotizacion === '0');

const obtenerColorUsuario = (nombre: string) => {
  const paleta = [
    { bg: 'bg-blue-500', border: 'ring-blue-500' }, { bg: 'bg-red-500', border: 'ring-red-500' },   
    { bg: 'bg-green-500', border: 'ring-green-500' }, { bg: 'bg-purple-500', border: 'ring-purple-500' }, 
    { bg: 'bg-orange-500', border: 'ring-orange-500' } 
  ];
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash += nombre.charCodeAt(i);
  return paleta[hash % paleta.length];
};

export default function PlanillaView() {
  const { id } = useParams();
  const userName = localStorage.getItem('userName') || 'Invitado';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- ESTADOS ---
  const [hojas, setHojas] = useState<any[]>([{ id: 'hoja-1', nombre: 'Hoja 1', rows: [crearFilaVacia(1)], sueldos: [crearFilaSueldo(1)] }]);
  const [hojaActivaId, setHojaActivaId] = useState<string>('hoja-1');
  const [activeUsers, setActiveUsers] = useState<any>({});
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{rowId: number, columnKey: string} | null>(null);
  const [mostrarSueldos, setMostrarSueldos] = useState(false);

  const hojaActiva = hojas.find(h => h.id === hojaActivaId) || hojas[0];
  const esFactura = id?.includes('factura');

  // --- FIREBASE SYNC ---
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'planillas', id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.hojas) {
          setHojas(data.hojas);
        } else if (data.rows) {
          setHojas([{ id: 'hoja-1', nombre: 'General', rows: data.rows, sueldos: [crearFilaSueldo(1)] }]);
        }
      }
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const presenceRef = ref(rtdb, `presence/${id}/${userName}`);
    const totalPresenceRef = ref(rtdb, `presence/${id}`);
    set(presenceRef, { name: userName, lastSeen: Date.now(), editing: null, activeSheet: hojaActivaId });
    onDisconnect(presenceRef).remove();

    const unsubPresence = onValue(totalPresenceRef, (snapshot) => {
      setActiveUsers(snapshot.val() || {});
    });
    return () => unsubPresence();
  }, [id, userName, hojaActivaId]);

  const guardarEnNube = async (nuevasHojas: any[]) => {
    if (!id) return;
    await setDoc(doc(db, 'planillas', id), { hojas: nuevasHojas }, { merge: true });
  };

  // --- LÓGICA DE DATOS PRINCIPAL ---
  const procesarCambios = (nuevasFilas: any[]) => {
    let actualizadas = nuevasFilas.map(fila => {
      if (!esFactura) {
        const venta = parseInt(fila.ventaNeta) || 0;
        const mat = parseInt(fila.costoMateriales) || 0;
        const varC = parseInt(fila.costoVarios) || 0;
        fila.balanceIngreso = venta - mat - varC;
        fila.pagoIva = Math.round(venta * 1.19);
      }
      fila.format = fila.format || {};
      return fila;
    });

    if (actualizadas[actualizadas.length - 1] && !esFilaVacia(actualizadas[actualizadas.length - 1])) {
      actualizadas.push(crearFilaVacia(Math.max(...actualizadas.map(r => r.id)) + 1));
    }

    const nuevasHojas = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: actualizadas } : h);
    setHojas(nuevasHojas);
    guardarEnNube(nuevasHojas);
  };

  const procesarCambiosSueldos = (nuevasFilasSueldo: any[]) => {
    let actualizadas = [...nuevasFilasSueldo];
    if (actualizadas[actualizadas.length - 1] && !esFilaSueldoVacia(actualizadas[actualizadas.length - 1])) {
      actualizadas.push(crearFilaSueldo(Math.max(...actualizadas.map(r => r.id)) + 1));
    }
    const nuevasHojas = hojas.map(h => h.id === hojaActivaId ? { ...h, sueldos: actualizadas } : h);
    setHojas(nuevasHojas);
    guardarEnNube(nuevasHojas);
  };

  // --- LÓGICA DE HOJAS (TABS) ---
  const agregarHoja = () => {
    const nuevoNombre = prompt('Nombre de la nueva hoja:');
    if (!nuevoNombre) return;
    const nuevaHojaId = `hoja-${Date.now()}`;
    const nuevasHojas = [...hojas, { id: nuevaHojaId, nombre: nuevoNombre, rows: [crearFilaVacia(1)], sueldos: [crearFilaSueldo(1)] }];
    setHojas(nuevasHojas);
    setHojaActivaId(nuevaHojaId);
    guardarEnNube(nuevasHojas);
  };

  const renombrarHoja = (hojaId: string, nombreActual: string) => {
    const nuevoNombre = prompt('Renombrar hoja a:', nombreActual);
    if (!nuevoNombre || nuevoNombre === nombreActual) return;
    const nuevasHojas = hojas.map(h => h.id === hojaId ? { ...h, nombre: nuevoNombre } : h);
    setHojas(nuevasHojas);
    guardarEnNube(nuevasHojas);
  };

  const eliminarHoja = (hojaId: string) => {
    if (hojas.length <= 1) return alert("No puedes eliminar la única hoja que queda.");
    if (window.confirm("¿Estás seguro de que deseas ELIMINAR esta hoja y TODOS sus datos?")) {
      const nuevasHojas = hojas.filter(h => h.id !== hojaId);
      setHojas(nuevasHojas);
      setHojaActivaId(nuevasHojas[0].id);
      guardarEnNube(nuevasHojas);
    }
  };

  // --- FORMATO VISUAL ---
  const pintarCelda = (colorClass: string) => {
    if (!celdaSeleccionada) return;
    const nuevasFilas = hojaActiva.rows.map((fila: any) => {
      if (fila.id === celdaSeleccionada.rowId) {
        return { ...fila, format: { ...fila.format, [celdaSeleccionada.columnKey]: colorClass } };
      }
      return fila;
    });
    const nuevasHojas = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: nuevasFilas } : h);
    setHojas(nuevasHojas);
    guardarEnNube(nuevasHojas);
  };

  const getCellClass = (row: any, columnKey: string) => {
    let classes = row.format?.[columnKey] || ''; 
    for (const key in activeUsers) {
      const user = activeUsers[key];
      if (user.activeSheet === hojaActivaId && user.editing && user.editing.row === row.id && user.editing.column === columnKey) {
        classes += ` ring-2 ring-inset z-10 relative ${obtenerColorUsuario(user.name).border}`;
      }
    }
    return classes;
  };

  // --- COLUMNAS (AHORA TODAS SON REDIMENSIONABLES - resizable: true) ---
  const columnasBase = useMemo(() => {
    if (esFactura) {
      return [
        { key: 'id', name: 'N°', width: 60, resizable: true },
        { key: 'fecha', name: 'FECHA', renderEditCell: renderTextEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'fecha') },
        { key: 'nFactura', name: 'N° FACTURA', renderEditCell: renderTextEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'nFactura') },
        { key: 'nBoleta', name: 'N° BOLETA', renderEditCell: renderTextEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'nBoleta') },
        { key: 'proveedor', name: 'PROVEEDOR', renderEditCell: renderTextEditor, width: 200, resizable: true, cellClass: (r: any) => getCellClass(r, 'proveedor') },
        { key: 'insumo', name: 'INSUMO / DETALLE', renderEditCell: renderTextEditor, width: 400, resizable: true, cellClass: (r: any) => getCellClass(r, 'insumo') },
        { key: 'totalFactura', name: 'TOTAL FACTURA', renderEditCell: renderTextEditor, width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'totalFactura') },
        { key: 'totalBoleta', name: 'TOTAL BOLETA', renderEditCell: renderTextEditor, width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'totalBoleta') },
        { key: 'observaciones', name: 'OBSERVACIONES', renderEditCell: renderTextEditor, width: 250, resizable: true, cellClass: (r: any) => getCellClass(r, 'observaciones') }
      ];
    } else {
      return [
        { key: 'id', name: 'N°', width: 60, resizable: true },
        { key: 'fecha', name: 'FECHA', renderEditCell: renderTextEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'fecha') },
        { key: 'cliente', name: 'CLIENTE', renderEditCell: renderTextEditor, width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'cliente') },
        { key: 'empresa', name: 'EMPRESA', renderEditCell: renderTextEditor, width: 200, resizable: true, cellClass: (r: any) => getCellClass(r, 'empresa') },
        { key: 'ot', name: 'OT', renderEditCell: renderTextEditor, width: 80, resizable: true, cellClass: (r: any) => getCellClass(r, 'ot') },
        { key: 'equipo', name: 'EQUIPO', renderEditCell: renderTextEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'equipo') },
        { key: 'patente', name: 'PATENTE', renderEditCell: renderTextEditor, width: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'patente') },
        { key: 'trabajo', name: 'TRABAJO REALIZADO', renderEditCell: renderTextEditor, width: 300, resizable: true, cellClass: (r: any) => getCellClass(r, 'trabajo') },
        { key: 'ventaNeta', name: 'VENTA NETA', renderEditCell: renderTextEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'ventaNeta') },
        { key: 'costoMateriales', name: 'COSTO MATERIALES', renderEditCell: renderTextEditor, width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'costoMateriales') },
        { key: 'costoVarios', name: 'COSTO VARIOS', renderEditCell: renderTextEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'costoVarios') },
        { key: 'balanceIngreso', name: 'BALANCE INGRESO', width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'balanceIngreso') },
        { key: 'estatus', name: 'ESTATUS', renderEditCell: renderTextEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'estatus') },
        { key: 'pagoNeto', name: 'PAGO NETO', renderEditCell: renderTextEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'pagoNeto') },
        { key: 'pagoIva', name: 'TOTAL (C/ IVA)', width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'pagoIva') },
        { key: 'factura', name: 'FACTURA', renderEditCell: renderTextEditor, width: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'factura') },
        { key: 'fechaPago', name: 'FECHA DE PAGO', renderEditCell: renderTextEditor, width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'fechaPago') }
      ];
    }
  }, [activeUsers, hojas, hojaActivaId]);

  const columnasSueldos = [
    { key: 'id', name: 'N°', width: 60, resizable: true },
    { key: 'trabajador', name: 'TRABAJADOR', renderEditCell: renderTextEditor, width: 250, resizable: true },
    { key: 'sueldo', name: 'SUELDO LÍQUIDO', renderEditCell: renderTextEditor, width: 150, resizable: true },
    { key: 'cotizacion', name: 'COTIZACIONES', renderEditCell: renderTextEditor, width: 150, resizable: true }
  ];

  // --- IMPORTACIÓN INTELIGENTE (Detecta Sueldos y evita basura) ---
  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const modoReemplazo = window.confirm(
      "¿Deseas REEMPLAZAR los datos actuales?\n\n" +
      "Aceptar (OK) = Borrará todo y pondrá los datos nuevos.\n" +
      "Cancelar = Agregará los datos nuevos al final de la tabla."
    );

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // 1. ESCÁNER DE SUELDOS (Lee el archivo en crudo para detectar la linea de sueldos)
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
      let sueldosExtraidos: any[] = [];
      let idSueldoBase = 1000;

      for (let i = 0; i < rawRows.length; i++) {
        const rowArr = rawRows[i] as string[];
        const rowStr = rowArr.join(' ').toUpperCase();
        
        if (rowStr.includes('SUELDO')) {
          const idxSueldo = rowArr.findIndex(c => String(c).toUpperCase().includes('SUELDO'));
          const idxCotiz = rowArr.findIndex(c => String(c).toUpperCase().includes('COTIZA'));
          
          if (i + 1 < rawRows.length) {
            const nextRow = rawRows[i + 1] as string[];
            const valSueldo = idxSueldo !== -1 && nextRow[idxSueldo] ? String(nextRow[idxSueldo]).replace(/[^0-9]/g, '') : '0';
            const valCotiz = idxCotiz !== -1 && nextRow[idxCotiz] ? String(nextRow[idxCotiz]).replace(/[^0-9]/g, '') : '0';
            
            if (valSueldo !== '0' || valCotiz !== '0') {
              sueldosExtraidos.push({
                id: idSueldoBase++,
                trabajador: 'Importado (Auto-Detectado)',
                sueldo: valSueldo,
                cotizacion: valCotiz
              });
            }
          }
        }
      }

      // 2. PROCESAMIENTO DE TABLA PRINCIPAL (Evitando basura)
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
      const filasActuales = modoReemplazo ? [] : hojaActiva.rows.filter((r: any) => !esFilaVacia(r));
      let maxId = filasActuales.length > 0 ? Math.max(...filasActuales.map((r: any) => r.id)) : 0;

      const filasImportadas: any[] = [];
      jsonData.forEach((row: any) => {
        const rowUpper = Object.values(row).join(' ').toUpperCase();
        // Si detecta la palabra sueldo, salta esta fila para no meterla en la tabla general
        if (rowUpper.includes('SUELDO') || rowUpper.includes('COTIZA')) return; 
        
        // Filtro de "filas fantasma" al final del Excel
        const tieneFecha = !!row['FECHA'];
        const tieneTrabajo = !!row['TRABAJO REALIZADO'] || !!row['CLIENTE'];
        const tieneProv = !!row['PROVEEDOR'] || !!row['INSUMO'] || !!row['DETALLE'];
        
        if (!tieneFecha && !tieneTrabajo && !tieneProv) return; // Si no tiene nada de valor, la ignora

        maxId += 1;
        if (esFactura) {
          filasImportadas.push({
            id: maxId,
            fecha: row['FECHA'] || '', nFactura: row['N° FACTURA'] || '', nBoleta: row['N°BOLETA'] || row['N° BOLETA'] || '',
            proveedor: row['PROVEEDOR'] || '', insumo: row['INSUMO'] || row['DETALLE'] || '',
            totalFactura: row['TOTAL FACTURAS'] || row['TOTAL FACTURA'] || '0', 
            totalBoleta: row['TOTAL BOLETAS'] || row['TOTAL BOLETA'] || '0', format: {}
          });
        } else {
          filasImportadas.push({
            id: maxId,
            fecha: row['FECHA'] || '', cliente: row['CLIENTE'] || '', empresa: row['EMPRESA '] || row['EMPRESA'] || '',
            ot: row['OT'] || '', equipo: row['EQUIPO'] || '', patente: row['PATENTE'] || '', trabajo: row['TRABAJO REALIZADO'] || '',
            ventaNeta: row['VENTA NETA'] || '0', costoMateriales: row['COSTO MATERIALES'] || '0',
            costoVarios: row['COSTO VARIOS'] || '0', estatus: row['ESTATUS'] || 'PENDIENTE',
            pagoNeto: row['PAGO NETO'] || '0', factura: row['FACTURA '] || row['FACTURA'] || '',
            fechaPago: row['FECHA DE PAGO'] || row['FECHA PAGO'] || '', format: {}
          });
        }
      });

      // 3. JUNTAR TODO Y GUARDAR
      const nuevasFilas = [...filasActuales, ...filasImportadas];
      const sueldosActuales = modoReemplazo ? [] : (hojaActiva.sueldos || []).filter((s:any) => !esFilaSueldoVacia(s));
      const todosLosSueldos = [...sueldosActuales, ...sueldosExtraidos];

      const hojasActualizadas = hojas.map(h => {
        if (h.id === hojaActivaId) {
          // Asegurar filas en blanco al final
          if (nuevasFilas.length === 0 || !esFilaVacia(nuevasFilas[nuevasFilas.length - 1])) nuevasFilas.push(crearFilaVacia(maxId + 1));
          if (todosLosSueldos.length === 0 || !esFilaSueldoVacia(todosLosSueldos[todosLosSueldos.length - 1])) todosLosSueldos.push(crearFilaSueldo(idSueldoBase + 1));
          
          return { ...h, rows: nuevasFilas, sueldos: todosLosSueldos };
        }
        return h;
      });

      setHojas(hojasActualizadas);
      guardarEnNube(hojasActualizadas);
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCellClick = (args: any) => {
    setCeldaSeleccionada({ rowId: args.row.id, columnKey: args.column.key });
    const presenceRef = ref(rtdb, `presence/${id}/${userName}`);
    set(presenceRef, { name: userName, editing: { row: args.row.id, column: args.column.key }, activeSheet: hojaActivaId });
  };

  return (
    <div className="p-2 h-screen flex flex-col bg-gray-50 overflow-hidden relative">
      
      {/* Estilos para forzar BORDES TIPO EXCEL */}
      <style>{`
        .rdg { --rdg-border-color: #d1d5db; }
        .rdg-cell { border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
        .rdg-header-cell { background-color: #f3f4f6; border-bottom: 2px solid #9ca3af; font-weight: bold; color: #374151; }
      `}</style>

      {/* Barra de Herramientas Superior */}
      <div className="flex items-center gap-4 mb-2 px-2 shrink-0">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-xl font-bold uppercase text-gray-800 mr-2">{id?.replace('-', ' ')}</h1>
        
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
          <PaintBucket size={18} className="text-gray-400 mx-2" />
          <button onClick={() => pintarCelda('bg-yellow-100 text-yellow-900')} className="w-6 h-6 rounded bg-yellow-100 border border-yellow-300 hover:scale-110" />
          <button onClick={() => pintarCelda('bg-green-100 text-green-900')} className="w-6 h-6 rounded bg-green-100 border border-green-300 hover:scale-110" />
          <button onClick={() => pintarCelda('bg-red-100 text-red-900')} className="w-6 h-6 rounded bg-red-100 border border-red-300 hover:scale-110" />
          <button onClick={() => pintarCelda('bg-blue-100 text-blue-900')} className="w-6 h-6 rounded bg-blue-100 border border-blue-300 hover:scale-110" />
          <button onClick={() => pintarCelda('')} className="w-6 h-6 rounded bg-white border border-gray-300 hover:scale-110 text-xs text-gray-400">✖</button>
        </div>

        <input type="file" ref={fileInputRef} onChange={importarExcel} accept=".xlsx, .xls, .csv" className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="ml-2 flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-green-700">
          <Upload size={16} /> Importar
        </button>

        {/* Boton Mini-Tabla de Sueldos */}
        {!esFactura && (
          <button 
            onClick={() => setMostrarSueldos(!mostrarSueldos)} 
            className="ml-2 flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-blue-700"
          >
            <Calculator size={16} /> Sueldos y Cotizaciones
          </button>
        )}

        <div className="flex -space-x-2 overflow-hidden ml-auto pr-4">
          {Object.values(activeUsers).map((u: any) => (
            <div key={u.name} title={u.name} className={`inline-flex h-8 w-8 rounded-full ring-2 ring-white items-center justify-center text-xs font-bold text-white ${obtenerColorUsuario(u.name).bg}`}>
              {u.name.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>
      </div>

      {/* MINI-TABLA FLOTANTE DE SUELDOS */}
      {mostrarSueldos && !esFactura && (
        <div className="absolute top-16 right-6 z-50 bg-white border-2 border-blue-200 shadow-2xl rounded-lg w-[650px] h-[400px] flex flex-col overflow-hidden">
          <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex justify-between items-center shrink-0">
            <h2 className="font-bold text-blue-800 flex items-center gap-2">
              <Calculator size={18} /> Sueldos y Cotizaciones ({hojaActiva.nombre})
            </h2>
            <button onClick={() => setMostrarSueldos(false)} className="text-gray-500 hover:text-red-500">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-auto bg-white">
             <DataGrid 
                columns={columnasSueldos} 
                rows={hojaActiva.sueldos || [crearFilaSueldo(1)]} 
                onRowsChange={procesarCambiosSueldos}
                rowKeyGetter={(row: any) => row.id}
                className="h-full w-full"
              />
          </div>
        </div>
      )}
      
      {/* Contenedor de la Tabla Principal */}
      <div className="flex-1 bg-white border border-gray-300 shadow-sm relative overflow-hidden flex flex-col rounded-t-lg">
        <div className="flex-1 overflow-auto">
          <DataGrid 
            columns={columnasBase} 
            rows={hojaActiva.rows} 
            onRowsChange={procesarCambios}
            onCellClick={handleCellClick}
            rowKeyGetter={(row: any) => row.id}
            className="h-full w-full"
            style={{ height: '100%' }}
          />
        </div>
      </div>

      {/* SISTEMA DE PESTAÑAS (TABS ABAJO) CON EDICIÓN/ELIMINACIÓN */}
      <div className="flex items-center gap-1 pt-1 shrink-0 overflow-x-auto bg-gray-50">
        {hojas.map((hoja) => (
          <div
            key={hoja.id}
            onClick={() => setHojaActivaId(hoja.id)}
            className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-b-lg border-x border-b border-t-0 shadow-sm transition-colors cursor-pointer ${
              hojaActivaId === hoja.id 
                ? 'bg-white text-blue-600 border-gray-300 border-t-2 border-t-blue-500' 
                : 'bg-gray-200 text-gray-500 border-transparent hover:bg-gray-300'
            }`}
          >
            <FileSpreadsheet size={16} />
            <span onDoubleClick={() => renombrarHoja(hoja.id, hoja.nombre)}>{hoja.nombre}</span>
            
            {/* Botones de Editar y Eliminar (Solo en la hoja activa) */}
            {hojaActivaId === hoja.id && (
              <div className="flex items-center gap-1 ml-2">
                 <Edit2 
                    size={14} 
                    className="text-gray-400 hover:text-blue-500" 
                    onClick={(e) => { e.stopPropagation(); renombrarHoja(hoja.id, hoja.nombre); }} 
                 />
                 {hojas.length > 1 && (
                   <X 
                      size={14} 
                      className="text-gray-400 hover:text-red-500" 
                      onClick={(e) => { e.stopPropagation(); eliminarHoja(hoja.id); }} 
                   />
                 )}
              </div>
            )}
          </div>
        ))}
        <button onClick={agregarHoja} className="flex items-center justify-center w-8 h-8 ml-2 rounded text-gray-500 hover:bg-gray-300 hover:text-gray-800" title="Nueva Hoja">
          <Plus size={18} />
        </button>
      </div>

    </div>
  );
}