import { useEffect, useMemo, useState } from 'react';
import api from '../api.js';

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
  // valor del input "mínimo para todas las tallas" del detalle abierto
  const [minimoAplicar, setMinimoAplicar] = useState('');

  // formulario de alta: solo código, producto y precio
  const [mostrarForm, setMostrarForm] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({ codigo: '', nombre: '', precio_base: '' });

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
      if (
        q &&
        !p.nombre.toLowerCase().includes(q) &&
        !String(p.codigo).toLowerCase().includes(q)
      ) {
        return false;
      }
      const sinTallas = Number(p.tallas_disponibles) === 0;
      const agotado = !sinTallas && Number(p.stock_total) === 0;
      const bajo = (p.tallas_detalle || []).some((t) => t.alerta);
      if (filtroStock === 'agotado' && !agotado) return false;
      if (filtroStock === 'bajo' && !(bajo && !agotado)) return false;
      return true;
    });
  }, [productos, busqueda, filtroStock]);

  function estadoProducto(p) {
    if (Number(p.tallas_disponibles) === 0) return { texto: 'Sin tallas disponibles', clase: 'badge-gris' };
    if (Number(p.stock_total) === 0) return { texto: 'Agotado', clase: 'badge-rojo' };
    if ((p.tallas_detalle || []).some((t) => t.alerta)) return { texto: 'Stock bajo', clase: 'badge-rojo' };
    return { texto: 'Disponible', clase: 'badge-verde' };
  }

  function estadoTalla(t) {
    if (!t.disponible) return { texto: 'No disponible', clase: 'badge-gris' };
    if (Number(t.stock_actual) === 0) return { texto: 'Agotada', clase: 'badge-rojo' };
    if (t.alerta) return { texto: 'Bajo mínimo', clase: 'badge-rojo' };
    return { texto: 'OK', clase: 'badge-verde' };
  }

  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  // Marcar/desmarcar la casilla de disponibilidad de la talla
  async function alternarDisponible(sku, checked) {
    setError('');
    setExito('');
    try {
      await api.patch(`/skus/${sku.sku_id}`, { disponible: checked });
      setExito(
        checked
          ? `Talla ${sku.peg}: marcada como disponible.`
          : `Talla ${sku.peg}: desmarcada (no se podrá vender ni generará alerta).`
      );
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  // Editar el stock mínimo de UNA talla (guarda al salir del campo)
  async function guardarMinimoTalla(sku, valor) {
    const minimo = Number(valor);
    if (!Number.isInteger(minimo) || minimo < 0) {
      setError('El stock mínimo debe ser un número entero mayor o igual a 0');
      cargar();
      return;
    }
    if (minimo === Number(sku.stock_minimo)) return;
    setError('');
    setExito('');
    try {
      await api.patch(`/skus/${sku.sku_id}`, { stock_minimo: minimo });
      setExito(
        `Talla ${sku.peg}: stock mínimo ahora ${minimo}` +
          (minimo > Number(sku.stock_actual) ? ' (queda bajo el mínimo).' : '.')
      );
      cargar();
    } catch (err) {
      setError(err.message);
      cargar();
    }
  }

  // Stock mínimo BASE del producto + propagación a todas sus tallas
  async function aplicarATodas(producto) {
    const minimo = Number(minimoAplicar);
    if (!Number.isInteger(minimo) || minimo < 0) {
      setError('El stock mínimo debe ser un número entero mayor o igual a 0');
      return;
    }
    setError('');
    setExito('');
    try {
      await api.patch(`/modelos/${producto.id}`, {
        stock_minimo_default: minimo,
        aplicar_a_todas: true,
      });
      setExito(`${producto.nombre}: stock mínimo ${minimo} aplicado a sus ${producto.tallas} tallas.`);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  // Reponer stock de una talla (disponible)
  async function reponer(producto, sku) {
    const respuesta = window.prompt(
      `¿Cuántas unidades llegaron de ${producto.nombre} talla ${sku.peg}?`,
      '1'
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
      const r = await api.post(`/skus/${sku.sku_id}/reponer`, { cantidad });
      setExito(`${producto.nombre} talla ${sku.peg}: nuevo stock ${r.stock_actual}.`);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setExito('');
    setEnviando(true);
    try {
      const r = await api.post('/modelos', {
        ...form,
        codigo: form.codigo.trim(),
        nombre: form.nombre.trim(),
        precio_base: Number(form.precio_base),
      });
      setExito(
        `Producto ${form.codigo} registrado con ${r.skus} tallas desmarcadas: marca las que manejes.`
      );
      setForm({ codigo: '', nombre: '', precio_base: '' });
      setMostrarForm(false);
      setBusqueda('');
      setFiltroStock('');
      setAbierto(r.id); // abrir el detalle para marcar tallas
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
          <p>Código, precio y disponibilidad de cada talla</p>
        </div>
        <div className="acciones-titulo">
          <input
            className="buscador"
            type="search"
            placeholder="Buscar código o producto…"
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
            <legend>Nuevo producto</legend>
            <div className="campo-grid">
              <label>
                Código *
                <input
                  type="text"
                  placeholder="Ej. KJ3418"
                  value={form.codigo}
                  onChange={(e) => cambiar('codigo', e.target.value)}
                  required
                />
              </label>
              <label>
                Producto *
                <input
                  type="text"
                  placeholder="Ej. CHIMP F50 VERDE LEAGUE SP"
                  value={form.nombre}
                  onChange={(e) => cambiar('nombre', e.target.value)}
                  required
                />
              </label>
              <label>
                Precio (S/) *
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="250.00"
                  value={form.precio_base}
                  onChange={(e) => cambiar('precio_base', e.target.value)}
                  required
                />
              </label>
            </div>
            <small className="nota">
              Se registrará con todas las tallas desmarcadas: después marcas las que manejas.
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
                <th>Código</th>
                <th>Producto</th>
                <th>Precio</th>
                <th>Tallas disponibles</th>
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
                    <td className="celda-codigo">{p.codigo}</td>
                    <td>{p.nombre}</td>
                    <td>S/ {Number(p.precio_base).toFixed(2)}</td>
                    <td>
                      {p.tallas_disponibles} / {p.tallas}
                    </td>
                    <td className="celda-stock">{p.stock_total}</td>
                    <td>
                      <span className={`badge ${est.clase}`}>{est.texto}</span>
                    </td>
                    <td>
                      <button
                        className="btn btn-mini"
                        onClick={() => {
                          const nuevo = expandido ? null : p.id;
                          setAbierto(nuevo);
                          if (nuevo) setMinimoAplicar(String(p.stock_minimo_default ?? 1));
                        }}
                      >
                        {expandido ? 'Ocultar tallas ▴' : 'Ver tallas ▾'}
                      </button>
                    </td>
                  </tr>,
                  expandido && (
                    <tr key={`${p.id}-det`} className="fila-detalle">
                      <td colSpan="7">
                        <div className="aplicar-minimo">
                          <label>
                            Stock mínimo para todas las tallas
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={minimoAplicar}
                              onChange={(e) => setMinimoAplicar(e.target.value)}
                            />
                          </label>
                          <button
                            className="btn btn-mini"
                            onClick={() => aplicarATodas(p)}
                            title="Cambia el mínimo del producto y lo aplica a todas sus tallas"
                          >
                            Aplicar a todas
                          </button>
                          <small className="nota">
                            También puedes cambiarlo talla por talla en la columna "Stock mínimo".
                          </small>
                        </div>
                        <table className="tabla-detalle">
                          <thead>
                            <tr>
                              <th className="col-check">✓</th>
                              <th>Talla (PEG)</th>
                              <th>USA</th>
                              <th>cm</th>
                              <th>Stock actual</th>
                              <th>Stock mínimo</th>
                              <th>Estado</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(p.tallas_detalle || []).map((t) => {
                              const estT = estadoTalla(t);
                              return (
                                <tr key={t.sku_id} className={t.disponible ? '' : 'fila-inactiva'}>
                                  <td className="col-check">
                                    <input
                                      type="checkbox"
                                      className="chk-disponible"
                                      checked={t.disponible}
                                      onChange={(e) =>
                                        alternarDisponible(t, e.target.checked)
                                      }
                                      title={
                                        t.disponible
                                          ? 'Disponible: se puede vender'
                                          : 'Desmarcada: no se puede vender y no genera alerta'
                                      }
                                    />
                                  </td>
                                  <td className="celda-talla">{t.peg}</td>
                                  <td>{t.usa ?? '—'}</td>
                                  <td>{t.cm ?? '—'}</td>
                                  <td className="celda-stock">{t.stock_actual}</td>
                                  <td>
                                    <input
                                      key={`min-${t.sku_id}-${t.stock_minimo}`}
                                      className="input-minimo"
                                      type="number"
                                      min="0"
                                      step="1"
                                      defaultValue={t.stock_minimo}
                                      title="Stock mínimo de esta talla (Enter o salir del campo para guardar)"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') e.target.blur();
                                      }}
                                      onBlur={(e) => guardarMinimoTalla(t, e.target.value)}
                                    />
                                  </td>
                                  <td>
                                    <span className={`badge ${estT.clase}`}>{estT.texto}</span>
                                  </td>
                                  <td>
                                    {t.disponible ? (
                                      <button
                                        className="btn btn-mini"
                                        onClick={() => reponer(p, t)}
                                      >
                                        ＋ Reponer
                                      </button>
                                    ) : (
                                      <small className="nota">—</small>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <small className="nota">
                          Desmarcada: la talla aparece en gris, no se puede vender y no genera
                          alerta aunque esté en 0.
                        </small>
                      </td>
                    </tr>
                  ),
                ];
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan="7" className="vacio">
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
