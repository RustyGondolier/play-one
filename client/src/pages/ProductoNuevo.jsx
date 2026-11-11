import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';

const CATEGORIAS = ['césped natural', 'césped artificial', 'indoor', 'futsal'];
const TALLAS = ['37', '38', '39', '40', '41', '42'];

export default function ProductoNuevo() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    categoria: 'césped natural',
    precio_base: '',
    stock_inicial: '10',
    stock_minimo: '5',
  });
  const [tallas, setTallas] = useState([...TALLAS]);

  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function alternarTalla(t) {
    setTallas((lista) => (lista.includes(t) ? lista.filter((x) => x !== t) : [...lista, t]));
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    if (!tallas.length) return setError('Selecciona al menos una talla');
    setEnviando(true);
    try {
      await api.post('/modelos', {
        ...form,
        precio_base: Number(form.precio_base),
        stock_inicial: Number(form.stock_inicial || 0),
        stock_minimo: Number(form.stock_minimo || 5),
        tallas,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <>
      <header className="pagina-titulo">
        <div>
          <h1>Registrar producto nuevo</h1>
          <p>Zapatillas de fútbol: el precio se guarda junto al producto</p>
        </div>
      </header>

      {error && <div className="alerta alerta-error">{error}</div>}

      <form className="formulario" onSubmit={guardar}>
        <fieldset>
          <legend>Producto</legend>
          <div className="campo-grid">
            <label>
              Nombre del modelo *
              <input
                type="text"
                placeholder="Ej. Thunder Strike FG"
                value={form.nombre}
                onChange={(e) => cambiar('nombre', e.target.value)}
                required
              />
            </label>
            <label>
              Categoría (tipo de suela) *
              <select
                value={form.categoria}
                onChange={(e) => cambiar('categoria', e.target.value)}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Precio (S/) *
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="149.90"
                value={form.precio_base}
                onChange={(e) => cambiar('precio_base', e.target.value)}
                required
              />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Tallas y stock inicial</legend>
          <div className="tallas-check">
            {TALLAS.map((t) => (
              <label key={t} className={`talla-opcion ${tallas.includes(t) ? 'activa' : ''}`}>
                <input
                  type="checkbox"
                  checked={tallas.includes(t)}
                  onChange={() => alternarTalla(t)}
                />
                {t}
              </label>
            ))}
          </div>
          <div className="campo-grid">
            <label>
              Stock inicial por talla
              <input
                type="number"
                min="0"
                value={form.stock_inicial}
                onChange={(e) => cambiar('stock_inicial', e.target.value)}
              />
            </label>
            <label>
              Stock mínimo (para alertas)
              <input
                type="number"
                min="0"
                value={form.stock_minimo}
                onChange={(e) => cambiar('stock_minimo', e.target.value)}
              />
            </label>
          </div>
          <small className="nota">
            Se registrará {tallas.length} SKU (una línea por talla) con su movimiento de entrada.
          </small>
        </fieldset>

        <div className="formulario-acciones">
          <button className="btn btn-primario" type="submit" disabled={enviando}>
            {enviando ? 'Registrando…' : 'Registrar producto'}
          </button>
        </div>
      </form>
    </>
  );
}
