import { useEffect, useState } from 'react';
import api from '../api.js';

// Reporte semanal (idea 5 de la matriz de priorización, Avance 3).
// Se conecta con GET /api/reportes/semanal, que devuelve la semana
// en curso, la anterior, la tendencia de cada indicador, las ventas
// por día y el pronóstico del módulo ML.

const FLECHA = { sube: '▲', baja: '▼', igual: '＝', nuevo: '●', sin_dato: '·' };
const CLASE_TENDENCIA = {
  sube: 'tend-sube',
  baja: 'tend-baja',
  igual: 'tend-igual',
  nuevo: 'tend-nuevo',
  sin_dato: 'tend-sin-dato',
};

function formatoValor(indicador) {
  const v = indicador.actual;
  if (v === null || v === undefined) return '-';
  if (indicador.clave === 'ingresos') return `S/ ${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (indicador.decimales) return Number(v).toFixed(indicador.decimales);
  return String(v);
}

function formatoAnterior(indicador) {
  const v = indicador.anterior;
  if (v === null || v === undefined) return '-';
  if (indicador.clave === 'ingresos') return `S/ ${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (indicador.decimales) return Number(v).toFixed(indicador.decimales);
  return String(v);
}

function Tendencia({ indicador }) {
  const clase = CLASE_TENDENCIA[indicador.tendencia] || 'tend-sin-dato';
  const pct =
    indicador.variacion_pct === null || indicador.variacion_pct === undefined
      ? ''
      : `${indicador.variacion_pct > 0 ? '+' : ''}${indicador.variacion_pct}%`;
  // "nuevo" = la semana pasada estaba en 0 y ahora hay actividad
  const etiqueta = pct || (indicador.tendencia === 'nuevo' ? 'nuevo' : 'sin dato');
  return (
    <span className={`tendencia ${clase}`}>
      <span aria-hidden="true">{FLECHA[indicador.tendencia] ?? '·'}</span> {etiqueta}
    </span>
  );
}

// Barra de ventas del día (proporcional al máximo de la semana)
function GraficoVentas({ dias }) {
  const maximo = Math.max(1, ...dias.map((d) => d.unidades));
  return (
    <div className="grafico-barras" role="img" aria-label="Ventas por día de la semana">
      {dias.map((d) => (
        <div className={`barra-fila ${d.futuro ? 'barra-futura' : ''}`} key={d.dia}>
          <span className="barra-etiqueta">{d.dia_semana}</span>
          <div className="barra-pista">
            <div
              className={`barra ${d.futuro ? '' : 'barra-llena'}`}
              style={{ width: `${(d.unidades / maximo) * 100}%` }}
            />
          </div>
          <span className="barra-valor">{d.futuro ? '-' : d.unidades}</span>
        </div>
      ))}
    </div>
  );
}

function NivelRiesgo({ nivel }) {
  if (nivel === 'alto') return <span className="badge badge-rojo">Riesgo alto</span>;
  if (nivel === 'medio') return <span className="badge badge-azul">Riesgo medio</span>;
  if (nivel === 'sin_datos') return <span className="badge badge-gris">Sin datos</span>;
  return <span className="badge badge-verde">Riesgo bajo</span>;
}

export default function Reportes() {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/reportes/semanal')
      .then(setReporte)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <p className="vacio">Generando el reporte de la semana…</p>;
  if (error) return <div className="alerta alerta-error">{error}</div>;
  if (!reporte) return null;

  const { semana, semana_anterior: anterior, indicadores } = reporte;
  const indicador = (clave) => indicadores.find((i) => i.clave === clave);
  const unidades = indicador('unidades_vendidas');
  const pendientes = indicador('pedidos_pendientes');
  const consultas = indicador('consultas_sin_stock');
  const quiebre = indicador('dias_hasta_quiebre');
  const riesgo = reporte.tallas_en_riesgo || [];

  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Reporte semanal</h1>
          <p>
            Semana {semana.numero} · {semana.rango} - comparado con la semana {anterior.numero} (
            {anterior.rango})
          </p>
        </div>
        <div className="acciones-titulo">
          <button
            className="btn"
            type="button"
            onClick={() => {
              setCargando(true);
              api
                .get('/reportes/semanal')
                .then(setReporte)
                .catch((err) => setError(err.message))
                .finally(() => setCargando(false));
            }}
          >
            ↻ Actualizar
          </button>
        </div>
      </header>

      {error && <div className="alerta alerta-error">{error}</div>}

      <section className="tarjetas-estado">
        <div className="tarjeta-estado">
          <span className="tarjeta-numero">{formatoValor(unidades)}</span>
          <span>Unidades vendidas en la semana</span>
        </div>
        <div className="tarjeta-estado">
          <span className="tarjeta-numero">{formatoValor(pendientes)}</span>
          <span>Pedidos pendientes</span>
        </div>
        <div className={`tarjeta-estado ${consultas.actual > 0 ? 'en-rojo' : ''}`}>
          <span className="tarjeta-numero">{formatoValor(consultas)}</span>
          <span>Consultas sin stock</span>
        </div>
        <div className={`tarjeta-estado ${quiebre.actual !== null && quiebre.actual <= 7 ? 'en-rojo' : ''}`}>
          <span className="tarjeta-numero">
            {quiebre.actual === null ? '-' : formatoValor(quiebre)}
          </span>
          <span>Días hasta el próximo quiebre</span>
        </div>
      </section>

      {/* -------- Indicadores vs semana anterior -------- */}
      <section className="reporte-seccion">
        <h2 className="reporte-subtitulo">Indicadores de la semana</h2>
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Indicador</th>
                <th>Valor semanal</th>
                <th>Semana anterior</th>
                <th>Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {indicadores.map((i) => (
                <tr key={i.clave}>
                  <td>{i.nombre}</td>
                  <td className="celda-stock">{formatoValor(i)}</td>
                  <td>{formatoAnterior(i)}</td>
                  <td>
                    <Tendencia indicador={i} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="reporte-dos-columnas">
        {/* -------- Ventas por día -------- */}
        <section className="reporte-seccion">
          <h2 className="reporte-subtitulo">Ventas por día</h2>
          <div className="panel-relleno">
            <GraficoVentas dias={reporte.ventas_diarias} />
            <p className="reporte-nota">
              Las salidas de stock incluyen los pedidos registrados en la app y la demanda del
              histórico. Los días en gris aún no ocurrieron.
            </p>
          </div>
        </section>

        {/* -------- Consultas sin stock -------- */}
        <section className="reporte-seccion">
          <h2 className="reporte-subtitulo">Demanda perdida (sin stock)</h2>
          <div className="panel-relleno">
            {reporte.consultas_sin_stock.length === 0 ? (
              <p className="vacio">
                Nadie intentó comprar una talla agotada en esta semana.{' '}
                {consultas.anterior > 0
                  ? `La semana anterior hubo ${consultas.anterior}.`
                  : 'Tampoco la semana anterior.'}
              </p>
            ) : (
              <ul className="lista-consultas">
                {reporte.consultas_sin_stock.map((c) => (
                  <li key={c.producto + c.motivo}>
                    <span className="consulta-producto">{c.producto}</span>
                    <span className="badge badge-rojo">{c.intentos} intento(s)</span>
                    <span className="consulta-motivo">
                      {c.motivo === 'no_disponible' ? 'talla no disponible' : 'sin existencias'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="reporte-nota">
              Cada intento de compra rechazado por falta de stock queda registrado aquí: es la
              demanda que el negocio no pudo satisfacer.
            </p>
          </div>
        </section>
      </div>

      {/* -------- Alerta predictiva (ML) -------- */}
      <section className="reporte-seccion">
        <h2 className="reporte-subtitulo">Alerta predictiva · próximos 7 días</h2>
        {!reporte.pronostico ? (
          <div className="alerta alerta-error">
            El pronóstico no está disponible: {reporte.error_pronostico}
          </div>
        ) : (
          <>
            <div className="alerta alerta-info">
              Modelo <strong>{reporte.pronostico.origen}</strong> ·{' '}
              {riesgo.length} tallas en riesgo alto/medio · generado{' '}
              {new Date(reporte.pronostico.generado_en).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
              {reporte.pronostico.resumen?.unidades_sugeridas > 0 && (
                <>
                  {' '}
                  · sugerencia de reposición:{' '}
                  <strong>{reporte.pronostico.resumen.unidades_sugeridas} unidades</strong> por{' '}
                  <strong>
                    S/{' '}
                    {Number(reporte.pronostico.resumen.valor_reposicion).toLocaleString('es-PE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                </>
              )}
            </div>

            {riesgo.length === 0 ? (
              <p className="vacio">Ninguna talla se agota en los próximos 14 días.</p>
            ) : (
              <div className="tabla-contenedor">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Talla</th>
                      <th>Stock</th>
                      <th>Demanda / día</th>
                      <th>Días hasta agotarse</th>
                      <th>Sugerido</th>
                      <th>Riesgo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riesgo.map((p) => (
                      <tr
                        key={p.sku_id}
                        className={p.nivel_riesgo === 'alto' ? 'fila-alerta' : ''}
                      >
                        <td className="celda-codigo">{p.codigo}</td>
                        <td>{p.talla}</td>
                        <td className="celda-stock">{p.stock}</td>
                        <td>{Number(p.demanda_diaria).toFixed(3)}</td>
                        <td>
                          {p.dias_hasta_quiebre === null
                            ? '-'
                            : Number(p.dias_hasta_quiebre).toFixed(1)}
                        </td>
                        <td>{p.sugerencia_reposicion} und.</td>
                        <td>
                          <NivelRiesgo nivel={p.nivel_riesgo} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="reporte-nota">
              Pronóstico calculado con el histórico de 180 días por talla. La confianza es alta
              cuando la talla vendió 30 o más unidades en la ventana.
            </p>
          </>
        )}
      </section>
    </>
  );
}
