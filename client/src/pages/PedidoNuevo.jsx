import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';

const VACIO_CLIENTE = {
  nombre: '',
  dni: '',
  celular: '',
  distrito_destino: '',
  agencia: 'Olva Courier',
};

export default function PedidoNuevo() {
  const [modelos, setModelos] = useState([]);
  const [skus, setSkus] = useState([]);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [clienteExistente, setClienteExistente] = useState(null); // null = sin buscar, true/false

  const [cliente, setCliente] = useState(VACIO_CLIENTE);
  const [modeloId, setModeloId] = useState('');
  const [skuId, setSkuId] = useState('');
  const [descuento, setDescuento] = useState('');

  useEffect(() => {
    Promise.all([api.get('/modelos'), api.get('/skus')])
      .then(([m, s]) => {
        setModelos(m);
        setSkus(s);
      })
      .catch((err) => setError(err.message));
  }, []);

  // Tallas disponibles del modelo elegido (ordenadas de menor a mayor)
  const tallasDelModelo = useMemo(
    () =>
      skus
        .filter((s) => String(s.modelo_id) === String(modeloId))
        .sort((a, b) => Number(a.talla) - Number(b.talla)),
    [skus, modeloId]
  );

  const modeloSel = modelos.find((m) => String(m.id) === String(modeloId));
  const precio = Number(modeloSel?.precio_base || 0);
  const desc = Number(descuento || 0);
  const total = Math.max(precio - desc, 0);

  function cambiarCliente(campo, valor) {
    setCliente((c) => ({ ...c, [campo]: valor }));
    if (campo === 'dni') setClienteExistente(null);
  }

  // Al salir del campo DNI: buscar si el cliente ya está registrado
  async function buscarPorDni() {
    const dni = cliente.dni.trim();
    if (!/^\d{8}$/.test(dni)) return;
    try {
      const c = await api.get(`/clientes/${dni}`);
      setCliente({
        nombre: c.nombre,
        dni: c.dni,
        celular: c.celular,
        distrito_destino: c.distrito_destino,
        agencia: c.agencia,
      });
      setClienteExistente(true);
      setError('');
    } catch {
      setClienteExistente(false); // cliente nuevo: hay que completar los datos
    }
  }

  function cambiarModelo(id) {
    setModeloId(id);
    setSkuId('');
  }

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setExito('');

    if (!skuId) return setError('Selecciona la talla del producto');
    if (desc > precio) return setError('El descuento no puede superar el precio del producto');
    if (clienteExistente === false && (!cliente.nombre || !cliente.celular)) {
      return setError('Cliente nuevo: completa nombre, celular, destino y agencia');
    }

    setEnviando(true);
    try {
      const r = await api.post('/pedidos', {
        ...cliente,
        dni: cliente.dni.trim(),
        sku_id: Number(skuId),
        descuento: desc,
      });
      setExito(`Pedido #${r.pedido.id} registrado. Stock descontado.`);
      setCliente(VACIO_CLIENTE);
      setClienteExistente(null);
      setModeloId('');
      setSkuId('');
      setDescuento('');
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const avisoCliente =
    clienteExistente === true
      ? 'Cliente ya registrado: sus datos se cargaron automáticamente.'
      : clienteExistente === false
        ? 'DNI nuevo: completa los datos para registrarlo.'
        : null;

  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Registro de pedido</h1>
          <p>Precio tomado del producto · descuento opcional de monto fijo</p>
        </div>
      </header>

      {error && <div className="alerta alerta-error">{error}</div>}
      {exito && (
        <div className="alerta alerta-exito">
          {exito} <Link to="/pedidos">Ver pedidos →</Link>
        </div>
      )}

      <form className="formulario" onSubmit={enviar}>
        <fieldset>
          <legend>Cliente — busca por DNI</legend>
          <div className="campo-grid">
            <label>
              DNI *
              <input
                type="text"
                pattern="\d{8}"
                title="Debe tener 8 dígitos"
                placeholder="Ej. 45678912"
                value={cliente.dni}
                onChange={(e) => cambiarCliente('dni', e.target.value)}
                onBlur={buscarPorDni}
                required
              />
            </label>
            <label>
              Nombre y apellido {clienteExistente ? '' : '*'}
              <input
                type="text"
                value={cliente.nombre}
                onChange={(e) => cambiarCliente('nombre', e.target.value)}
                disabled={clienteExistente === true}
                required={clienteExistente !== true}
              />
            </label>
            <label>
              Celular {clienteExistente ? '' : '*'}
              <input
                type="tel"
                pattern="\d{9}"
                title="Debe tener 9 dígitos"
                value={cliente.celular}
                onChange={(e) => cambiarCliente('celular', e.target.value)}
                disabled={clienteExistente === true}
                required={clienteExistente !== true}
              />
            </label>
            <label>
              Destino (distrito) {clienteExistente ? '' : '*'}
              <input
                type="text"
                value={cliente.distrito_destino}
                onChange={(e) => cambiarCliente('distrito_destino', e.target.value)}
                disabled={clienteExistente === true}
                required={clienteExistente !== true}
              />
            </label>
            <label>
              Agencia de transporte *
              <select
                value={cliente.agencia}
                onChange={(e) => cambiarCliente('agencia', e.target.value)}
                disabled={clienteExistente === true}
              >
                <option>Olva Courier</option>
                <option>Shalom</option>
                <option>Epack</option>
              </select>
            </label>
          </div>
          {avisoCliente && (
            <small className={`nota ${clienteExistente ? 'nota-exito' : ''}`}>{avisoCliente}</small>
          )}
        </fieldset>

        <fieldset>
          <legend>Producto</legend>
          <div className="campo-grid">
            <label>
              Modelo *
              <select value={modeloId} onChange={(e) => cambiarModelo(e.target.value)} required>
                <option value="">— Selecciona —</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} ({m.categoria})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Talla *
              <select
                value={skuId}
                onChange={(e) => setSkuId(e.target.value)}
                disabled={!modeloId}
                required
              >
                <option value="">
                  {modeloId ? '— Selecciona —' : 'Elige primero el modelo'}
                </option>
                {tallasDelModelo.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.talla} (stock {s.stock_actual})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Precio del producto
              <input type="text" value={precio ? `S/ ${precio.toFixed(2)}` : ''} disabled />
            </label>
            <label>
              Descuento (S/, opcional)
              <input
                type="number"
                step="0.01"
                min="0"
                max={precio}
                placeholder="0.00"
                value={descuento}
                onChange={(e) => setDescuento(e.target.value)}
              />
            </label>
          </div>
          <small className="nota">
            {precio > 0
              ? desc > 0
                ? `Total del pedido: S/ ${total.toFixed(2)} (precio S/ ${precio.toFixed(2)} − descuento S/ ${desc.toFixed(2)})`
                : `Total del pedido: S/ ${precio.toFixed(2)} — sin descuento`
              : 'El precio viene guardado con el producto registrado.'}
          </small>
        </fieldset>

        <div className="formulario-acciones">
          <button className="btn btn-primario" type="submit" disabled={enviando}>
            {enviando ? 'Registrando…' : 'Registrar pedido y descontar stock'}
          </button>
        </div>
      </form>
    </>
  );
}
