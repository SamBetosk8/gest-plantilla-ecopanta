import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, PaintBucket, Plus, FileSpreadsheet, Calculator, X, Edit2 } from 'lucide-react';
import DataGrid, { textEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
import 'react-data-grid/lib/styles.css';

// --- GENERADORES Y AUXILIARES ---
const crearFilaVacia = (id: number) => ({ id, format: {} });

const crearFilaSueldo = (id: number) => ({ 
  id, fecha: '', trabajador: '', sueldo: '0', cotizacion: '0', anticipos: '0', totalDebe: 0, format: {} 
});

const esFilaVacia = (fila: any) => Object.keys(fila).every(k => k === 'id' || k === 'format' || !fila[k] || fila[k] === '0' || fila[k] === 0);
const esFilaSueldoVacia = (fila: any) => !fila.trabajador && (!fila.sueldo || fila.sueldo === '0') && (!fila.cotizacion || fila.cotizacion === '0') && (!fila.anticipos || fila.anticipos === '0');

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

// --- LIMPIEZA DE MONEDAS ---
const parseCurrency = (val: any) => {
  if (!val) return 0;
  const num = parseInt(String(val).replace(/[^0-9-]/g, ''));
  return isNaN(num) ? 0 : num;
};

const formatMoney = (val: any) => {
  const num = parseCurrency(val);
  if (num === 0) return '$ 0';
  return `$ ${num.toLocaleString('es-CL')}`;
};

// --- LECTOR INTELIGENTE DE FECHAS (MES/DÍA/AÑO -> DÍA-MES-AÑO) ---
const parseExcelDate = (val: any) => {
  if (!val) return '';
  let str = String(val).trim();
  
  // 1. Si es un número de serie nativo de Excel
  if (!isNaN(Number(str)) && Number(str) > 20000) {
    const d = new Date(Math.round((Number(str) - 25569) * 86400 * 1000));
    return `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
  }
  
  // 2. Si viene como texto separado por / o -
  if (str.includes('/') || str.includes('-')) {
    const parts = str.split(/[\/-]/);
    if (parts.length === 3) {
      let p1 = parseInt(parts[0], 10);
      let p2 = parseInt(parts[1], 10);
      let p3 = parseInt(parts[2], 10);
      
      // Arreglar años de 2 dígitos (ej. 26 -> 2026)
      if (p3 < 100) p3 += 2000;
      
      let day, month;
      
      // Si el usuario trae Mes/Día/Año (ej: 1/30/2026)
      if (p1 <= 12 && p2 > 12) {
        month = p1; day = p2;
      } 
      // Si por alguna razón viene Día/Mes/Año (ej: 30/01/2026)
      else if (p1 > 12 && p2 <= 12) {
        day = p1; month = p2; 
      } 
      // Si es ambiguo (ej: 1/5/2026), asumimos Mes/Día/Año por defecto del Excel
      else {
        month = p1; day = p2;
      }
      
      return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${p3}`;
    }
  }
  return str;
};

export default function PlanillaView() {
  const { id } = useParams();
  const userName = localStorage.getItem('userName') || 'Invitado';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- ESTADOS ---
  const [hojas, setHojas] = useState<any[]>([{ id: 'hoja-1', nombre: 'Hoja 1', rows: [crearFilaVacia(1)], sueldos: [crearFilaSueldo(1)], gastosOficina: 0, gastosFijos: 0, balanceGeneral: 0 }]);
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
          setHojas([{ id: 'hoja-1', nombre: 'General', rows: data.rows, sueldos: [crearFilaSueldo(1)], gastosOficina: 0, gastosFijos: 0, balanceGeneral: 0 }]);
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
        const venta = parseCurrency(fila.ventaNeta);
        const mat = parseCurrency(fila.costoMateriales);
        const varC = parseCurrency(fila.costoVarios);
        fila.balanceIngreso = venta - mat - varC;
        fila.pagoIva = Math.round(venta * 1.19);
      }
      fila.format = fila.format || {};
      return fila;
    });

    const nuevasHojas = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: actualizadas } : h);
    setHojas(nuevasHojas);
    guardarEnNube(nuevasHojas);
  };

  const agregarFilaManual = () => {
    const maxId = hojaActiva.rows.length > 0 ? Math.max(...hojaActiva.rows.map((r:any) => r.id)) : 0;
    const nuevasFilas = [...hojaActiva.rows, crearFilaVacia(maxId + 1)];
    const nuevasHojas = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: nuevasFilas } : h);
    setHojas(nuevasHojas);
    guardarEnNube(nuevasHojas);
  };

  const procesarCambiosSueldos = (nuevasFilasSueldo: any[]) => {
    let actualizadas = nuevasFilasSueldo.map(fila => {
      const s = parseCurrency(fila.sueldo);
      const c = parseCurrency(fila.cotizacion);
      const a = parseCurrency(fila.anticipos);
      return {
        ...fila,
        totalDebe: s + c + a,
        format: fila.format || {}
      };
    });

    const nuevasHojas = hojas.map(h => h.id === hojaActivaId ? { ...h, sueldos: actualizadas } : h);
    setHojas(nuevasHojas);
    guardarEnNube(nuevasHojas);
  };

  const agregarFilaSueldoManual = () => {
    const sueldosActuales = hojaActiva.sueldos || [];
    const maxId = sueldosActuales.length > 0 ? Math.max(...sueldosActuales.map((r:any) => r.id)) : 0;
    const nuevasFilas = [...sueldosActuales, crearFilaSueldo(maxId + 1)];
    const nuevasHojas = hojas.map(h => h.id === hojaActivaId ? { ...h, sueldos: nuevasFilas } : h);
    setHojas(nuevasHojas);
    guardarEnNube(nuevasHojas);
  };

  // --- LÓGICA DE HOJAS (TABS) ---
  const agregarHoja = () => {
    const nuevoNombre = prompt('Nombre de la nueva hoja:');
    if (!nuevoNombre) return;
    const nuevaHojaId = `hoja-${Date.now()}`;
    const nuevasHojas = [...hojas, { id: nuevaHojaId, nombre: nuevoNombre, rows: [crearFilaVacia(1)], sueldos: [crearFilaSueldo(1)], gastosOficina: 0, gastosFijos: 0, balanceGeneral: 0 }];
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
    
    const pintarEn = (filas: any[]) => filas.map((fila: any) => {
      if (fila.id === celdaSeleccionada.rowId) {
        return { ...fila, format: { ...fila.format, [celdaSeleccionada.columnKey]: colorClass } };
      }
      return fila;
    });

    const nuevasHojas = hojas.map(h => {
      if (h.id === hojaActivaId) {
        return { ...h, rows: pintarEn(h.rows), sueldos: pintarEn(h.sueldos || []) };
      }
      return h;
    });
    
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

  // --- IMPORTACIÓN INTELIGENTE CON COORDENADAS EXACTAS ---
  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const modoReemplazo = window.confirm(
      "¿Deseas REEMPLAZAR los datos actuales?\n\n" +
      "Aceptar (OK) = Borrará todo y pondrá los datos nuevos limpios.\n" +
      "Cancelar = Sumará los datos nuevos abajo de los que ya existen."
    );

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
      
      let mesesExtraidos: any[] = [];
      let mesActual: any = null;
      let estado = 'IDLE'; 
      let idBase = 1, idSueldoBase = 1000;
      
      // Coordenadas de la tabla
      let idxVNeta = -1, idxCMat = -1, idxCVar = -1, idxBal = -1, idxFecha = -1;
      let mainHeaders: string[] = [];

      for (let i = 0; i < rawData.length; i++) {
        const rowArr = rawData[i] as string[];
        const rowStr = rowArr.join(' ').toUpperCase();
        
        if (!rowStr.trim()) continue;

        // 1. Detectar Nueva Tabla Principal (Nuevo Mes)
        if (rowStr.includes('FECHA') && rowStr.includes('VENTA NETA') && rowStr.includes('CLIENTE')) {
          if (mesActual) mesesExtraidos.push(mesActual);
          
          let nombreMes = `Mes ${mesesExtraidos.length + 1}`;
          for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
            const texto = (rawData[j] as string[]).join(' ').trim();
            if (texto.length > 3 && !texto.toUpperCase().includes('BALANCE')) { nombreMes = texto; break; }
          }

          mesActual = { id: `hoja-${Date.now()}-${i}`, nombre: nombreMes, rows: [], sueldos: [], gastosOficina: 0, gastosFijos: 0, balanceGeneral: 0 };
          estado = 'TABLA_MAIN';
          
          mainHeaders = rowArr.map(h => String(h).toUpperCase().trim());
          idxVNeta = mainHeaders.findIndex(h => h.includes('VENTA NETA'));
          idxCMat = mainHeaders.findIndex(h => h.includes('COSTO MATERIALES'));
          idxCVar = mainHeaders.findIndex(h => h.includes('COSTO VARIOS'));
          idxBal = mainHeaders.findIndex(h => h.includes('BALANCE INGRESO'));
          idxFecha = mainHeaders.findIndex(h => h.includes('FECHA'));
          continue;
        }

        if (!mesActual) continue;

        // 2. Detectar Variables Fijas (Gastos / Balance General)
        if (idxVNeta !== -1 && String(rowArr[idxVNeta]).toUpperCase().includes('GASTOS FIJOS OFICINA')) {
          mesActual.gastosOficina = parseCurrency(rowArr[idxCMat]);
          estado = 'IDLE'; continue;
        }
        if (idxBal !== -1 && String(rowArr[idxBal]).toUpperCase().includes('GASTOS FIJOS')) {
          mesActual.gastosFijos = parseCurrency(rowArr[idxBal + 1] || rowArr[idxBal]);
          estado = 'IDLE'; continue;
        }
        if (idxCVar !== -1 && String(rowArr[idxCVar]).toUpperCase().includes('BALANCE GENERAL')) {
          mesActual.balanceGeneral = parseCurrency(rowArr[idxBal]);
          estado = 'IDLE'; continue;
        }

        // 3. Detectar inicio de Sueldos (en la columna Venta Neta o si dice Trabajador)
        if ((idxVNeta !== -1 && String(rowArr[idxVNeta]).toUpperCase().includes('SUELDO')) || rowStr.includes('TRABAJADOR')) {
          estado = 'TABLA_SUELDOS'; 
          
          let trab = String(rowArr[idxVNeta] || '').trim();
          let sueldo = String(rowArr[idxCMat] || '').trim();
          let cotiz = String(rowArr[idxCVar] || '').trim();
          
          // Si es la fila de títulos y dice "SUELDO", tomamos el nombre del trabajador en la columna siguiente
          if (trab.toUpperCase() === 'SUELDO') trab = String(rowArr[idxVNeta + 1] || '').trim();
          
          if (trab && !trab.toUpperCase().includes('SUELDO') && !trab.toUpperCase().includes('TRABAJADOR')) {
             mesActual.sueldos.push({
               id: idSueldoBase++, fecha: '', trabajador: trab, sueldo: sueldo || '0', cotizacion: cotiz || '0', anticipos: '0', totalDebe: parseCurrency(sueldo) + parseCurrency(cotiz), format: {}
             });
          }
          continue;
        }
        
        // --- GUARDAR FILAS SEGÚN ESTADO ---
        if (estado === 'TABLA_MAIN') {
          if (rowStr.includes('TOTAL') || rowStr.includes('RESUMEN')) continue;
          
          const getValue = (...nombres: string[]) => {
            for (let name of nombres) {
              const idx = mainHeaders.findIndex(h => h.includes(name));
              if (idx !== -1 && rowArr[idx]) return String(rowArr[idx]).trim();
            }
            return '';
          };

          const vNeta = rowArr[idxVNeta] || '0';
          const fechaVal = rowArr[idxFecha];
          const fechaLimpia = parseExcelDate(fechaVal); // Transformamos la fecha a DD-MM-YYYY
          const cliente = rowArr[idxFecha + 1] || '';
          const trab = rowArr[idxFecha + 6] || '';
          
          // Filtro para ignorar filas totalmente vacías
          if (!fechaLimpia && parseCurrency(vNeta) === 0 && !cliente && !trab) continue;

          if (esFactura) {
            mesActual.rows.push({
              id: idBase++, fecha: fechaLimpia, nFactura: getValue('FACTURA'), nBoleta: getValue('BOLETA'),
              proveedor: rowArr[idxFecha + 1] || '', insumo: rowArr[idxFecha + 5] || '', totalFactura: getValue('TOTAL FACTURA') || '0', 
              totalBoleta: getValue('TOTAL BOLETA') || '0', observaciones: getValue('OBSERVA'), format: {}
            });
          } else {
            mesActual.rows.push({
              id: idBase++,
              fecha: fechaLimpia,
              cliente: rowArr[idxFecha + 1] || '',
              empresa: rowArr[idxFecha + 2] || '',
              ot: rowArr[idxFecha + 3] || '',
              equipo: rowArr[idxFecha + 4] || '',
              patente: rowArr[idxFecha + 5] || '',
              trabajo: rowArr[idxFecha + 6] || '',
              ventaNeta: vNeta,
              costoMateriales: rowArr[idxCMat] || '0',
              costoVarios: rowArr[idxCVar] || '0',
              balanceIngreso: parseCurrency(vNeta) - parseCurrency(rowArr[idxCMat]) - parseCurrency(rowArr[idxCVar]),
              estatus: rowArr[idxBal + 1] || 'PENDIENTE',
              pagoNeto: rowArr[idxBal + 2] || '0',
              pagoIva: Math.round(parseCurrency(vNeta) * 1.19),
              factura: rowArr[idxBal + 4] || '',
              fechaPago: parseExcelDate(rowArr[idxBal + 5]),
              format: {}
            });
          }
        }

        if (estado === 'TABLA_SUELDOS') {
          let trab = String(rowArr[idxVNeta] || '').trim();
          let sueldo = String(rowArr[idxCMat] || '0').trim();
          let cotiz = String(rowArr[idxCVar] || '0').trim();

          // El usuario indicó que el trabajador está a la derecha del texto SUELDO
          if (trab.toUpperCase() === 'SUELDO') trab = String(rowArr[idxVNeta + 1] || '').trim();
          
          if (!trab && parseCurrency(sueldo) === 0 && parseCurrency(cotiz) === 0) continue;
          if (trab.toUpperCase().includes('TOTAL')) { estado = 'IDLE'; continue; }

          mesActual.sueldos.push({
            id: idSueldoBase++, fecha: '',
            trabajador: trab,
            sueldo: sueldo,
            cotizacion: cotiz,
            anticipos: '0',
            totalDebe: parseCurrency(sueldo) + parseCurrency(cotiz),
            format: {}
          });
        }
      }

      // Añadir el último mes analizado
      if (mesActual) mesesExtraidos.push(mesActual);

      if (mesesExtraidos.length > 0) {
        mesesExtraidos.forEach(m => {
          if (m.rows.length === 0) m.rows.push(crearFilaVacia(idBase++));
          if (m.sueldos.length === 0) m.sueldos.push(crearFilaSueldo(idSueldoBase++));
        });
        const nuevasHojas = modoReemplazo ? mesesExtraidos : [...hojas, ...mesesExtraidos];
        setHojas(nuevasHojas);
        setHojaActivaId(nuevasHojas[0].id);
        guardarEnNube(nuevasHojas);
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
      
      {/* Estilos para forzar BORDES TIPO EXCEL */}
      <style>{`
        .rdg { --rdg-border-color: #d1d5db; height: 100%; border: none; }
        .rdg-cell { border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 0 8px; }
        .rdg-header-cell { background-color: #f3f4f6; border-bottom: 2px solid #9ca3af; font-weight: bold; color: #374151; }
      `}</style>

      {/* Barra de Herramientas Superior */}
      <div className="flex items-center gap-2 mb-2 px-2 shrink-0 flex-wrap">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800 mr-2">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-xl font-bold uppercase text-gray-800 mr-2 whitespace-nowrap">{id?.replace('-', ' ')}</h1>
        
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
          <PaintBucket size={18} className="text-gray-400 mx-2" />
          <button onClick={() => pintarCelda('bg-yellow-100 text-yellow-900')} className="w-6 h-6 rounded bg-yellow-100 border border-yellow-300 hover:scale-110" />
          <button onClick={() => pintarCelda('bg-green-100 text-green-900')} className="w-6 h-6 rounded bg-green-100 border border-green-300 hover:scale-110" />
          <button onClick={() => pintarCelda('bg-red-100 text-red-900')} className="w-6 h-6 rounded bg-red-100 border border-red-300 hover:scale-110" />
          <button onClick={() => pintarCelda('bg-blue-100 text-blue-900')} className="w-6 h-6 rounded bg-blue-100 border border-blue-300 hover:scale-110" />
          <button onClick={() => pintarCelda('')} className="w-6 h-6 rounded bg-white border border-gray-300 hover:scale-110 text-xs text-gray-400">✖</button>
        </div>

        <button onClick={agregarFilaManual} className="ml-2 flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-blue-700 whitespace-nowrap">
          <Plus size={16} /> Agregar Fila
        </button>

        <input type="file" ref={fileInputRef} onChange={importarExcel} accept=".xlsx, .xls, .csv" className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-green-700 whitespace-nowrap">
          <Upload size={16} /> Importar
        </button>

        {!esFactura && (
          <button 
            onClick={() => setMostrarSueldos(!mostrarSueldos)} 
            className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-indigo-700 whitespace-nowrap"
          >
            <Calculator size={16} /> Sueldos
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
        <div className="absolute top-16 right-6 z-50 bg-white border-2 border-indigo-200 shadow-2xl rounded-lg w-[900px] h-[450px] flex flex-col overflow-hidden">
          <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100 flex justify-between items-center shrink-0">
            <h2 className="font-bold text-indigo-800 flex items-center gap-2">
              <Calculator size={18} /> Sueldos y Cotizaciones ({hojaActiva.nombre})
            </h2>
            <button onClick={() => setMostrarSueldos(false)} className="text-gray-500 hover:text-red-500">
              <X size={20} />
            </button>
          </div>
          <div className="bg-gray-100 p-2 border-b border-gray-200 shrink-0">
            <button onClick={agregarFilaSueldoManual} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 text-sm rounded shadow hover:bg-indigo-700">
              <Plus size={16} /> Agregar Fila
            </button>
          </div>
          <div className="flex-1 bg-white min-h-0">
             <DataGrid 
                columns={columnasSueldos} 
                rows={hojaActiva.sueldos || [crearFilaSueldo(1)]} 
                onRowsChange={procesarCambiosSueldos}
                onCellClick={handleCellClick}
                rowKeyGetter={(row: any) => row.id}
                className="h-full w-full rdg-light"
                style={{ minHeight: 0 }}
              />
          </div>
        </div>
      )}
      
      {/* Contenedor de la Tabla Principal */}
      <div className="flex-1 bg-white border border-gray-300 shadow-sm relative flex flex-col rounded-t-lg min-h-0">
        <DataGrid 
          columns={columnasBase} 
          rows={hojaActiva.rows} 
          onRowsChange={procesarCambios}
          onCellClick={handleCellClick}
          rowKeyGetter={(row: any) => row.id}
          className="h-full w-full rdg-light"
          style={{ minHeight: 0 }}
        />
      </div>

      {/* --- BARRA DE RESUMEN DE GASTOS --- */}
      {!esFactura && (
        <div className="bg-gray-800 text-white px-4 py-3 flex gap-8 text-sm shrink-0 overflow-x-auto shadow-inner items-center">
          <span className="font-bold text-gray-400 uppercase tracking-wide">Resumen Mensual:</span>
          <span className="flex items-center gap-2">Gastos Oficina: <strong className="text-yellow-400 bg-gray-700 px-2 py-1 rounded">{formatMoney(hojaActiva.gastosOficina)}</strong></span>
          <span className="flex items-center gap-2">Gastos Fijos: <strong className="text-red-400 bg-gray-700 px-2 py-1 rounded">{formatMoney(hojaActiva.gastosFijos)}</strong></span>
          <span className="flex items-center gap-2 ml-auto">Balance General: <strong className="text-green-400 bg-gray-700 px-3 py-1.5 rounded text-base">{formatMoney(hojaActiva.balanceGeneral)}</strong></span>
        </div>
      )}

      {/* SISTEMA DE PESTAÑAS (TABS ABAJO) */}
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
            
            {hojaActivaId === hoja.id && (
              <div className="flex items-center gap-1 ml-2">
                 <Edit2 size={14} className="text-gray-400 hover:text-blue-500" onClick={(e) => { e.stopPropagation(); renombrarHoja(hoja.id, hoja.nombre); }} />
                 {hojas.length > 1 && (
                   <X size={14} className="text-gray-400 hover:text-red-500" onClick={(e) => { e.stopPropagation(); eliminarHoja(hoja.id); }} />
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