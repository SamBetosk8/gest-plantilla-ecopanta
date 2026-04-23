import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PlanillaViewBalance from './pages/PlanillaViewBalance';
import PlanillaViewFacturaCompra from './pages/PlanillaViewFacturaCompra';
import PlanillaViewFacturaVenta from './pages/PlanillaViewFacturaVenta';

// Este componente protege las rutas. Si no hay sesión, te manda al Login.
const RutaProtegida = ({ children }: { children: JSX.Element }) => {
  const usuario = sessionStorage.getItem('userName');
  if (!usuario) {
    return <Navigate to="/" replace />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        
        <Route path="/dashboard" element={
          <RutaProtegida><Dashboard /></RutaProtegida>
        } />
        
        <Route path="/balance/:id" element={
          <RutaProtegida><PlanillaViewBalance /></RutaProtegida>
        } />
        
        {/* Rutas Separadas para Facturas */}
        <Route path="/factura-compra/:id" element={
          <RutaProtegida><PlanillaViewFacturaCompra /></RutaProtegida>
        } />
        
        <Route path="/factura-venta/:id" element={
          <RutaProtegida><PlanillaViewFacturaVenta /></RutaProtegida>
        } />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;