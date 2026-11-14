import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// GET /api/agencias — catálogo de agencias de transporte
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nombre FROM agencias ORDER BY nombre');
    res.json(rows);
  } catch (err) {
    console.error('[agencias]', err.message);
    res.status(500).json({ error: 'Error al consultar las agencias' });
  }
});

// POST /api/agencias — agrega una agencia de transporte  { nombre }
router.post('/', async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) {
    return res.status(400).json({ error: 'El nombre de la agencia es obligatorio' });
  }

  try {
    const existente = await pool.query(
      'SELECT id FROM agencias WHERE lower(nombre) = lower($1)',
      [nombre]
    );
    if (existente.rows.length) {
      return res.status(409).json({ error: 'Esa agencia ya está registrada' });
    }
    const { rows } = await pool.query(
      'INSERT INTO agencias (nombre) VALUES ($1) RETURNING id, nombre',
      [nombre]
    );
    res.status(201).json({ ok: true, agencia: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esa agencia ya está registrada' });
    }
    console.error('[agencias/post]', err.message);
    res.status(500).json({ error: 'Error al registrar la agencia' });
  }
});

export default router;
