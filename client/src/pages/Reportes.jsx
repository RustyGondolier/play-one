// Reporte semanal (idea 5 de la matriz de priorización, asignada al Avance 3).
// Se conectará con GET /api/reportes/semanal y la alerta predictiva del módulo ML.
export default function Reportes() {
  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Reporte semanal</h1>
          <p>Ventas, pendientes y alertas de reposición</p>
        </div>
      </header>

      <div className="alerta alerta-info">
        Módulo en desarrollo: se habilita en la <strong>semana 15</strong>, junto con la alerta
        predictiva (ML).
      </div>

      <section className="tarjetas-estado">
        <div className="tarjeta-estado en-bloque">
          <span className="tarjeta-numero">—</span>
          <span>Ventas de la semana</span>
        </div>
        <div className="tarjeta-estado en-bloque">
          <span className="tarjeta-numero">—</span>
          <span>Pedidos pendientes</span>
        </div>
        <div className="tarjeta-estado en-bloque">
          <span className="tarjeta-numero">—</span>
          <span>Consultas sin stock</span>
        </div>
        <div className="tarjeta-estado en-bloque">
          <span className="tarjeta-numero">—</span>
          <span>Días hasta el próximo quiebre</span>
        </div>
      </section>

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
            <tr>
              <td colSpan="4" className="vacio">
                Los datos aparecerán aquí cuando el endpoint esté disponible
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
