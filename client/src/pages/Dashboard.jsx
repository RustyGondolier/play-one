import { useEffect, useMemo, useState } from 'react';
import api from '../api.js';
import AlertaBadge from '../components/AlertaBadge.jsx';

export default function Dashboard() {
  const [skus, setSkus] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    api
      .get('/skus')
      .then(setSkus)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return skus;
    return skus.filter(
      (s) => s.modelo.toLowerCase().includes(q) || s.talla.includes(q) || s.categoria.includes(q)
    );
  }, [skus, busqueda]);

  const enAlerta = skus.filter((s) => s.alerta).length;
  const modelos = new Set(skus.map((s) => s.modelo)).size;

  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Dashboard de stock</h1>
          <p>Inventario en tiempo real por modelo y talla</p>
        </div>
        <input
          className="buscador"
          type="search"
          placeholder="Buscar modelo, talla o categoría…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </header>

      {error && <div className="alerta alerta-error">{error}</div>}

      <section className="tarjetas-estado">
        <div className="tarjeta-estado">
          <span className="tarjeta-numero">{skus.length}</span>
          <span>SKU en stock</span>
        </div>
        <div className="tarjeta-estado">
          <span className="tarjeta-numero">{modelos}</span>
          <span>Modelos</span>
        </div>
        <div className={`tarjeta-estado ${enAlerta > 0 ? 'en-rojo' : ''}`}>
          <span className="tarjeta-numero">{enAlerta}</span>
          <span>SKU bajo el mínimo</span>
        </div>
      </section>

      {cargando ? (
        <p className="vacio">Cargando stock…</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Categoría</th>
                <th>Talla</th>
                <th>Stock actual</th>
                <th>Stock mínimo</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((s) => (
                <tr key={s.id} className={s.alerta ? 'fila-alerta' : ''}>
                  <td>{s.modelo}</td>
                  <td>{s.categoria}</td>
                  <td>{s.talla}</td>
                  <td className="celda-stock">{s.stock_actual}</td>
                  <td>{s.stock_minimo}</td>
                  <td><AlertaBadge alerta={s.alerta} /></td>
                  <td>
                    <button className="btn btn-mini" disabled title="Se habilita en la semana 13">
                      Reponer
                    </button>
                  </td>
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
