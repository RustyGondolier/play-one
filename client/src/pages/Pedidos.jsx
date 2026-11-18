import { useEffect, useMemo, useState } from 'react';
import api from '../api.js';

// El embudo sigue siendo de 4 columnas: 'cancelado' NO es una etapa,
// es una salida del embudo y vive en su propia sección colapsada.
const COLUMNAS = [
  { estado: 'contactado', color: '#8b5cf6', titulo: 'Contactado' },
  { estado: 'reservado', color: '#f59e0b', titulo: 'Reservado' },
  { estado: 'despachado', color: '#3b82f6', titulo: 'Despachado' },
  { estado: 'entregado', color: '#22c55e', titulo: 'Entregado' },
];

const NOMBRES_ESTADO = {
  contactado: 'Contactado',
  reservado: 'Reservado',
  despachado: 'Despachado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

// Se cancela mientras el pedido NO salió de la bodega
const CANCELABLES = ['contactado', 'reservado'];

const FILTROS_VACIOS = { q: '', agencia: '', desde: '', hasta: '' };

export default function Pedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [agencias, setAgencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);

  function cargar() {
    api
      .get('/pedidos')
      .then(setPedidos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
    api
      .get('/agencias')
      .then(setAgencias)
      .catch(() => {});
  }, []);

  // Filtros: texto (cliente/DNI/producto), agencia y rango de fechas
  const filtrados = useMemo(() => {
    const q = filtros.q.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (
        q &&
        !p.cliente.toLowerCase().includes(q) &&
        !p.dni.includes(q) &&
        !String(p.codigo || '').toLowerCase().includes(q) &&
        !p.producto.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (filtros.agencia && (p.agencia || '') !== filtros.agencia) return false;
      if (filtros.desde && p.fecha_iso < filtros.desde) return false;
      if (filtros.hasta && p.fecha_iso > filtros.hasta) return false;
      return true;
    });
  }, [pedidos, filtros]);

  const cancelados = useMemo(
    () => filtrados.filter((p) => p.estado === 'cancelado'),
    [filtrados]
  );

  const hayFiltros = Object.values(filtros).some(Boolean);

  function cambiarFiltro(campo, valor) {
    setFiltros((f) => ({ ...f, [campo]: valor }));
  }

  function avanzar(pedido) {
    const i = COLUMNAS.findIndex((c) => c.estado === pedido.estado);
    if (i >= COLUMNAS.length - 1) return;
    const nuevo = COLUMNAS[i + 1].estado;
    api
      .patch(`/pedidos/${pedido.id}/estado`, { estado: nuevo })
      .then(() => {
        setError('');
        setExito(`Pedido #${pedido.id}: ${NOMBRES_ESTADO[nuevo].toLowerCase()}.`);
        cargar();
      })
      .catch((err) => setError(err.message));
  }

  // Cancelar: un solo prompt (confirmación + motivo opcional).
  // Confirmar devuelve la unidad al inventario en el backend.
  function cancelar(pedido) {
    const motivo = window.prompt(
      `¿Cancelar el pedido #${pedido.id}?\n` +
        `La unidad vuelve al inventario.\n\n` +
        `Motivo (opcional):`,
      ''
    );
    if (motivo === null) return; // cerró el diálogo: no se cancela
    api
      .patch(`/pedidos/${pedido.id}/cancelar`, { motivo: motivo.trim() })
      .then((r) => {
        setError('');
        setExito(
          `Pedido #${pedido.id} cancelado. Stock repuesto: ${r.stock_actual}.`
        );
        cargar();
      })
      .catch((err) => setError(err.message));
  }

  // Reactivar: deshace la cancelación y vuelve a descontar la unidad
  function reactivar(pedido) {
    api
      .patch(`/pedidos/${pedido.id}/reactivar`, {})
      .then((r) => {
        setError('');
        setExito(
          `Pedido #${pedido.id} reactivado (${NOMBRES_ESTADO[r.estado]}). Stock: ${r.stock_actual}.`
        );
        cargar();
      })
      .catch((err) => setError(err.message));
  }

  function guardarComprobante(pedido) {
    const input = document.getElementById(`comp-${pedido.id}`);
    const valor = (input?.value || '').trim();
    api
      .patch(`/pedidos/${pedido.id}/comprobante`, { comprobante: valor })
      .then(() => {
        setError('');
        setExito(
          valor
            ? `Comprobante "${valor}" guardado en el pedido #${pedido.id}.`
            : `Comprobante eliminado del pedido #${pedido.id}.`
        );
        cargar();
      })
      .catch((err) => setError(err.message));
  }

  // Tarjeta compartida por el embudo y por la sección de cancelados
  function tarjeta(p) {
    const esCancelado = p.estado === 'cancelado';
    return (
      <article
        className={`tarjeta-pedido${esCancelado ? ' cancelada' : ''}`}
        key={p.id}
      >
        <strong>{p.cliente}</strong>
        <span className="tarjeta-producto">{p.producto}</span>

        <div className="tarjeta-meta">
          <small title="Fecha de registro">Registrado: {p.fecha_registro}</small>
          {p.descuento > 0 && (
            <span className="badge badge-descuento">-S/ {p.descuento}</span>
          )}
          {esCancelado && <span className="badge badge-cancelado">Cancelado</span>}
        </div>

        {p.agencia && <small className="tarjeta-agencia">{p.agencia}</small>}
        {p.direccion && (
          <small className="tarjeta-agencia" title="Dirección de entrega del pedido">
            {p.direccion}
            {p.distrito_destino ? ` · ${p.distrito_destino}` : ''}
          </small>
        )}

        {esCancelado && (
          <small className="tarjeta-cancelacion">
            Cancelado {p.fecha_cancelacion ? `el ${p.fecha_cancelacion}` : ''}
            {p.motivo_cancelacion ? ` - ${p.motivo_cancelacion}` : ''}
          </small>
        )}

        <details className="historial">
          <summary>Fechas de estado</summary>
          <ul>
            {(p.historial || []).map((h, i) => (
              <li key={i}>
                <strong>{NOMBRES_ESTADO[h.estado] || h.estado}</strong> - {h.fecha}
              </li>
            ))}
          </ul>
        </details>

        {!esCancelado && (p.estado === 'despachado' || p.estado === 'entregado') && (
          <div className="comprobante">
            <input
              id={`comp-${p.id}`}
              key={String(p.comprobante)}
              type="text"
              placeholder="N° comprobante (opcional)"
              defaultValue={p.comprobante || ''}
            />
            <button
              className="btn btn-mini"
              onClick={() => guardarComprobante(p)}
              title="Guardar comprobante de la agencia"
            >
              Guardar
            </button>
          </div>
        )}

        <div className="tarjeta-acciones">
          {esCancelado ? (
            <button
              className="btn btn-mini btn-reactivar"
              onClick={() => reactivar(p)}
              title="Deshacer la cancelación y volver al estado anterior"
            >
              Reactivar
            </button>
          ) : (
            <button
              className="btn btn-mini"
              onClick={() => avanzar(p)}
              title={
                p.estado === 'entregado'
                  ? 'Pedido completado'
                  : 'Avanzar al siguiente estado'
              }
              disabled={p.estado === 'entregado'}
            >
              {p.estado === 'entregado' ? '✓ Completado' : 'Avanzar →'}
            </button>
          )}

          {!esCancelado && CANCELABLES.includes(p.estado) && (
            <button
              className="btn btn-mini btn-cancelar"
              onClick={() => cancelar(p)}
              title="Cancelar el pedido (la unidad vuelve al inventario)"
            >
              Cancelar
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Pedidos - embudo de ventas</h1>
          <p>contactado → reservado → despachado → entregado</p>
        </div>
      </header>

      {error && <div className="alerta alerta-error">{error}</div>}
      {exito && <div className="alerta alerta-exito">{exito}</div>}

      <div className="filtros">
        <input
          className="buscador"
          type="search"
          placeholder="Buscar cliente, DNI o código…"
          value={filtros.q}
          onChange={(e) => cambiarFiltro('q', e.target.value)}
        />
        <select
          value={filtros.agencia}
          onChange={(e) => cambiarFiltro('agencia', e.target.value)}
          aria-label="Filtrar por agencia"
        >
          <option value="">Todas las agencias</option>
          {agencias.map((a) => (
            <option key={a.id}>{a.nombre}</option>
          ))}
        </select>
        <label className="filtro-fecha">
          Desde
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => cambiarFiltro('desde', e.target.value)}
          />
        </label>
        <label className="filtro-fecha">
          Hasta
          <input
            type="date"
            value={filtros.hasta}
            onChange={(e) => cambiarFiltro('hasta', e.target.value)}
          />
        </label>
        {hayFiltros && (
          <button className="btn btn-mini" onClick={() => setFiltros(FILTROS_VACIOS)}>
            Limpiar
          </button>
        )}
        <span className="filtro-contador">
          {filtrados.length} de {pedidos.length} pedidos
        </span>
      </div>

      {cargando ? (
        <p className="vacio">Cargando pedidos…</p>
      ) : (
        <>
          <div className="kanban">
            {COLUMNAS.map((col) => {
              const lista = filtrados.filter((p) => p.estado === col.estado);
              return (
                <section className="kanban-columna" key={col.estado}>
                  <header className="kanban-titulo" style={{ borderTopColor: col.color }}>
                    <span>{col.titulo}</span>
                    <span className="kanban-contador" style={{ background: col.color }}>
                      {lista.length}
                    </span>
                  </header>
                  <div className="kanban-cuerpo">
                    {lista.map((p) => tarjeta(p))}
                    {lista.length === 0 && <p className="vacio">Sin pedidos</p>}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Los cancelados no son una etapa del embudo: quedan aparte,
              en una franja colapsada, con su motivo y la opción de reactivar. */}
          <details className="cancelados" open={cancelados.length > 0 && hayFiltros}>
            <summary>
              Cancelados ({cancelados.length}) - la unidad volvió al inventario
            </summary>
            <div className="cancelados-lista">
              {cancelados.map((p) => tarjeta(p))}
              {cancelados.length === 0 && (
                <p className="vacio">Sin pedidos cancelados con los filtros actuales</p>
              )}
            </div>
          </details>
        </>
      )}
    </>
  );
}
