import { useEffect, useMemo, useState } from 'react';
import api from '../api.js';

const TIPOS_DESCUENTO = [
  { valor: 'transmision', label: 'Por transmisión (live)' },
  { valor: 'talla_exclusiva', label: 'Talla exclusiva' },
  { valor: 'modelo_unico', label: 'Modelo único' },
];

export default function PedidoNuevo() {
  const [skus, setSkus] = useState([]);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState('');

  const [formulario, setFormulario] = useState({
    nombre: '',
    dni: '',
    celular: '',
    distrito_destino: '',
    agencia: 'Olva Courier',
    sku_id: '',
    precio: '',
    tipo_descuento: 'transmision',
    monto_descuento: '',
  });

  useEffect(() => {
    api.get('/skus').then(setSkus).catch((err) => setError(err.message));
  }, []);

  const modelos = useMemo(() => {
    const map = new Map();
    skus.forEach((s) => {
      if (!map.has(s.modelo)) map.set(s.modelo, []);
      map.get(s.modelo).push(s);
    });
    return [...map.entries()].map(([nombre, lista]) => ({
      nombre,
      skus: lista.sort((a, b) => Number(a.talla) - Number(b.talla)),
    }));
  }, [skus]);

  function cambiar(campo, valor) {
    setFormulario((f) => ({ ...f, [campo]: valor }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMensaje('');
    setEnviando('registrando…');
    try {
      const pedido = await api.post('/pedidos', {
        ...formulario,
        sku_id: Number(formulario.sku_id),
        precio: Number(formulario.precio),
        monto_descuento: Number(formulario.monto_descuento || 0),
      });
      setMensaje(`Pedido #${pedido.id} registrado. Se descontó el stock.`);
      e.target.reset();
    } catch (err) {
      setError(`${err.message} — el endpoint se conecta en la semana 13.`);
    } finally {
      setEnviando('');
    }
  }

  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Registro de pedido</h1>
          <p>El formulario valida los datos antes de descontar el stock</p>
        </div>
      </header>

      <div className="alerta alerta-info">
        Formulario operativo: al enviarlo llamará a <code>POST /api/pedidos</code> (pendiente hasta la semana 13).
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}
      {mensaje && <div className="alerta alerta-exito">{mensaje}</div>}

      <form className="formulario" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Datos del cliente</legend>
          <div className="campo-grid">
            <label>
              Nombre y apellido *
              <input
                type="text"
                value={formulario.nombre}
                onChange={(e) => cambiar('nombre', e.target.value)}
                required
              />
            </label>
            <label>
              DNI *
              <input
                type="text"
                pattern="\d{8}"
                title="Debe tener 8 dígitos"
                value={formulario.dni}
                onChange={(e) => cambiar('dni', e.target.value)}
                required
              />
            </label>
            <label>
              Celular *
              <input
                type="tel"
                pattern="\d{9}"
                title="Debe tener 9 dígitos"
                value={formulario.celular}
                onChange={(e) => cambiar('celular', e.target.value)}
                required
              />
            </label>
            <label>
              Destino (distrito) *
              <input
                type="text"
                value={formulario.distrito_destino}
                onChange={(e) => cambiar('distrito_destino', e.target.value)}
                required
              />
            </label>
            <label>
              Agencia de transporte *
              <select
                value={formulario.agencia}
                onChange={(e) => cambiar('agencia', e.target.value)}
              >
                <option>Olva Courier</option>
                <option>Shalom</option>
                <option>Epack</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Producto</legend>
          <div className="campo-grid">
            <label>
              Modelo y talla *
              <select
                value={formulario.sku_id}
                onChange={(e) => cambiar('sku_id', e.target.value)}
                required
              >
                <option value="">— Selecciona —</option>
                {modelos.map(({ nombre, skus: lista }) => (
                  <optgroup key={nombre} label={nombre}>
                    {lista.map((s) => (
                      <option key={s.id} value={s.id}>
                        Talla {s.talla} — stock {s.stock_actual}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              Precio (S/) *
              <input
                type="number"
                step="0.01"
                min="0"
                value={formulario.precio}
                onChange={(e) => cambiar('precio', e.target.value)}
                required
              />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Descuento aplicado en el live</legend>
          <div className="campo-grid">
            <label>
              Tipo de descuento
              <select
                value={formulario.tipo_descuento}
                onChange={(e) => cambiar('tipo_descuento', e.target.value)}
              >
                {TIPOS_DESCUENTO.map((t) => (
                  <option key={t.valor} value={t.valor}>{t.label}</option>
                ))}
              </select>
            </label>
            <label>
              Monto (S/)
              <input
                type="number"
                step="0.01"
                min="0"
                value={formulario.monto_descuento}
                onChange={(e) => cambiar('monto_descuento', e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>
          <small className="nota">
            El descuento queda auditado por pedido: reemplaza la captura de pantalla.
          </small>
        </fieldset>

        <div className="formulario-acciones">
          <button className="btn btn-primario" type="submit" disabled={!!enviando}>
            {enviando || 'Registrar pedido y descontar stock'}
          </button>
        </div>
      </form>
    </>
  );
}
