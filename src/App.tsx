import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PlanillaViewBalance from './pages/PlanillaViewBalance';
import PlanillaViewFactura from './pages/PlanillaViewFactura';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/balance/:id" element={<PlanillaViewBalance />} />
        <Route path="/factura/:id" element={<PlanillaViewFactura />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;