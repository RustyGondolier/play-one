import './env.js'; // debe ir primero: carga .env antes de crear el pool de BD
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import { autenticar } from './middleware/auth.js';
import skusRoutes from './routes/skus.js';
import modelosRoutes from './routes/modelos.js';
import clientesRoutes from './routes/clientes.js';
import pedidosRoutes from './routes/pedidos.js';
import agenciasRoutes from './routes/agencias.js';
import mlRoutes from './routes/ml.js';
import reportesRoutes from './routes/reportes.js';
import pool from './db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ---- Rutas ----
// Públicas: /api/health la consulta Render (no expone datos) y
// /api/auth/login es la que entrega el token. Van antes del
// middleware de sesión.
app.get('/api/health', async (req, res) => {
  const base = { ok: true, servicio: 'play-one-api' };
  try {
    const { rows } = await pool.query('SELECT 1 AS ok');
    res.json({ ...base, db: rows[0].ok === 1 ? 'ok' : 'desconocido' });
  } catch (err) {
    console.error('[health] sin conexión a la base:', err.message);
    res.status(503).json({ ...base, ok: false, db: 'sin_conexion' });
  }
});

app.use('/api/auth', authRoutes);

// Todo lo demás exige un JWT válido (los datos de clientes son PII).
// Montado ANTES que las rutas de negocio: un token faltante o que no
// verifica corta la petición con 401 sin llegar a la base de datos.
app.use('/api', autenticar);

app.use('/api/skus', skusRoutes);
app.use('/api/modelos', modelosRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/agencias', agenciasRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/reportes', reportesRoutes);

// Sirve el build del frontend cuando exista (client/dist)
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next(); // sin frontend todavía -> 404 normal
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`API Play One escuchando en http://localhost:${PORT}`);
});
