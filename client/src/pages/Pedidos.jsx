import { useEffect, useState } from 'react';
import api from '../api.js';

const COLUMNAS = [
  { estado: 'contactado', color: '#8b5cf6', titulo: 'Contactado' },
  { estado: 'reservado', color: '#f59e0b', titulo: 'Reservado' },
  { estado: 'despachado', color: '#3b82f6', titulo: 'Despachado' },
  { estado: 'entregado', color: '#22c55e', titulo: 'Entregado' },
];

// Datos de muestra mientras el endpoint GET /api/pedidos no existe (semana 14)
const PEDIDOS_DEMO = [
  { id: 1, cliente: 'María Quispe', producto: 'Runner Pro 90 · 39', fecha: '05/11', descuento: 15, estado: 'contactado' },
  { id: 2, cliente: 'Juan Rojas', producto: 'Street Classic · 41', fecha: '05/11', descuento: 0, estado: 'contactado' },
  { id: 3, cliente: 'Lucía Flores', producto: 'Train X · 37', fecha: '04/11', descuento: 10, estado: 'reservado' },
  { id: 4, cliente: 'Carlos Medina', producto: 'Urban High · 42', fecha: '04/11', descuento: 20, estado: 'reservado' },
  { id: 5, cliente: 'Ana Torres', producto: 'Marathon Elite · 40', fecha: '03/11', descuento: 15, estado: 'despachado' },
  { id: 6, cliente: 'Luis Mendoza', producto: 'Canvas Low · 38', fecha: '02/11', descuento: 0, estado: 'entregado' },
  { id: 7, cliente: 'Rosa Paredes', producto: 'Retro Court · 39', fecha: '01/11', descuento: 5, estado: 'entregado' },
];

export default function Pedidos() {
  const [pedidos, setPedidos] = useState(PEDIDOS_DEMO);
  const [esDemo, setEsDemo] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/pedidos')
      .then((datos) => {
        if (Array.isArray(datos) && datos.length) {
          setPedidos(datos);
          setEsDemo(false);
        }
      })
      .catch(() => {
        // endpoint aún no existe: se mantienen los datos de ejemplo
        setEsDemo(true);
      });
  }, []);

  function avanzar(pedido) {
    const i = COLUMNAS.findIndex((c) => c.estado === pedido.estado);
    if (i >= COLUMNAS.length - 1) return;
    const nuevo = COLUMNAS[i + 1].estado;
    api
      .patch(`/pedidos/${pedido.id}/estado`, { estado: nuevo })
      .then(() =>
        setPedidos((lista) =>
          lista.map((p) => (p.id === pedido.id ? { ...p, estado: nuevo } : p))
        )
      )
      .catch((err) => setError(`${err.message} — el endpoint se conecta en la semana 14.`));
  }

  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Pedidos — embudo de ventas</h1>
          <p>contactado → reservado → despachado → entregado</p>
        </div>
      </header>

      {esDemo && (
        <div className="alerta alerta-info">
          Datos de ejemplo: el tablero se conectará a <code>GET /api/pedidos</code> en la semana 14.
        </div>
      )}
      {error && <div className="alerta alerta-error">{error}</div>}

      <div className="kanban">
        {COLUMNAS.map((col) => {
          const lista = pedidos.filter((p) => p.estado === col.estado);
          return (
            <section className="kanban-columna" key={col.estado}>
              <header className="kanban-titulo" style={{ borderTopColor: col.color }}>
                <span>{col.titulo}</span>
                <span className="kanban-contador" style={{ background: col.color }}>
                  {lista.length}
                </span>
              </header>
              <div className="kanban-cuerpo">
                {lista.map((p) => (
                  <article className="tarjeta-pedido" key={p.id}>
                    <strong>{p.cliente}</strong>
                    <span className="tarjeta-producto">{p.producto}</span>
                    <div className="tarjeta-meta">
                      <small>{p.fecha}</small>
                      {p.descuento > 0 && (
                        <span className="badge badge-descuento">-S/ {p.descuento}</span>
                      )}
                    </div>
                    <button
                      className="btn btn-mini"
                      onClick={() => avanzar(p)}
                      title={col.estado === 'entregado' ? 'Pedido completado' : 'Avanzar al siguiente estado'}
                      disabled={col.estado === 'entregado'}
                    >
                      {col.estado === 'entregado' ? '✓ Completado' : 'Avanzar →'}
                    </button>
                  </article>
                ))}
                {lista.length === 0 && <p className="vacio">Sin pedidos</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
