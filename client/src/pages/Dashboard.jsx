import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';
import AlertaBadge from '../components/AlertaBadge.jsx';

export default function Dashboard() {
  const [skus, setSkus] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
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
      (s) => s.modelo.toLowerCase().includes(q) || s.talla.includes(q)
    );
  }, [skus, busqueda]);

  const enAlerta = skus.filter((s) => s.alerta).length;
  const modelos = new Set(skus.map((s) => s.modelo)).size;

  async function reponer(sku) {
    const respuesta = window.prompt(
      `¿Cuántas unidades llegaron de ${sku.modelo} talla ${sku.talla}?`,
      '10'
    );
    if (respuesta === null) return;
    const cantidad = Number(respuesta);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setError('La cantidad debe ser un número entero mayor a 0');
      return;
    }
    setError('');
    setExito('');
    try {
      const r = await api.post(`/skus/${sku.id}/reponer`, { cantidad });
      setExito(`${sku.modelo} talla ${sku.talla}: nuevo stock ${r.stock_actual}.`);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Dashboard de stock</h1>
          <p>Inventario en tiempo real de las zapatillas de fútbol</p>
        </div>
        <div className="acciones-titulo">
          <input
            className="buscador"
            type="search"
            placeholder="Buscar modelo o talla…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <Link className="btn btn-primario" to="/productos">
            ＋ Nuevo producto
          </Link>
        </div>
      </header>

      {error && <div className="alerta alerta-error">{error}</div>}
      {exito && <div className="alerta alerta-exito">{exito}</div>}

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
                <th>Talla</th>
                <th>Precio</th>
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
                  <td>{s.talla}</td>
                  <td>S/ {Number(s.precio_base).toFixed(2)}</td>
                  <td className="celda-stock">{s.stock_actual}</td>
                  <td>{s.stock_minimo}</td>
                  <td><AlertaBadge alerta={s.alerta} /></td>
                  <td>
                    <button className="btn btn-mini" onClick={() => reponer(s)}>
                      ＋ Reponer
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
