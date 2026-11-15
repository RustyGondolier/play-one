import { useEffect, useMemo, useState } from 'react';
import api from '../api.js';

const VACIO = {
  nombre: '',
  dni: '',
  celular: '',
  distrito_destino: '',
  direccion: '',
  agencia: 'Olva Courier',
};

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [agencias, setAgencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState(null); // id del cliente que se edita
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState(VACIO);

  function cargar() {
    api
      .get('/clientes')
      .then(setClientes)
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

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.dni.includes(q) ||
        c.distrito_destino.toLowerCase().includes(q) ||
        (c.direccion || '').toLowerCase().includes(q) ||
        c.agencia.toLowerCase().includes(q)
    );
  }, [clientes, busqueda]);

  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function abrirNuevo() {
    setEditando(null);
    setForm(VACIO);
    setMostrarForm(true);
    setError('');
    setExito('');
  }

  function abrirEdicion(c) {
    setEditando(c.id);
    setForm({
      nombre: c.nombre,
      dni: c.dni,
      celular: c.celular,
      distrito_destino: c.distrito_destino,
      direccion: c.direccion || '',
      agencia: c.agencia,
    });
    setMostrarForm(true);
    setError('');
    setExito('');
  }

  function cancelar() {
    setMostrarForm(false);
    setEditando(null);
    setForm(VACIO);
    setError('');
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setExito('');
    if (editando) {
      // editar cliente existente (el DNI también, con control de duplicado)
      try {
        await api.patch(`/clientes/${editando}`, form);
        setExito(`Datos de ${form.nombre} actualizados.`);
        cancelar();
        cargar();
      } catch (err) {
        setError(err.message);
      }
    } else {
      setEnviando(true);
      try {
        await api.post('/clientes', form);
        setExito(`Cliente ${form.nombre} registrado correctamente.`);
        setForm(VACIO);
        setMostrarForm(false);
        cargar();
      } catch (err) {
        setError(err.message);
      } finally {
        setEnviando(false);
      }
    }
  }

  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Clientes</h1>
          <p>Dirección exacta de entrega, destino y agencia de cada cliente</p>
        </div>
        <div className="acciones-titulo">
          <input
            className="buscador"
            type="search"
            placeholder="Buscar por nombre, DNI o dirección…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <button className="btn btn-primario" onClick={abrirNuevo}>
            {mostrarForm && !editando ? 'Cancelar' : '＋ Nuevo cliente'}
          </button>
        </div>
      </header>

      {error && <div className="alerta alerta-error">{error}</div>}
      {exito && <div className="alerta alerta-exito">{exito}</div>}

      {mostrarForm && (
        <form className="formulario" onSubmit={guardar}>
          <fieldset>
            <legend>{editando ? `Editando a ${form.nombre}` : 'Datos del cliente'}</legend>
            <div className="campo-grid">
              <label>
                Nombre y apellido *
                <input
                  type="text"
                  value={form.nombre}
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
                  value={form.dni}
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
                  value={form.celular}
                  onChange={(e) => cambiar('celular', e.target.value)}
                  required
                />
              </label>
              <label>
                Destino (distrito) *
                <input
                  type="text"
                  value={form.distrito_destino}
                  onChange={(e) => cambiar('distrito_destino', e.target.value)}
                  required
                />
              </label>
              <label className="campo-ancho">
                Dirección de entrega *
                <input
                  type="text"
                  placeholder="Ej. Av. Ejército 215, Urb. San Andrés"
                  value={form.direccion}
                  onChange={(e) => cambiar('direccion', e.target.value)}
                  required
                />
              </label>
              <label>
                Agencia de transporte *
                <select value={form.agencia} onChange={(e) => cambiar('agencia', e.target.value)}>
                  {agencias.map((a) => (
                    <option key={a.id}>{a.nombre}</option>
                  ))}
                </select>
              </label>
            </div>
            <small className="nota">
              {editando
                ? 'El DNI también es editable: si lo cambias, se valida que no lo tenga otro cliente.'
                : 'La dirección es obligatoria: es donde se entregará el pedido.'}
            </small>
            <div className="formulario-acciones">
              <button className="btn btn-primario" type="submit" disabled={enviando}>
                {editando
                  ? 'Guardar cambios'
                  : enviando
                    ? 'Registrando…'
                    : 'Guardar cliente'}
              </button>
              {editando && (
                <button className="btn btn-secundario" type="button" onClick={cancelar}>
                  Cancelar
                </button>
              )}
            </div>
          </fieldset>
        </form>
      )}

      {cargando ? (
        <p className="vacio">Cargando clientes…</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>DNI</th>
                <th>Celular</th>
                <th>Destino</th>
                <th>Dirección de entrega</th>
                <th>Agencia</th>
                <th>Pedidos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td>{c.dni}</td>
                  <td>{c.celular}</td>
                  <td>{c.distrito_destino}</td>
                  <td title={c.direccion}>
                    {c.direccion || <span className="texto-suave">Sin dirección</span>}
                  </td>
                  <td>{c.agencia}</td>
                  <td>
                    <span className="badge badge-descuento">{c.pedidos}</span>
                  </td>
                  <td>
                    <button className="btn btn-mini" onClick={() => abrirEdicion(c)}>
                      ✎ Editar
                    </button>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan="8" className="vacio">
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
