import { useEffect, useMemo, useState } from 'react';
import api from '../api.js';

const TALLAS = ['37', '38', '39', '40', '41', '42'];

const FILTROS_STOCK = [
  { valor: '', etiqueta: 'Todo el stock' },
  { valor: 'bajo', etiqueta: 'Con stock bajo' },
  { valor: 'agotado', etiqueta: 'Agotados' },
];

export default function Productos() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  // filtros de la lista
  const [busqueda, setBusqueda] = useState('');
  const [filtroStock, setFiltroStock] = useState('');

  // detalle de tallas abierto
  const [abierto, setAbierto] = useState(null); // id del producto

  // formulario de alta
  const [mostrarForm, setMostrarForm] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    precio_base: '',
    stock_inicial: '10',
    stock_minimo: '5',
  });
  const [tallas, setTallas] = useState([...TALLAS]);

  function cargar() {
    api
      .get('/modelos')
      .then(setProductos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (q && !p.nombre.toLowerCase().includes(q)) return false;
      const agotado = Number(p.stock_total) === 0;
      const bajo = (p.tallas || []).some((t) => t.alerta);
      if (filtroStock === 'agotado' && !agotado) return false;
      if (filtroStock === 'bajo' && !(bajo && !agotado)) return false;
      return true;
    });
  }, [productos, busqueda, filtroStock]);

  function estadoProducto(p) {
    if (Number(p.stock_total) === 0) return { texto: 'Agotado', clase: 'badge-rojo' };
    if ((p.tallas || []).some((t) => t.alerta)) return { texto: 'Stock bajo', clase: 'badge-rojo' };
    return { texto: 'Disponible', clase: 'badge-verde' };
  }

  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function alternarTalla(t) {
    setTallas((lista) => (lista.includes(t) ? lista.filter((x) => x !== t) : [...lista, t]));
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setExito('');
    if (!tallas.length) return setError('Selecciona al menos una talla');
    setEnviando(true);
    try {
      const r = await api.post('/modelos', {
        ...form,
        precio_base: Number(form.precio_base),
        stock_inicial: Number(form.stock_inicial || 0),
        stock_minimo: Number(form.stock_minimo || 5),
        tallas,
      });
      setExito(`Producto registrado con ${r.skus} tallas.`);
      setForm({ nombre: '', precio_base: '', stock_inicial: '10', stock_minimo: '5' });
      setTallas([...TALLAS]);
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Productos</h1>
          <p>Catálogo de zapatillas: costo, tallas y stock de cada una</p>
        </div>
        <div className="acciones-titulo">
          <input
            className="buscador"
            type="search"
            placeholder="Buscar producto…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <select value={filtroStock} onChange={(e) => setFiltroStock(e.target.value)}>
            {FILTROS_STOCK.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.etiqueta}
              </option>
            ))}
          </select>
          <button className="btn btn-primario" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cancelar' : '＋ Nuevo producto'}
          </button>
        </div>
      </header>

      {error && <div className="alerta alerta-error">{error}</div>}
      {exito && <div className="alerta alerta-exito">{exito}</div>}

      {mostrarForm && (
        <form className="formulario" onSubmit={guardar}>
          <fieldset>
            <legend>Producto</legend>
            <div className="campo-grid">
              <label>
                Nombre del producto *
                <input
                  type="text"
                  placeholder="Ej. Thunder Strike FG"
                  value={form.nombre}
                  onChange={(e) => cambiar('nombre', e.target.value)}
                  required
                />
              </label>
              <label>
                Costo / precio (S/) *
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="149.90"
                  value={form.precio_base}
                  onChange={(e) => cambiar('precio_base', e.target.value)}
                  required
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Tallas y stock inicial</legend>
            <div className="tallas-check">
              {TALLAS.map((t) => (
                <label key={t} className={`talla-opcion ${tallas.includes(t) ? 'activa' : ''}`}>
                  <input
                    type="checkbox"
                    checked={tallas.includes(t)}
                    onChange={() => alternarTalla(t)}
                  />
                  {t}
                </label>
              ))}
            </div>
            <div className="campo-grid">
              <label>
                Stock inicial por talla
                <input
                  type="number"
                  min="0"
                  value={form.stock_inicial}
                  onChange={(e) => cambiar('stock_inicial', e.target.value)}
                />
              </label>
              <label>
                Stock mínimo (para alertas)
                <input
                  type="number"
                  min="0"
                  value={form.stock_minimo}
                  onChange={(e) => cambiar('stock_minimo', e.target.value)}
                />
              </label>
            </div>
            <small className="nota">
              Se registrará {tallas.length} líneas de stock (una por talla) con su movimiento de
              entrada.
            </small>
          </fieldset>

          <div className="formulario-acciones">
            <button className="btn btn-primario" type="submit" disabled={enviando}>
              {enviando ? 'Registrando…' : 'Registrar producto'}
            </button>
          </div>
        </form>
      )}

      {cargando ? (
        <p className="vacio">Cargando productos…</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Costo / precio</th>
                <th>Tallas</th>
                <th>Stock total</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => {
                const est = estadoProducto(p);
                const expandido = abierto === p.id;
                return [
                  <tr key={p.id}>
                    <td>{p.nombre}</td>
                    <td>S/ {Number(p.precio_base).toFixed(2)}</td>
                    <td>{p.skus}</td>
                    <td className="celda-stock">{p.stock_total}</td>
                    <td>
                      <span className={`badge ${est.clase}`}>{est.texto}</span>
                    </td>
                    <td>
                      <button
                        className="btn btn-mini"
                        onClick={() => setAbierto(expandido ? null : p.id)}
                      >
                        {expandido ? 'Ocultar tallas ▴' : 'Ver tallas ▾'}
                      </button>
                    </td>
                  </tr>,
                  expandido && (
                    <tr key={`${p.id}-det`} className="fila-detalle">
                      <td colSpan="6">
                        <table className="tabla-detalle">
                          <thead>
                            <tr>
                              <th>Talla</th>
                              <th>Stock actual</th>
                              <th>Stock mínimo</th>
                              <th>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(p.tallas || []).map((t) => (
                              <tr key={t.id} className={t.alerta ? 'fila-alerta' : ''}>
                                <td>{t.talla}</td>
                                <td className="celda-stock">{t.stock_actual}</td>
                                <td>{t.stock_minimo}</td>
                                <td>
                                  <span
                                    className={`badge ${t.stock_actual === 0 ? 'badge-rojo' : t.alerta ? 'badge-rojo' : 'badge-verde'}`}
                                  >
                                    {t.stock_actual === 0
                                      ? 'Agotada'
                                      : t.alerta
                                        ? 'Bajo mínimo'
                                        : 'OK'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ];
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan="6" className="vacio">
                    Sin resultados para «{busqueda}»
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
