import './env.js'; // debe ir primero: carga .env antes de crear el pool de BD
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import skusRoutes from './routes/skus.js';
import modelosRoutes from './routes/modelos.js';
import clientesRoutes from './routes/clientes.js';
import pedidosRoutes from './routes/pedidos.js';
import agenciasRoutes from './routes/agencias.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/skus', skusRoutes);
app.use('/api/modelos', modelosRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/agencias', agenciasRoutes);

// Health check (útil para Render)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, servicio: 'play-one-api' });
});

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
