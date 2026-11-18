import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const MENU = [
  { to: '/', label: 'Dashboard de stock' },
  { to: '/pedidos/nuevo', label: 'Nuevo pedido' },
  { to: '/pedidos', label: 'Pedidos' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/productos', label: 'Productos' },
  { to: '/reportes', label: 'Reportes' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          <div>
            <strong>Play One</strong>
            <small>Gestión operativa</small>
          </div>
        </div>

        <nav>
          {MENU.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="usuario">
            <span className="avatar">{user?.nombre?.charAt(0) || 'U'}</span>
            <div>
              <strong>{user?.nombre}</strong>
              <small>{user?.rol}</small>
            </div>
          </div>
          <button className="btn btn-secundario" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="contenido">{children}</main>
    </div>
  );
}
