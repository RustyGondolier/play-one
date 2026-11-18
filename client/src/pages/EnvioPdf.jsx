import { useParams } from 'react-router-dom';

// Vista previa de la hoja de envío (Pantalla 3 del prototipo).
// La generación real del PDF se conecta con POST /api/envios/:id/pdf (semana 14).
export default function EnvioPdf() {
  const { id } = useParams();
  const codigo = `ENV-${String(id).padStart(5, '0')}`;

  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Hoja de envío</h1>
          <p>Vista previa del documento listo para imprimir</p>
        </div>
      </header>

      <div className="alerta alerta-info">
        La descarga en PDF se habilita con <code>POST /api/envios/:id/pdf</code> (semana 14).
      </div>

      <div className="hoja-pdf">
        <div className="hoja-encabezado">
          <div>
            <strong>PLAY ONE</strong>
            <small>Calzado deportivo · Social commerce</small>
          </div>
          <div className="hoja-codigo">
            <small>Código de envío</small>
            <strong>{codigo}</strong>
          </div>
        </div>

        <div className="hoja-seccion">
          <h3>Cliente</h3>
          <div className="hoja-datos">
            <p><span>Nombre:</span> -</p>
            <p><span>DNI:</span> -</p>
            <p><span>Celular:</span> -</p>
          </div>
        </div>

        <div className="hoja-seccion">
          <h3>Destino</h3>
          <div className="hoja-datos">
            <p><span>Distrito:</span> -</p>
            <p><span>Agencia:</span> -</p>
          </div>
        </div>

        <div className="hoja-seccion">
          <h3>Producto</h3>
          <table className="tabla tabla-hoja">
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Talla</th>
                <th>Precio</th>
                <th>Descuento</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="4" className="vacio">
                  {'Los datos del pedido #' + id + ' se mostrarán aquí'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="hoja-pie">
          <p>Datos verificados antes del despacho · Impreso desde Play One</p>
        </div>
      </div>

      <div className="formulario-acciones">
        <button className="btn btn-primario" disabled title="Se habilita en la semana 14">
          Descargar PDF
        </button>
      </div>
    </>
  );
}
