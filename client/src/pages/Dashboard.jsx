import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';
import AlertaBadge from '../components/AlertaBadge.jsx';

export default function Dashboard() {
  const [skus, setSkus] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  function cargar() {
    api
      .get('/skus')
      .then(setSkus)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return skus;
    return skus.filter(
      (s) =>
        s.codigo.toLowerCase().includes(q) ||
        s.modelo.toLowerCase().includes(q) ||
        String(s.talla).includes(q)
    );
  }, [skus, busqueda]);

  const enAlerta = skus.filter((s) => s.alerta).length;
  const modelos = new Set(skus.map((s) => s.modelo)).size;

  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Dashboard de stock</h1>
          <p>Inventario en tiempo real de las tallas disponibles</p>
        </div>
        <div className="acciones-titulo">
          <input
            className="buscador"
            type="search"
            placeholder="Buscar código, modelo o talla…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <Link className="btn btn-primario" to="/productos">
            ＋ Nuevo producto
          </Link>
        </div>
      </header>

      {error && <div className="alerta alerta-error">{error}</div>}

      <section className="tarjetas-estado">
        <div className="tarjeta-estado">
          <span className="tarjeta-numero">{skus.length}</span>
          <span>Tallas en stock</span>
        </div>
        <div className="tarjeta-estado">
          <span className="tarjeta-numero">{modelos}</span>
          <span>Modelos</span>
        </div>
        <div className={`tarjeta-estado ${enAlerta > 0 ? 'en-rojo' : ''}`}>
          <span className="tarjeta-numero">{enAlerta}</span>
          <span>Tallas bajo el mínimo</span>
        </div>
      </section>

      {cargando ? (
        <p className="vacio">Cargando stock…</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Modelo</th>
                <th>Talla</th>
                <th>Precio</th>
                <th>Stock actual</th>
                <th>Stock mínimo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((s) => (
                <tr key={s.id} className={s.alerta ? 'fila-alerta' : ''}>
                  <td className="celda-codigo">{s.codigo}</td>
                  <td>{s.modelo}</td>
                  <td>{s.talla}</td>
                  <td>S/ {Number(s.precio_base).toFixed(2)}</td>
                  <td className="celda-stock">{s.stock_actual}</td>
                  <td>{s.stock_minimo}</td>
                  <td><AlertaBadge alerta={s.alerta} /></td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan="7" className="vacio">Sin resultados para «{busqueda}»</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
