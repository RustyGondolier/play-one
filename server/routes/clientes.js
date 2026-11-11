import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// GET /api/clientes — lista de clientes con su cantidad de pedidos
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.nombre, c.dni, c.celular,
             c.distrito_destino, c.agencia, c.creado_en,
             COUNT(p.id)::int AS pedidos
        FROM clientes c
        LEFT JOIN pedidos p ON p.cliente_id = c.id
       GROUP BY c.id
       ORDER BY c.nombre
    `);
    res.json(rows);
  } catch (err) {
    console.error('[clientes]', err.message);
    res.status(500).json({ error: 'Error al consultar los clientes' });
  }
});

// GET /api/clientes/:dni — busca por DNI (para detectar clientes ya registrados)
router.get('/:dni', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, dni, celular, distrito_destino, agencia FROM clientes WHERE dni = $1',
      [req.params.dni]
    );
    if (!rows.length) return res.status(404).json({ error: 'DNI no registrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[clientes/dni]', err.message);
    res.status(500).json({ error: 'Error al buscar el cliente' });
  }
});

// POST /api/clientes — registra un cliente nuevo
router.post('/', async (req, res) => {
  const { nombre, dni, celular, distrito_destino, agencia } = req.body || {};
  if (!nombre || !dni || !celular || !distrito_destino || !agencia) {
    return res.status(400).json({ error: 'Todos los datos del cliente son obligatorios' });
  }

  try {
    const existente = await pool.query('SELECT id FROM clientes WHERE dni = $1', [dni]);
    if (existente.rows.length) {
      return res.status(409).json({ error: 'Ese DNI ya está registrado' });
    }
    const { rows } = await pool.query(
      `INSERT INTO clientes (nombre, dni, celular, distrito_destino, agencia)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [nombre, dni, celular, distrito_destino, agencia]
    );
    res.status(201).json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error('[clientes/post]', err.message);
    res.status(500).json({ error: 'Error al registrar el cliente' });
  }
});

export default router;
