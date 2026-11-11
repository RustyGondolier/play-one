import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PedidoNuevo from './pages/PedidoNuevo.jsx';
import Pedidos from './pages/Pedidos.jsx';
import EnvioPdf from './pages/EnvioPdf.jsx';
import Reportes from './pages/Reportes.jsx';
import Clientes from './pages/Clientes.jsx';
import ProductoNuevo from './pages/ProductoNuevo.jsx';

// Ruta protegida: sin sesión no hay acceso
function Protected({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/pedidos/nuevo" element={<Protected><PedidoNuevo /></Protected>} />
      <Route path="/pedidos" element={<Protected><Pedidos /></Protected>} />
      <Route path="/envios/:id" element={<Protected><EnvioPdf /></Protected>} />
      <Route path="/clientes" element={<Protected><Clientes /></Protected>} />
      <Route path="/productos/nuevo" element={<Protected><ProductoNuevo /></Protected>} />
      <Route path="/reportes" element={<Protected><Reportes /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
