import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, PaintBucket, Plus, FileSpreadsheet, Calculator, X, Edit2, Download, FileDown } from 'lucide-react';
import DataGrid, { textEditor } from 'react-data-grid';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import 'react-data-grid/lib/styles.css';

// --- UTILIDADES ---
const crearFilaVacia = (id: number) => ({ id, format: {} });
const crearFilaSueldo = (id: number) => ({ id, fecha: '', trabajador: '', sueldo: '0', cotizacion: '0', format: {} });
const crearFilaGasto = (id: number, tipo: string = 'Oficina') => ({ id, tipo, detalle: '', monto: '0', format: {} });

const parseCurrency = (val: any) => {
  if (!val) return 0;
  const num = parseInt(String(val).replace(/[^0-9-]/g, ''));
  return isNaN(num) ? 0 : num;
};

const formatMoney = (val: any) => {
  const num = parseCurrency(val);
  return num === 0 ? '$ 0' : `$ ${num.toLocaleString('es-CL')}`;
};

// LECTOR ESTRICTO DE FECHAS
const parseExcelDate = (val: any) => {
  if (!val) return '';
  let str = String(val).trim();
  if (!isNaN(Number(str)) && Number(str) > 20000) {
    const d = new Date(Math.round((Number(str) - 25569) * 86400 * 1000));
    return `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
  }
  if (str.includes('/') || str.includes('-')) {
    const parts = str.split(/[\/-]/);
    if (parts.length === 3) {
      let p1 = parseInt(parts[0], 10), p2 = parseInt(parts[1], 10), p3 = parseInt(parts[2], 10);
      if (p3 < 100) p3 += 2000;
      let day, month;
      if (p1 <= 12 && p2 > 12) { month = p1; day = p2; } 
      else if (p1 > 12 && p2 <= 12) { day = p1; month = p2; } 
      else { month = p1; day = p2; }
      return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${p3}`;
    }
  }
  return str;
};

const obtenerColorUsuario = (nombre: string) => {
  const p = [{ bg: 'bg-blue-500', border: 'ring-blue-500' }, { bg: 'bg-red-500', border: 'ring-red-500' }, { bg: 'bg-green-500', border: 'ring-green-500' }, { bg: 'bg-purple-500', border: 'ring-purple-500' }];
  let h = 0; for(let i=0;i<nombre.length;i++) h+=nombre.charCodeAt(i); return p[h%p.length];
};

export default function PlanillaViewBalance() {
  const { id } = useParams();
  const userName = sessionStorage.getItem('userName') || 'Invitado';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- ESTADOS BASE ---
  const [hojas, setHojas] = useState<any[]>([{ 
    id: 'hoja-1', nombre: 'Mes 1', rows: [crearFilaVacia(1)], 
    sueldos: [crearFilaSueldo(1)], gastosOficina: [crearFilaGasto(1, 'Oficina')], 
    balanceGeneral: 0 
  }]);
  
  const [hojaActivaId, setHojaActivaId] = useState<string>('hoja-1');
  const [activeUsers, setActiveUsers] = useState<any>({});
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{rowId: number, columnKey: string} | null>(null);
  
  const [showModal, setShowModal] = useState(false);

  const hojaActiva = hojas.find(h => h.id === hojaActivaId) || hojas[0];

  // --- CÁLCULOS MATEMÁTICOS EN VIVO ---
  const totalSueldos = useMemo(() => {
    return (hojaActiva.sueldos || []).reduce((sum: number, s: any) => sum + parseCurrency(s.sueldo) + parseCurrency(s.cotizacion), 0);
  }, [hojaActiva.sueldos]);

  const totalOficina = useMemo(() => {
    return (hojaActiva.gastosOficina || []).reduce((sum: number, g: any) => sum + parseCurrency(g.monto), 0);
  }, [hojaActiva.gastosOficina]);

  const granTotalGastosFijos = totalSueldos + totalOficina;

  // --- SINCROMIZACIÓN CON FIREBASE ---
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'planillas', id), (docSnap) => {
      if (docSnap.exists() && docSnap.data().hojas) setHojas(docSnap.data().hojas);
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const presenceRef = ref(rtdb, `presence/${id}/${userName}`);
    set(presenceRef, { name: userName, editing: null, activeSheet: hojaActivaId });
    onDisconnect(presenceRef).remove();
    onValue(ref(rtdb, `presence/${id}`), (snap) => setActiveUsers(snap.val() || {}));
  }, [id, userName, hojaActivaId]);

  const guardarEnNube = async (nuevasHojas: any[]) => {
    if (!id) return;
    await setDoc(doc(db, 'planillas', id), { hojas: nuevasHojas }, { merge: true });
  };

  // --- EDICIÓN DE TABLAS ---
  const procesarCambiosMain = (nuevasFilas: any[]) => {
    let actualizadas = nuevasFilas.map(fila => {
      const v = parseCurrency(fila.ventaNeta); const m = parseCurrency(fila.costoMateriales); const c = parseCurrency(fila.costoVarios);
      fila.balanceIngreso = v - m - c; fila.pagoIva = Math.round(v * 1.19);
      return { ...fila, format: fila.format || {} };
    });
    const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, rows: actualizadas } : h);
    setHojas(nh); guardarEnNube(nh);
  };

  const procesarSueldos = (nuevasFilas: any[]) => {
    const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, sueldos: nuevasFilas } : h);
    setHojas(nh); guardarEnNube(nh);
  };

  const procesarGastosOficina = (nuevasFilas: any[]) => {
    const nh = hojas.map(h => h.id === hojaActivaId ? { ...h, gastosOficina: nuevasFilas } : h);
    setHojas(nh); guardarEnNube(nh);
  };

  const agregarFila = (tipo: 'main' | 'sueldo' | 'oficina') => {
    let nh = [...hojas];
    const idx = nh.findIndex(h => h.id === hojaActivaId);
    
    if (tipo === 'main') {
      const maxId = nh[idx].rows.length > 0 ? Math.max(...nh[idx].rows.map((r:any) => r.id)) : 0;
      nh[idx].rows.push(crearFilaVacia(maxId + 1));
    } else if (tipo === 'sueldo') {
      const maxId = (nh[idx].sueldos||[]).length > 0 ? Math.max(...(nh[idx].sueldos||[]).map((r:any) => r.id)) : 0;
      nh[idx].sueldos = [...(nh[idx].sueldos||[]), crearFilaSueldo(maxId + 1)];
    } else if (tipo === 'oficina') {
      const maxId = (nh[idx].gastosOficina||[]).length > 0 ? Math.max(...(nh[idx].gastosOficina||[]).map((r:any) => r.id)) : 0;
      nh[idx].gastosOficina = [...(nh[idx].gastosOficina||[]), crearFilaGasto(maxId + 1, 'Oficina')];
    }
    
    setHojas(nh); guardarEnNube(nh);
  };

  const agregarHoja = () => {
    const nuevoNombre = prompt('Nombre de la nueva hoja:'); if (!nuevoNombre) return;
    const nuevaHojaId = `hoja-${Date.now()}`;
    const nuevasHojas = [...hojas, { id: nuevaHojaId, nombre: nuevoNombre, rows: [crearFilaVacia(1)], sueldos: [crearFilaSueldo(1)], gastosOficina: [crearFilaGasto(1, 'Oficina')], balanceGeneral: 0 }];
    setHojas(nuevasHojas); setHojaActivaId(nuevaHojaId); guardarEnNube(nuevasHojas);
  };

  const renombrarHoja = (hojaId: string, nombreActual: string) => {
    const nuevoNombre = prompt('Renombrar hoja a:', nombreActual); if (!nuevoNombre || nuevoNombre === nombreActual) return;
    const nuevasHojas = hojas.map(h => h.id === hojaId ? { ...h, nombre: nuevoNombre } : h);
    setHojas(nuevasHojas); guardarEnNube(nuevasHojas);
  };

  const eliminarHoja = (hojaId: string) => {
    if (hojas.length <= 1) return alert("No puedes eliminar la única hoja que queda.");
    if (window.confirm("¿Estás seguro de que deseas ELIMINAR esta hoja y TODOS sus datos?")) {
      const nuevasHojas = hojas.filter(h => h.id !== hojaId);
      setHojas(nuevasHojas); setHojaActivaId(nuevasHojas[0].id); guardarEnNube(nuevasHojas);
    }
  };

  // --- ESCÁNER INTELIGENTE RESTAURADO CON COORDENADAS ---
  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const modoReemplazo = window.confirm("¿Deseas REEMPLAZAR los datos actuales con los del Excel?");
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target?.result, { type: 'array' });
      let hojasExtraidas: any[] = [];
      let idBase = 1, idSueldoBase = 1000, idGastoOficina = 5000;

      workbook.SheetNames.forEach((sheetName, sheetIndex) => {
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
        
        let hojaObj = { id: `hoja-${Date.now()}-${sheetIndex}`, nombre: sheetName, rows: [] as any[], sueldos: [] as any[], gastosOficina: [] as any[], balanceGeneral: 0 };
        
        let estado = 'IDLE'; 
        let leftMode = 'SUELDOS'; 

        let mainHeaders: string[] = [];
        let idxVNeta = -1, idxCMat = -1, idxCVar = -1, idxBal = -1, idxFecha = -1;

        const isEnero = sheetName.toUpperCase().includes('ENERO');
        const isCalama = (id || '').includes('calama');
        const isCopiapo = (id || '').includes('copiapo');

        for (let i = 0; i < rawData.length; i++) {
          const rowArr = rawData[i] as string[];
          const rowStr = rowArr.join(' ').toUpperCase();
          const excelRow = i + 1; // Fila real en Excel (1-based)

          if (!rowStr.trim()) continue;

          // 1. Detectar Tabla Principal
          if (estado === 'IDLE' && rowStr.includes('FECHA') && rowStr.includes('VENTA NETA')) {
            estado = 'TABLA_MAIN';
            mainHeaders = rowArr.map(h => String(h).toUpperCase().trim());
            idxVNeta = mainHeaders.findIndex(h => h.includes('VENTA NETA'));
            idxCMat = mainHeaders.findIndex(h => h.includes('COSTO MATERIALES'));
            idxCVar = mainHeaders.findIndex(h => h.includes('COSTO VARIOS'));
            idxBal = mainHeaders.findIndex(h => h.includes('BALANCE INGRESO'));
            idxFecha = mainHeaders.findIndex(h => h.includes('FECHA'));
            continue;
          }

          // 2. Extraer Filas Principales
          if (estado === 'TABLA_MAIN') {
            const firstCol = String(rowArr[idxFecha] || '').toUpperCase();
            const vNetaCol = String(rowArr[idxVNeta] || '').toUpperCase();
            
            // Fin de la tabla principal
            if (firstCol.includes('TOTAL') || firstCol.includes('RESUMEN') || vNetaCol.includes('TOTAL') || vNetaCol.includes('SUELDO') || vNetaCol.includes('TRABAJADOR') || vNetaCol.includes('GASTO') || rowStr.includes('BALANCE GENERAL')) {
              estado = 'POST_MAIN';
            } else {
              const vNeta = rowArr[idxVNeta] || '0';
              const fechaLimpia = parseExcelDate(rowArr[idxFecha]);
              if (!fechaLimpia && parseCurrency(vNeta) === 0 && !rowArr[idxFecha + 1]) continue;

              hojaObj.rows.push({
                id: idBase++, fecha: fechaLimpia, cliente: rowArr[idxFecha + 1] || '', empresa: rowArr[idxFecha + 2] || '',
                ot: rowArr[idxFecha + 3] || '', equipo: rowArr[idxFecha + 4] || '', patente: rowArr[idxFecha + 5] || '',
                trabajo: rowArr[idxFecha + 6] || '', ventaNeta: vNeta, costoMateriales: rowArr[idxCMat] || '0', costoVarios: rowArr[idxCVar] || '0',
                balanceIngreso: parseCurrency(vNeta) - parseCurrency(rowArr[idxCMat]) - parseCurrency(rowArr[idxCVar]),
                estatus: rowArr[idxBal + 1] || 'PENDIENTE', pagoNeto: rowArr[idxBal + 2] || '0', pagoIva: Math.round(parseCurrency(vNeta) * 1.19),
                factura: rowArr[idxBal + 4] || '', fechaPago: parseExcelDate(rowArr[idxBal + 5]), format: {}
              });
              continue;
            }
          }

          // 3. SECCIÓN SUELDOS Y GASTOS CON COORDENADAS EXACTAS
          if (estado === 'POST_MAIN') {
            let colVentaNeta = String(rowArr[idxVNeta] || '').trim();
            let colCostoMat = String(rowArr[idxCMat] || '').trim();
            let colCostoVar = String(rowArr[idxCVar] || '').trim();
            let upColVenta = colVentaNeta.toUpperCase();

            // --- LÓGICA DE COORDENADAS FUERTES ---
            let forceLeftMode = null;
            if (isCalama) {
               if (isEnero) {
                  if (excelRow >= 58 && excelRow <= 67) forceLeftMode = 'SUELDOS';
                  else if (excelRow >= 69 && excelRow <= 80) forceLeftMode = 'OFICINA';
               } else {
                  if (excelRow >= 58 && excelRow <= 69) forceLeftMode = 'SUELDOS';
                  else if (excelRow >= 72 && excelRow <= 83) forceLeftMode = 'OFICINA';
               }
            } else if (isCopiapo) {
               if (isEnero) {
                  if (excelRow >= 69 && excelRow <= 81) forceLeftMode = 'OFICINA'; // Sueldos estarían antes del 69
               } else {
                  if (excelRow >= 68 && excelRow <= 80) forceLeftMode = 'OFICINA';
               }
            }

            // Aplicar el forzado si existe, si no, intentar predecir
            let activeLeftMode = forceLeftMode || leftMode;
            if (!forceLeftMode) {
              if (upColVenta === 'SUELDO' || upColVenta === 'TRABAJADOR') activeLeftMode = 'SUELDOS';
              else if (upColVenta.includes('GASTO') || upColVenta.includes('OFICINA') || /ARRIENDO|LUZ|AGUA|TELEFONO|INTERNET|PLAN|CONTADOR|SISTEMA|SOFTWARE/i.test(upColVenta)) activeLeftMode = 'OFICINA';
              else if (upColVenta.includes('TOTAL') || upColVenta.includes('RESUMEN')) activeLeftMode = 'DONE';
              leftMode = activeLeftMode;
            }

            // GUARDAR DATOS EN SU RESPECTIVA TABLA
            if (colVentaNeta !== '' && activeLeftMode !== 'DONE' && !upColVenta.includes('TOTAL') && !upColVenta.includes('SUELDO') && !upColVenta.includes('TRABAJADOR')) {
              if (parseCurrency(colCostoMat) !== 0 || parseCurrency(colCostoVar) !== 0) {
                if (activeLeftMode === 'SUELDOS') {
                  hojaObj.sueldos.push({ id: idSueldoBase++, trabajador: colVentaNeta, sueldo: colCostoMat, cotizacion: colCostoVar, format: {} });
                } else if (activeLeftMode === 'OFICINA') {
                  hojaObj.gastosOficina.push({ id: idGastoOficina++, tipo: 'Oficina', detalle: colVentaNeta, monto: colCostoMat, format: {} });
                }
              }
            }

            // 4. BALANCE GENERAL (En la derecha)
            let stringTodaLaFila = rowArr.join(' ').toUpperCase();
            if (stringTodaLaFila.includes('BALANCE GENERAL') || stringTodaLaFila.includes('BALANCE  GENERAL')) {
              hojaObj.balanceGeneral = parseCurrency(rowArr[idxBal]) || parseCurrency(rowArr[idxBal + 1]) || parseCurrency(rowArr[idxBal + 2]);
            }
          }
        }

        // Crear fila vacía si no encontró nada
        if (hojaObj.rows.length === 0) hojaObj.rows.push(crearFilaVacia(idBase++));
        if (hojaObj.sueldos.length === 0) hojaObj.sueldos.push(crearFilaSueldo(idSueldoBase++));
        if (hojaObj.gastosOficina.length === 0) hojaObj.gastosOficina.push(crearFilaGasto(idGastoOficina++, 'Oficina'));
        
        hojasExtraidas.push(hojaObj);
      });

      if (hojasExtraidas.length > 0) {
        const nh = modoReemplazo ? hojasExtraidas : [...hojas, ...hojasExtraidas];
        setHojas(nh); setHojaActivaId(nh[0].id); guardarEnNube(nh);
      } else { alert("No se detectó el formato correcto en el Excel."); }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- EXPORTAR A EXCEL ---
  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();

    // 1. Hoja Principal
    const datosMapeados = hojaActiva.rows.map((r: any) => ({
      "N°": r.id,
      "FECHA": r.fecha || '',
      "CLIENTE": r.cliente || '',
      "EMPRESA": r.empresa || '',
      "OT": r.ot || '',
      "EQUIPO": r.equipo || '',
      "PATENTE": r.patente || '',
      "TRABAJO REALIZADO": r.trabajo || '',
      "VENTA NETA": parseCurrency(r.ventaNeta),
      "COSTO MATERIALES": parseCurrency(r.costoMateriales),
      "COSTO VARIOS": parseCurrency(r.costoVarios),
      "BALANCE INGRESO": parseCurrency(r.balanceIngreso),
      "ESTATUS": r.estatus || '',
      "PAGO NETO": parseCurrency(r.pagoNeto),
      "TOTAL (C/ IVA)": parseCurrency(r.pagoIva),
      "FACTURA": r.factura || '',
      "FECHA PAGO": r.fechaPago || ''
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datosMapeados), "Operaciones Principales");

    // 2. Hoja de Sueldos
    const sueldosMapeados = (hojaActiva.sueldos || []).map((r: any) => ({
      "N°": r.id,
      "TRABAJADOR": r.trabajador || '',
      "SUELDO LÍQUIDO": parseCurrency(r.sueldo),
      "COTIZACIONES": parseCurrency(r.cotizacion)
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sueldosMapeados), "Nómina Sueldos");

    // 3. Hoja Gastos Oficina
    const oficinaMapeados = (hojaActiva.gastosOficina || []).map((r: any) => ({
      "N°": r.id,
      "DETALLE / CONCEPTO": r.detalle || '',
      "MONTO": parseCurrency(r.monto)
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(oficinaMapeados), "Gastos Oficina");

    // Descargar
    XLSX.writeFile(wb, `Balance_${id}_${hojaActiva.nombre}.xlsx`);
  };

  // --- EXPORTAR A PDF ---
  const exportarPDF = () => {
    const doc = new jsPDF('landscape'); // Horizontal porque son muchas columnas
    
    doc.setFontSize(16);
    doc.text(`Balance Operativo - ${hojaActiva.nombre}`, 14, 15);
    
    // Resumen arriba
    doc.setFontSize(10);
    doc.text(`Balance General: ${formatMoney(hojaActiva.balanceGeneral)}`, 14, 23);
    doc.text(`Total Sueldos: ${formatMoney(totalSueldos)}`, 100, 23);
    doc.text(`Total Gastos Oficina: ${formatMoney(totalOficina)}`, 180, 23);

    // Tabla principal
    const tableData = hojaActiva.rows.map((r: any) => [
      r.fecha || '', r.empresa || '', r.equipo || '', 
      formatMoney(r.ventaNeta), formatMoney(r.balanceIngreso), r.estatus || ''
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['FECHA', 'EMPRESA', 'EQUIPO', 'VENTA NETA', 'BALANCE INGRESO', 'ESTATUS']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] } // blue-600
    });

    doc.save(`Balance_${hojaActiva.nombre}.pdf`);
  };

  const handleCellClick = (args: any) => {
    setCeldaSeleccionada({ rowId: args.row.id, columnKey: args.column.key });
    const presenceRef = ref(rtdb, `presence/${id}/${userName}`);
    set(presenceRef, { name: userName, editing: { row: args.row.id, column: args.column.key }, activeSheet: hojaActivaId });
  };

  const pintarCelda = (colorClass: string) => {
    if (!celdaSeleccionada) return;
    const pintarEn = (filas: any[]) => filas.map((fila: any) => fila.id === celdaSeleccionada.rowId ? { ...fila, format: { ...fila.format, [celdaSeleccionada.columnKey]: colorClass } } : fila);
    const nh = hojas.map(h => h.id === hojaActivaId ? { 
      ...h, rows: pintarEn(h.rows), sueldos: pintarEn(h.sueldos||[]), gastosOficina: pintarEn(h.gastosOficina||[]) 
    } : h);
    setHojas(nh); guardarEnNube(nh);
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

  // --- COLUMNAS ---
  const colsBase = useMemo(() => [
    { key: 'id', name: 'N°', width: 60, resizable: true },
    { key: 'fecha', name: 'FECHA', renderEditCell: textEditor, width: 120, resizable: true, cellClass: (r: any) => getCellClass(r, 'fecha') },
    { key: 'cliente', name: 'CLIENTE', renderEditCell: textEditor, width: 150, resizable: true, cellClass: (r: any) => getCellClass(r, 'cliente') },
    { key: 'empresa', name: 'EMPRESA', renderEditCell: textEditor, width: 200, resizable: true, cellClass: (r: any) => getCellClass(r, 'empresa') },
    { key: 'ot', name: 'OT', renderEditCell: textEditor, width: 80, resizable: true },
    { key: 'equipo', name: 'EQUIPO', renderEditCell: textEditor, width: 150, resizable: true },
    { key: 'patente', name: 'PATENTE', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'trabajo', name: 'TRABAJO REALIZADO', renderEditCell: textEditor, width: 350, resizable: true },
    { key: 'ventaNeta', name: 'VENTA NETA', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'costoMateriales', name: 'COSTO MATERIALES', renderEditCell: textEditor, width: 150, resizable: true },
    { key: 'costoVarios', name: 'COSTO VARIOS', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'balanceIngreso', name: 'BALANCE INGRESO', width: 150, renderCell: (p:any) => formatMoney(p.row.balanceIngreso) },
    { key: 'estatus', name: 'ESTATUS', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'pagoNeto', name: 'PAGO NETO', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'pagoIva', name: 'TOTAL (C/ IVA)', width: 150, renderCell: (p:any) => formatMoney(p.row.pagoIva) },
    { key: 'factura', name: 'FACTURA', renderEditCell: textEditor, width: 120, resizable: true },
    { key: 'fechaPago', name: 'FECHA PAGO', renderEditCell: textEditor, width: 150, resizable: true }
  ], [hojaActivaId, activeUsers]);

  const colsSueldos = useMemo(() => [
    { key: 'id', name: 'N°', width: 60, resizable: true },
    { key: 'trabajador', name: 'TRABAJADOR', renderEditCell: textEditor, width: 250, resizable: true },
    { key: 'sueldo', name: 'SUELDO LÍQUIDO', renderEditCell: textEditor, width: 150, resizable: true },
    { key: 'cotizacion', name: 'COTIZACIONES', renderEditCell: textEditor, width: 150, resizable: true }
  ], []);

  const colsGastosOficina = useMemo(() => [
    { key: 'id', name: 'N°', width: 60, resizable: true },
    { key: 'detalle', name: 'DETALLE / CONCEPTO', renderEditCell: textEditor, width: 350, resizable: true },
    { key: 'monto', name: 'MONTO', renderEditCell: textEditor, width: 150, resizable: true }
  ], []);

  return (
    <div className="p-2 h-screen flex flex-col bg-gray-50 overflow-hidden relative">
      <style>{`.rdg { --rdg-border-color: #d1d5db; height: 100%; border: none; } .rdg-cell { border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 0 8px; } .rdg-header-cell { background-color: #f3f4f6; border-bottom: 2px solid #9ca3af; font-weight: bold; color: #374151; } `}</style>

      {/* --- TOOLBAR SUPERIOR --- */}
      <div className="flex items-center gap-2 mb-2 px-2 shrink-0 flex-wrap">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-800 mr-2"><ArrowLeft size={24} /></Link>
        <h1 className="text-xl font-bold uppercase text-blue-800 mr-2 flex items-center gap-2"><FileSpreadsheet size={20}/> {id?.replace('-', ' ')}</h1>
        
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border shadow-sm">
          <PaintBucket size={18} className="text-gray-400 mx-2" />
          <button onClick={() => pintarCelda('bg-yellow-100 text-yellow-900')} className="w-6 h-6 rounded bg-yellow-100 border border-yellow-300" />
          <button onClick={() => pintarCelda('bg-green-100 text-green-900')} className="w-6 h-6 rounded bg-green-100 border border-green-300" />
          <button onClick={() => pintarCelda('bg-red-100 text-red-900')} className="w-6 h-6 rounded bg-red-100 border border-red-300" />
          <button onClick={() => pintarCelda('bg-blue-100 text-blue-900')} className="w-6 h-6 rounded bg-blue-100 border border-blue-300" />
          <button onClick={() => pintarCelda('')} className="w-6 h-6 rounded bg-white border text-xs text-gray-400">✖</button>
        </div>

        {/* NUEVOS BOTONES DE EXPORTACIÓN */}
        <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm ml-2">
          <input type="file" ref={fileInputRef} onChange={importarExcel} accept=".xlsx, .xls, .csv" className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-sm font-bold transition-all" title="Importar Excel">
            <Upload size={16} /> <span className="hidden sm:inline">Importar</span>
          </button>
          <div className="w-px bg-gray-200 mx-1"></div>
          <button onClick={exportarExcel} className="flex items-center gap-1.5 text-green-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-sm font-bold transition-all" title="Exportar a Excel">
            <Download size={16} /> <span className="hidden sm:inline">Excel</span>
          </button>
          <button onClick={exportarPDF} className="flex items-center gap-1.5 text-red-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-sm font-bold transition-all" title="Exportar a PDF">
            <FileDown size={16} /> <span className="hidden sm:inline">PDF</span>
          </button>
        </div>

        <button onClick={() => agregarFila('main')} className="ml-2 flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg shadow hover:bg-blue-700"><Plus size={16} /> Fila</button>

        {/* EL BOTÓN ÚNICO DE SUELDOS Y GASTOS */}
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1 bg-indigo-600 text-white px-4 py-1.5 text-sm rounded-lg shadow hover:bg-indigo-700 ml-4">
          <Calculator size={16} /> Sueldos y Gastos
        </button>

        <div className="flex -space-x-2 ml-auto pr-4">
          {Object.values(activeUsers).map((u: any) => (
            <div key={u.name} title={u.name} className={`inline-flex h-8 w-8 rounded-full ring-2 ring-white items-center justify-center text-xs font-bold text-white ${obtenerColorUsuario(u.name).bg}`}>{u.name.charAt(0).toUpperCase()}</div>
          ))}
        </div>
      </div>

      {/* --- GRAN MODAL CON ESPACIOS Y TOTALES COMO QUERÍAS --- */}
      {showModal && (
        <div className="absolute top-14 right-6 z-50 bg-white border-2 border-indigo-200 shadow-2xl rounded-2xl w-[750px] max-h-[85vh] flex flex-col overflow-hidden">
          
          <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex justify-between items-center shrink-0">
            <h2 className="font-bold text-indigo-800 text-xl flex items-center gap-2">
              <Calculator size={24} /> Desglose Operativo ({hojaActiva.nombre})
            </h2>
            <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-red-500 transition-colors"><X size={28} /></button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50 flex flex-col gap-8">
            
            {/* 1. SUELDOS */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col h-[280px] shrink-0">
              <div className="bg-gray-100 p-3 border-b flex justify-between items-center rounded-t-xl">
                <span className="font-bold text-gray-700 uppercase tracking-wide text-sm">1. Nómina de Sueldos <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded">Subtotal: {formatMoney(totalSueldos)}</span></span>
                <button onClick={() => agregarFila('sueldo')} className="bg-indigo-600 text-white px-3 py-1.5 text-xs font-bold rounded-lg hover:bg-indigo-700 flex items-center gap-1"><Plus size={14}/> Agregar Fila</button>
              </div>
              <div className="flex-1 min-h-0">
                <DataGrid columns={colsSueldos} rows={hojaActiva.sueldos || []} onRowsChange={procesarSueldos} onCellClick={handleCellClick} className="h-full w-full" style={{ minHeight: 0 }} />
              </div>
            </div>

            {/* ESPACIO SEPARADOR */}
            <div className="h-2 w-full"></div>

            {/* 2. GASTOS OFICINA */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col h-[280px] shrink-0">
              <div className="bg-amber-50 p-3 border-b border-amber-100 flex justify-between items-center rounded-t-xl">
                <span className="font-bold text-amber-800 uppercase tracking-wide text-sm">2. Gastos de Oficina <span className="ml-2 px-2 py-0.5 bg-amber-200 text-amber-900 rounded-md">Subtotal: {formatMoney(totalOficina)}</span></span>
                <button onClick={() => agregarFila('oficina')} className="bg-amber-600 text-white px-3 py-1.5 text-xs font-bold rounded-lg hover:bg-amber-700 flex items-center gap-1"><Plus size={14}/> Agregar Gasto</button>
              </div>
              <div className="flex-1 min-h-0">
                <DataGrid columns={colsGastosOficina} rows={hojaActiva.gastosOficina || []} onRowsChange={procesarGastosOficina} onCellClick={handleCellClick} className="h-full w-full" style={{ minHeight: 0 }} />
              </div>
            </div>

            {/* TOTAL GASTOS FIJOS (Sueldos + Oficina) */}
            <div className="bg-orange-50 border border-orange-200 p-5 rounded-xl flex justify-between items-center shadow-inner mt-4 shrink-0">
              <span className="font-black text-orange-900 text-lg uppercase tracking-wider">TOTAL GASTOS FIJOS</span>
              <span className="font-black text-orange-700 text-2xl">{formatMoney(granTotalGastosFijos)}</span>
            </div>

          </div>
        </div>
      )}
      
      {/* --- TABLA PRINCIPAL --- */}
      <div className="flex-1 bg-white border border-gray-300 shadow-sm relative flex flex-col rounded-t-lg min-h-0">
        <DataGrid columns={colsBase} rows={hojaActiva.rows} onRowsChange={procesarCambiosMain} onCellClick={handleCellClick} className="h-full w-full" style={{ minHeight: 0 }} />
      </div>

      {/* --- BARRA INFERIOR (Solo muestra Balance General extraído) --- */}
      <div className="bg-gray-800 text-white px-4 py-3 flex gap-8 text-sm shrink-0 shadow-inner items-center">
        <span className="font-bold text-gray-400 uppercase tracking-widest">Resumen Mensual:</span>
        <span className="ml-auto flex items-center gap-3">
          Balance General: 
          <strong className="text-green-400 bg-gray-700 px-3 py-1 rounded text-lg border border-gray-600">{formatMoney(hojaActiva.balanceGeneral)}</strong>
        </span>
      </div>

      {/* --- PESTAÑAS (TABS EXCEL) --- */}
      <div className="flex items-center gap-1 pt-1 shrink-0 overflow-x-auto bg-gray-50">
        {hojas.map((hoja) => (
          <div key={hoja.id} onClick={() => setHojaActivaId(hoja.id)} className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-b-lg border-x border-b border-t-0 shadow-sm cursor-pointer ${hojaActivaId === hoja.id ? 'bg-white text-blue-600 border-t-2 border-t-blue-500' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
            <FileSpreadsheet size={16} /> <span onDoubleClick={() => renombrarHoja(hoja.id, hoja.nombre)}>{hoja.nombre}</span>
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