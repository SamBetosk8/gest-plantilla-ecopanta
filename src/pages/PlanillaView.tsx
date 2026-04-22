import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, PaintBucket, Plus, FileSpreadsheet, Calculator, X, Edit2 } from 'lucide-react';
import DataGrid, { textEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
import 'react-data-grid/lib/styles.css';

const crearFilaVacia = (id: number) => ({ id, format: {} });
const crearFilaSueldo = (id: number) => ({ id, fecha: '', trabajador: '', sueldo: '0', cotizacion: '0', anticipos: '0', totalDebe: 0, format: {} });
const esFilaVacia = (fila: any) => Object.keys(fila).every(k => k === 'id' || k === 'format' || !fila[k] || fila[k] === '0' || fila[k] === 0);
const esFilaSueldoVacia = (fila: any) => !fila.trabajador && (!fila.sueldo || fila.sueldo === '0') && (!fila.cotizacion || fila.cotizacion === '0') && (!fila.anticipos || fila.anticipos === '0');

const obtenerColorUsuario = (nombre: string) => {
  const paleta = [{ bg: 'bg-blue-500', border: 'ring-blue-500' }, { bg: 'bg-red-500', border: 'ring-red-500' }, { bg: 'bg-green-500', border: 'ring-green-500' }, { bg: 'bg-purple-500', border: 'ring-purple-500' }, { bg: 'bg-orange-500', border: 'ring-orange-500' }];
  let hash = 0; for (let i = 0; i < nombre.length; i++) hash += nombre.charCodeAt(i); return paleta[hash % paleta.length];
};

// Limpia texto para extraer números (soporta negativos como el Balance General)
const parseCurrency = (val: any) => {
  if (!val) return 0;
  const num = parseInt(String(val).replace(/[^0-9-]/g, ''));
  return isNaN(num) ? 0 : num;
};
const formatMoney = (val: any) => {
  const num = parseCurrency(val);
  return num === 0 ? '$ 0' : `$ ${num.toLocaleString('es-CL')}`;
};

export default function PlanillaView() {
  const { id } = useParams();
  const userName = localStorage.getItem('userName') || 'Invitado';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hojas, setHojas] = useState<any[]>([{ id: 'hoja-1', nombre: 'Hoja 1', rows: [crearFilaVacia(1)], sueldos: [crearFilaSueldo(1)], gastosOficina: 0, gastosFijos: 0, balanceGeneral: 0 }]);
  const [hojaActivaId, setHojaActivaId] = useState<string>('hoja-1');
  const [activeUsers, setActiveUsers] = useState<any>({});
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{rowId: number, columnKey: string} | null>(null);
  const [mostrarSueldos, setMostrarSueldos] = useState(false);

  const hojaActiva = hojas.find(h => h.id === hojaActivaId) || hojas[0];
  const esFactura = id?.includes('factura');

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'planillas', id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.hojas) setHojas(data.hojas);
        else if (data.rows) setHojas([{ id: 'hoja-1', nombre: 'General', rows: data.rows, sueldos: [crearFilaSueldo(1)], gastosOficina: 0, gastosFijos: 0, balanceGeneral: 0 }]);
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
    const unsubPresence = onValue(totalPresenceRef, (snapshot) => setActiveUsers(snapshot.val() || {}));
    return () => unsubPresence();
  }, [id, userName, hojaActivaId]);

  const guardarEnNube = async (nuevasHojas: any[]) => {
    if (!id) return;
    await setDoc(doc(db, 'planillas', id), { hojas: nuevasHojas }, { merge: true });
  };

  const procesarCambios = (nuevasFilas: any[]) => {
    let actualizadas = nuevasFilas.map(fila => {
      if (!esFactura) {
        const venta = parseCurrency(fila.ventaNeta); const mat = parseCurrency(fila.costoMateriales); const varC = parseCurrency(fila.costoVarios);
        fila.balanceIngreso = venta - mat - varC; fila.pagoIva = Math.round(venta * 1.19);
      }
      fila.format = fila.format || {}; return fila;
    });
    const nuevasHojas = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: actualizadas } : h);
    setHojas(nuevasHojas); guardarEnNube(nuevasHojas);
  };

  const procesarCambiosSueldos = (nuevasFilasSueldo: any[]) => {
    let actualizadas = nuevasFilasSueldo.map(fila => {
      fila.totalDebe = parseCurrency(fila.sueldo) + parseCurrency(fila.cotizacion) + parseCurrency(fila.anticipos);
      fila.format = fila.format || {}; return fila;
    });
    const nuevasHojas = hojas.map(h => h.id === hojaActivaId ? { ...h, sueldos: actualizadas } : h);
    setHojas(nuevasHojas); guardarEnNube(nuevasHojas);
  };

  const agregarFilaManual = () => {
    const maxId = hojaActiva.rows.length > 0 ? Math.max(...hojaActiva.rows.map((r:any) => r.id)) : 0;
    const nuevasHojas = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: [...h.rows, crearFilaVacia(maxId + 1)] } : h);
    setHojas(nuevasHojas); guardarEnNube(nuevasHojas);
  };
  const agregarFilaSueldoManual = () => {
    const sueldosActuales = hojaActiva.sueldos || [];
    const maxId = sueldosActuales.length > 0 ? Math.max(...sueldosActuales.map((r:any) => r.id)) : 0;
    const nuevasHojas = hojas.map(h => h.id === hojaActivaId ? { ...h, sueldos: [...sueldosActuales, crearFilaSueldo(maxId + 1)] } : h);
    setHojas(nuevasHojas); guardarEnNube(nuevasHojas);
  };
  const agregarHoja = () => {
    const nuevoNombre = prompt('Nombre de la nueva hoja:'); if (!nuevoNombre) return;
    const nuevasHojas = [...hojas, { id: `hoja-${Date.now()}`, nombre: nuevoNombre, rows: [crearFilaVacia(1)], sueldos: [crearFilaSueldo(1)], gastosOficina: 0, gastosFijos: 0, balanceGeneral: 0 }];
    setHojas(nuevasHojas); setHojaActivaId(nuevasHojas[nuevasHojas.length - 1].id); guardarEnNube(nuevasHojas);
  };
  const renombrarHoja = (hojaId: string, nombreActual: string) => {
    const nuevoNombre = prompt('Renombrar hoja a:', nombreActual); if (!nuevoNombre || nuevoNombre === nombreActual) return;
    const nuevasHojas = hojas.map(h => h.id === hojaId ? { ...h, nombre: nuevoNombre } : h);
    setHojas(nuevasHojas); guardarEnNube(nuevasHojas);
  };
  const eliminarHoja = (hojaId: string) => {
    if (hojas.length <= 1) return alert("No puedes eliminar la única hoja.");
    if (window.confirm("¿ELIMINAR esta hoja y TODOS sus datos?")) {
      const nuevasHojas = hojas.filter(h => h.id !== hojaId);
      setHojas(nuevasHojas); setHojaActivaId(nuevasHojas[0].id); guardarEnNube(nuevasHojas);
    }
  };
  const pintarCelda = (colorClass: string) => {
    if (!celdaSeleccionada) return;
    const pintarEn = (filas: any[]) => filas.map((fila: any) => fila.id === celdaSeleccionada.rowId ? { ...fila, format: { ...fila.format, [celdaSeleccionada.columnKey]: colorClass } } : fila);
    const nuevasHojas = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: pintarEn(h.rows), sueldos: pintarEn(h.sueldos || []) } : h);
    setHojas(nuevasHojas); guardarEnNube(nuevasHojas);
  };
  const getCellClass = (row: any, columnKey: string) => {
    let classes = row.format?.[columnKey] || ''; 
    for (const key in activeUsers) {
      const user = activeUsers[key];
      if (user.activeSheet === hojaActivaId && user.editing && user.editing.row === row.id && user.editing.column === columnKey) classes += ` ring-2 ring-inset z-10 relative ${obtenerColorUsuario(user.name).border}`;
    }
    return classes;
  };

  // --- COLUMNAS PRINCIPALES ---
  const columnasBase = useMemo(() => {
    if (esFactura) {
      return [
        { key: 'id', name: 'N°', width: 60, resizable: true },
        { key: 'fecha', name: 'FECHA', renderEditCell: textEditor, width: 120, minWidth: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'fecha') },
        { key: 'nFactura', name: 'N° FACTURA', renderEditCell: textEditor, width: 120, minWidth: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'nFactura') },
        { key: 'nBoleta', name: 'N° BOLETA', renderEditCell: textEditor, width: 120, minWidth: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'nBoleta') },
        { key: 'proveedor', name: 'PROVEEDOR', renderEditCell: textEditor, width: 250, minWidth: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'proveedor') },
        { key: 'insumo', name: 'INSUMO / DETALLE', renderEditCell: textEditor, width: 400, minWidth: 200, resizable: true, cellClass: (r: any) => getCellClass(r, 'insumo') },
        { key: 'totalFactura', name: 'TOTAL FACTURA', renderEditCell: textEditor, width: 150, minWidth: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'totalFactura') },
        { key: 'totalBoleta', name: 'TOTAL BOLETA', renderEditCell: textEditor, width: 150, minWidth: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'totalBoleta') },
        { key: 'observaciones', name: 'OBSERVACIONES', renderEditCell: textEditor, width: 300, minWidth: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'observaciones') }
      ];
    } else {
      return [
        { key: 'id', name: 'N°', width: 60, resizable: true },
        { key: 'fecha', name: 'FECHA', renderEditCell: textEditor, width: 120, minWidth: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'fecha') },
        { key: 'cliente', name: 'CLIENTE', renderEditCell: textEditor, width: 150, minWidth: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'cliente') },
        { key: 'empresa', name: 'EMPRESA', renderEditCell: textEditor, width: 200, minWidth: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'empresa') },
        { key: 'ot', name: 'OT', renderEditCell: textEditor, width: 80, minWidth: 80, resizable: true, cellClass: (r: any) => getCellClass(r, 'ot') },
        { key: 'equipo', name: 'EQUIPO', renderEditCell: textEditor, width: 150, minWidth: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'equipo') },
        { key: 'patente', name: 'PATENTE', renderEditCell: textEditor, width: 120, minWidth: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'patente') },
        { key: 'trabajo', name: 'TRABAJO REALIZADO', renderEditCell: textEditor, width: 350, minWidth: 200, resizable: true, cellClass: (r: any) => getCellClass(r, 'trabajo') },
        { key: 'ventaNeta', name: 'VENTA NETA', renderEditCell: textEditor, width: 120, minWidth: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'ventaNeta') },
        { key: 'costoMateriales', name: 'COSTO MATERIALES', renderEditCell: textEditor, width: 150, minWidth: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'costoMateriales') },
        { key: 'costoVarios', name: 'COSTO VARIOS', renderEditCell: textEditor, width: 120, minWidth: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'costoVarios') },
        { key: 'balanceIngreso', name: 'BALANCE INGRESO', width: 150, minWidth: 120, resizable: true, renderCell: (p:any) => formatMoney(p.row.balanceIngreso), cellClass: (r: any) => getCellClass(r, 'balanceIngreso') },
        { key: 'estatus', name: 'ESTATUS', renderEditCell: textEditor, width: 120, minWidth: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'estatus') },
        { key: 'pagoNeto', name: 'PAGO NETO', renderEditCell: textEditor, width: 120, minWidth: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'pagoNeto') },
        { key: 'pagoIva', name: 'TOTAL (C/ IVA)', width: 150, minWidth: 120, resizable: true, renderCell: (p:any) => formatMoney(p.row.pagoIva), cellClass: (r: any) => getCellClass(r, 'pagoIva') },
        { key: 'factura', name: 'FACTURA', renderEditCell: textEditor, width: 120, minWidth: 100, resizable: true, cellClass: (r: any) => getCellClass(r, 'factura') },
        { key: 'fechaPago', name: 'FECHA PAGO', renderEditCell: textEditor, width: 150, minWidth: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'fechaPago') }
      ];
    }
  }, [activeUsers, hojas, hojaActivaId]);

  const columnasSueldos = useMemo(() => [
    { key: 'id', name: 'N°', width: 60, resizable: true },
    { key: 'trabajador', name: 'TRABAJADOR', renderEditCell: textEditor, width: 250, resizable: true, cellClass: (r: any) => getCellClass(r, 'trabajador') },
    { key: 'sueldo', name: 'SUELDO LÍQUIDO', renderEditCell: textEditor, width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'sueldo') },
    { key: 'cotizacion', name: 'COTIZACIONES', renderEditCell: textEditor, width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'cotizacion') },
    { key: 'anticipos', name: 'ANTICIPOS', renderEditCell: textEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'anticipos') },
    { key: 'totalDebe', name: 'TOTAL DEBE', width: 150, resizable: true, renderCell: (p:any) => formatMoney(p.row.totalDebe), cellClass: (r: any) => getCellClass(r, 'totalDebe') }
  ], [activeUsers, hojas, hojaActivaId]);

  // --- ESCÁNER MULTI-MES AVANZADO ---
  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const modoReemplazo = window.confirm("¿REEMPLAZAR TODO o AÑADIR?\n\nAceptar = Borrar y usar datos del Excel.\nCancelar = Añadir meses nuevos.");

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
      
      let mesesExtraidos: any[] = [];
      let mesActual: any = null;
      let parsingState = 'IDLE'; 
      let mainHeaders: string[] = [];
      let vNetaIdx = -1, cMatIdx = -1, cVarIdx = -1, balIngIdx = -1;
      let idBase = 1, idSueldoBase = 1000;

      for (let i = 0; i < rawData.length; i++) {
        const rowArr = rawData[i] as string[];
        const rowStr = rowArr.join(' ').toUpperCase();
        if (!rowStr.trim()) continue;

        // 1. Detectar Nuevo Mes (Cabeceras de Tabla Principal)
        if (rowStr.includes('FECHA') && rowStr.includes('CLIENTE') && rowStr.includes('VENTA NETA')) {
          if (mesActual) mesesExtraidos.push(mesActual);
          
          // Buscar nombre del mes (ej: "ENERO 2026") en las filas de arriba
          let nombreMes = `Hoja ${mesesExtraidos.length + 1}`;
          for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
            const prevRow = rawData[j] as string[];
            const textoLargo = prevRow.find(c => String(c).trim().length > 3 && !String(c).toUpperCase().includes('BALANCE'));
            if (textoLargo) { nombreMes = String(textoLargo).trim(); break; }
          }

          mesActual = { id: `hoja-${Date.now()}-${mesesExtraidos.length}`, nombre: nombreMes, rows: [], sueldos: [], gastosOficina: 0, gastosFijos: 0, balanceGeneral: 0 };
          parsingState = 'MAIN_TABLE';
          mainHeaders = rowArr.map(h => String(h).toUpperCase().trim());
          
          // Guardamos las coordenadas de las columnas importantes
          vNetaIdx = mainHeaders.findIndex(h => h.includes('VENTA NETA'));
          cMatIdx = mainHeaders.findIndex(h => h.includes('COSTO MATERIALES'));
          cVarIdx = mainHeaders.findIndex(h => h.includes('COSTO VARIOS'));
          balIngIdx = mainHeaders.findIndex(h => h.includes('BALANCE INGRESO'));
          continue;
        }

        if (!mesActual) continue;

        // Fin de la tabla principal
        if (parsingState === 'MAIN_TABLE' && (rowStr.includes('TOTAL') || rowStr.includes('RESUMEN'))) {
          parsingState = 'IDLE'; continue;
        }

        // 2. Extraer Variables Sueltas (Gastos y Balance General)
        if (rowStr.includes('GASTOS FIJOS OFICINA') || rowStr.includes('GASTOS OFICINA')) {
          const valor = cMatIdx !== -1 ? rowArr[cMatIdx] : rowArr.find(c => /[0-9]/.test(String(c)));
          mesActual.gastosOficina = parseCurrency(valor);
          parsingState = 'IDLE'; continue;
        }
        if (rowStr.includes('GASTOS FIJOS') && !rowStr.includes('OFICINA')) {
          const valor = balIngIdx !== -1 ? rowArr[balIngIdx] : rowArr.find(c => /[0-9]/.test(String(c)));
          mesActual.gastosFijos = parseCurrency(valor);
          parsingState = 'IDLE'; continue;
        }
        if (rowStr.includes('BALANCE GENERAL')) {
          const valor = balIngIdx !== -1 ? rowArr[balIngIdx] : rowArr.find(c => /[0-9]/.test(String(c)));
          mesActual.balanceGeneral = parseCurrency(valor);
          parsingState = 'IDLE'; continue;
        }

        // 3. Extraer Tabla de Sueldos por Coordenadas
        if (rowStr.includes('TRABAJADOR') || rowStr.includes('SUELDO LIQUIDO') || (rowStr.includes('SUELDO') && parsingState === 'IDLE')) {
          parsingState = 'SUELDOS'; continue;
        }

        // --- Guardar Datos ---
        if (parsingState === 'MAIN_TABLE') {
          const getValue = (...nombres: string[]) => {
            for (let name of nombres) {
              const idx = mainHeaders.findIndex(h => h.includes(name));
              if (idx !== -1 && rowArr[idx]) return String(rowArr[idx]).trim();
            } return '';
          };
          const fecha = getValue('FECHA'); const cliente = getValue('CLIENTE'); const trab = getValue('TRABAJO', 'DETALLE');
          if (!fecha && !cliente && !trab) continue;

          const vNeta = getValue('VENTA NETA') || '0'; const cMat = getValue('COSTO MATERIALES') || '0'; const cVar = getValue('COSTO VARIOS') || '0';
          mesActual.rows.push({
            id: idBase++, fecha, cliente, empresa: getValue('EMPRESA'), ot: getValue('OT'), equipo: getValue('EQUIPO'), patente: getValue('PATENTE'), trabajo: trab,
            ventaNeta: vNeta, costoMateriales: cMat, costoVarios: cVar, balanceIngreso: parseCurrency(vNeta) - parseCurrency(cMat) - parseCurrency(cVar),
            estatus: getValue('ESTATUS') || 'PENDIENTE', pagoNeto: getValue('PAGO NETO') || '0', pagoIva: Math.round(parseCurrency(vNeta) * 1.19),
            factura: getValue('FACTURA'), fechaPago: getValue('FECHA PAGO', 'FECHA DE PAGO'), format: {}
          });
        }

        if (parsingState === 'SUELDOS') {
          let trabajador = '', sueldo = '0', cotiz = '0';
          
          if (vNetaIdx !== -1 && cMatIdx !== -1 && cVarIdx !== -1) {
            trabajador = String(rowArr[vNetaIdx] || '').trim();
            // Corrección: Si el nombre del trabajador está al lado de la etiqueta "Sueldo"
            if (trabajador.toUpperCase().includes('SUELDO') || !trabajador) trabajador = String(rowArr[vNetaIdx + 1] || '').trim();
            sueldo = String(rowArr[cMatIdx] || '0').trim();
            cotiz = String(rowArr[cVarIdx] || '0').trim();
          } else {
            const texts = rowArr.filter(c => typeof c === 'string' && /[a-zA-Z]/.test(c));
            const nums = rowArr.map(parseCurrency).filter(n => n !== 0);
            if (texts.length > 0) trabajador = texts[0];
            if (nums.length > 0) sueldo = String(nums[0]);
            if (nums.length > 1) cotiz = String(nums[1]);
          }

          if (!trabajador && parseCurrency(sueldo) === 0 && parseCurrency(cotiz) === 0) continue;
          if (trabajador.toUpperCase().includes('TOTAL')) { parsingState = 'IDLE'; continue; }

          mesActual.sueldos.push({
            id: idSueldoBase++, fecha: '', trabajador, sueldo, cotizacion: cotiz, anticipos: '0', totalDebe: parseCurrency(sueldo) + parseCurrency(cotiz), format: {}
          });
        }
      }
      
      if (mesActual) mesesExtraidos.push(mesActual);

      if (mesesExtraidos.length > 0) {
        mesesExtraidos.forEach(m => {
          if (m.rows.length === 0) m.rows.push(crearFilaVacia(idBase++));
          if (m.sueldos.length === 0) m.sueldos.push(crearFilaSueldo(idSueldoBase++));
        });
        const nuevasHojas = modoReemplazo ? mesesExtraidos : [...hojas, ...mesesExtraidos];
        setHojas(nuevasHojas); setHojaActivaId(nuevasHojas[0].id); guardarEnNube(nuevasHojas);
      } else {
        alert("No se pudo detectar el formato de la tabla. Revisa el Excel.");
      }
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
      <style>{` .rdg { --rdg-border-color: #d1d5db; height: 100%; border: none; } .rdg-cell { border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 0 8px; } .rdg-header-cell { background-color: #f3f4f6; border-bottom: 2px solid #9ca3af; font-weight: bold; color: #374151; } `}</style>

      {/* --- BARRA SUPERIOR --- */}
      <div className="flex items-center gap-2 mb-2 px-2 shrink-0 flex-wrap">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800 mr-2"><ArrowLeft size={24} /></Link>
        <h1 className="text-xl font-bold uppercase text-gray-800 mr-2">{id?.replace('-', ' ')}</h1>
        
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border shadow-sm">
          <PaintBucket size={18} className="text-gray-400 mx-2" />
          <button onClick={() => pintarCelda('bg-yellow-100 text-yellow-900')} className="w-6 h-6 rounded bg-yellow-100 border border-yellow-300 hover:scale-110" />
          <button onClick={() => pintarCelda('bg-green-100 text-green-900')} className="w-6 h-6 rounded bg-green-100 border border-green-300 hover:scale-110" />
          <button onClick={() => pintarCelda('bg-red-100 text-red-900')} className="w-6 h-6 rounded bg-red-100 border border-red-300 hover:scale-110" />
          <button onClick={() => pintarCelda('bg-blue-100 text-blue-900')} className="w-6 h-6 rounded bg-blue-100 border border-blue-300 hover:scale-110" />
          <button onClick={() => pintarCelda('')} className="w-6 h-6 rounded bg-white border text-xs text-gray-400">✖</button>
        </div>

        <button onClick={agregarFilaManual} className="ml-2 flex items-center gap-1 bg-blue-600 text-white px-3 py-1 text-sm rounded-lg shadow hover:bg-blue-700">
          <Plus size={16} /> Fila
        </button>

        <input type="file" ref={fileInputRef} onChange={importarExcel} accept=".xlsx, .xls, .csv" className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1 text-sm rounded-lg shadow hover:bg-green-700">
          <Upload size={16} /> Importar Excel
        </button>

        {!esFactura && (
          <button onClick={() => setMostrarSueldos(!mostrarSueldos)} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1 text-sm rounded-lg shadow hover:bg-indigo-700">
            <Calculator size={16} /> Sueldos
          </button>
        )}
      </div>

      {/* --- MINI TABLA SUELDOS --- */}
      {mostrarSueldos && !esFactura && (
        <div className="absolute top-14 right-6 z-50 bg-white border-2 border-indigo-200 shadow-2xl rounded-lg w-[850px] h-[400px] flex flex-col overflow-hidden">
          <div className="bg-indigo-50 px-4 py-2 border-b flex justify-between items-center">
            <h2 className="font-bold text-indigo-800 flex items-center gap-2"><Calculator size={18} /> Sueldos ({hojaActiva.nombre})</h2>
            <button onClick={() => setMostrarSueldos(false)} className="text-gray-500 hover:text-red-500"><X size={20} /></button>
          </div>
          <div className="bg-gray-100 p-1 border-b"><button onClick={agregarFilaSueldoManual} className="flex items-center gap-1 bg-indigo-600 text-white px-2 py-1 text-xs rounded"><Plus size={14}/> Fila</button></div>
          <div className="flex-1 bg-white min-h-0">
             <DataGrid columns={columnasSueldos} rows={hojaActiva.sueldos || [crearFilaSueldo(1)]} onRowsChange={procesarCambiosSueldos} onCellClick={handleCellClick} rowKeyGetter={(row: any) => row.id} className="h-full w-full" style={{ minHeight: 0 }} />
          </div>
        </div>
      )}
      
      {/* --- TABLA PRINCIPAL --- */}
      <div className="flex-1 bg-white border border-gray-300 shadow-sm relative flex flex-col rounded-t-lg min-h-0">
        <DataGrid columns={columnasBase} rows={hojaActiva.rows} onRowsChange={procesarCambios} onCellClick={handleCellClick} rowKeyGetter={(row: any) => row.id} className="h-full w-full" style={{ minHeight: 0 }} />
      </div>

      {/* --- BARRA DE RESUMEN DE GASTOS (NUEVO) --- */}
      {!esFactura && (
        <div className="bg-gray-800 text-white px-4 py-2 flex gap-6 text-sm shrink-0 overflow-x-auto shadow-inner items-center">
          <span className="font-bold text-gray-400 uppercase tracking-wide">Resumen Mensual:</span>
          <span>Gastos Oficina: <strong className="text-yellow-400 ml-1">{formatMoney(hojaActiva.gastosOficina)}</strong></span>
          <span>Gastos Fijos: <strong className="text-red-400 ml-1">{formatMoney(hojaActiva.gastosFijos)}</strong></span>
          <span>Balance General: <strong className="text-green-400 ml-1 text-base">{formatMoney(hojaActiva.balanceGeneral)}</strong></span>
        </div>
      )}

      {/* --- TABS --- */}
      <div className="flex items-center gap-1 pt-1 shrink-0 overflow-x-auto bg-gray-50">
        {hojas.map((hoja) => (
          <div key={hoja.id} onClick={() => setHojaActivaId(hoja.id)} className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-b-lg border-x border-b border-t-0 shadow-sm transition-colors cursor-pointer ${hojaActivaId === hoja.id ? 'bg-white text-blue-600 border-gray-300 border-t-2 border-t-blue-500' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
            <FileSpreadsheet size={16} />
            <span onDoubleClick={() => renombrarHoja(hoja.id, hoja.nombre)}>{hoja.nombre}</span>
            {hojaActivaId === hoja.id && (
              <div className="flex items-center gap-1 ml-2">
                 <Edit2 size={14} className="text-gray-400 hover:text-blue-500" onClick={(e) => { e.stopPropagation(); renombrarHoja(hoja.id, hoja.nombre); }} />
                 {hojas.length > 1 && (<X size={14} className="text-gray-400 hover:text-red-500" onClick={(e) => { e.stopPropagation(); eliminarHoja(hoja.id); }} />)}
              </div>
            )}
          </div>
        ))}
        <button onClick={agregarHoja} className="flex items-center justify-center w-8 h-8 ml-2 rounded text-gray-500 hover:bg-gray-300"><Plus size={18} /></button>
      </div>

    </div>
  );
}