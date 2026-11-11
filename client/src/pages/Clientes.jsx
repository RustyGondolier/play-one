import { useEffect, useMemo, useState } from 'react';
import api from '../api.js';

const VACIO = { nombre: '', dni: '', celular: '', distrito_destino: '', agencia: 'Olva Courier' };

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(VACIO);

  function cargar() {
    api
      .get('/clientes')
      .then(setClientes)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.dni.includes(q) ||
        c.distrito_destino.toLowerCase().includes(q)
    );
  }, [clientes, busqueda]);

  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setExito('');
    try {
      await api.post('/clientes', form);
      setExito(`Cliente ${form.nombre} registrado correctamente.`);
      setForm(VACIO);
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Clientes</h1>
          <p>Directorio de clientes: no hace falta volver a escribir sus datos</p>
        </div>
        <div className="acciones-titulo">
          <input
            className="buscador"
            type="search"
            placeholder="Buscar por nombre, DNI o destino…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <button className="btn btn-primario" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cancelar' : '＋ Nuevo cliente'}
          </button>
        </div>
      </header>

      {error && <div className="alerta alerta-error">{error}</div>}
      {exito && <div className="alerta alerta-exito">{exito}</div>}

      {mostrarForm && (
        <form className="formulario" onSubmit={guardar}>
          <fieldset>
            <legend>Datos del cliente</legend>
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
              <label>
                Agencia de transporte *
                <select value={form.agencia} onChange={(e) => cambiar('agencia', e.target.value)}>
                  <option>Olva Courier</option>
                  <option>Shalom</option>
                  <option>Epack</option>
                </select>
              </label>
            </div>
            <div className="formulario-acciones">
              <button className="btn btn-primario" type="submit">
                Guardar cliente
              </button>
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
                <th>Agencia</th>
                <th>Pedidos</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td>{c.dni}</td>
                  <td>{c.celular}</td>
                  <td>{c.distrito_destino}</td>
                  <td>{c.agencia}</td>
                  <td>
                    <span className="badge badge-descuento">{c.pedidos}</span>
                  </td>
                </tr>
              ))}
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
