import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PlanillaViewBalance from './pages/PlanillaViewBalance';
import PlanillaViewFactura from './pages/PlanillaViewFactura';

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
        
        {/* Todas las rutas importantes ahora están envueltas en RutaProtegida */}
        <Route path="/dashboard" element={
          <RutaProtegida><Dashboard /></RutaProtegida>
        } />
        
        <Route path="/balance/:id" element={
          <RutaProtegida><PlanillaViewBalance /></RutaProtegida>
        } />
        
        <Route path="/factura/:id" element={
          <RutaProtegida><PlanillaViewFactura /></RutaProtegida>
        } />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;