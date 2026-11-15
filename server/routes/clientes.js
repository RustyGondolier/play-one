import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const SELECT_CLIENTE = `
  SELECT c.id, c.nombre, c.dni, c.celular,
         c.distrito_destino, c.direccion, c.agencia, c.creado_en,
         COUNT(p.id)::int AS pedidos
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id
   GROUP BY c.id
`;

// GET /api/clientes — lista de clientes con su cantidad de pedidos
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`${SELECT_CLIENTE} ORDER BY c.nombre`);
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
      `SELECT id, nombre, dni, celular, distrito_destino, direccion, agencia
         FROM clientes WHERE dni = $1`,
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
// body: { nombre, dni, celular, distrito_destino, direccion, agencia }
router.post('/', async (req, res) => {
  const { nombre, dni, celular, distrito_destino, direccion, agencia } = req.body || {};
  if (!nombre || !dni || !celular || !distrito_destino || !direccion || !agencia) {
    return res.status(400).json({ error: 'Todos los datos del cliente son obligatorios (incluida la dirección)' });
  }

  try {
    const existente = await pool.query('SELECT id FROM clientes WHERE dni = $1', [dni]);
    if (existente.rows.length) {
      return res.status(409).json({ error: 'Ese DNI ya está registrado' });
    }
    const { rows } = await pool.query(
      `INSERT INTO clientes (nombre, dni, celular, distrito_destino, direccion, agencia)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [nombre, dni, celular, distrito_destino, direccion, agencia]
    );
    res.status(201).json({ ok: true, id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ese DNI ya está registrado' });
    }
    console.error('[clientes/post]', err.message);
    res.status(500).json({ error: 'Error al registrar el cliente' });
  }
});

// PATCH /api/clientes/:id — edita los datos del cliente
// body: { nombre, dni, celular, distrito_destino, direccion, agencia }
// El DNI se puede corregir, pero no puede repetirse (409).
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, dni, celular, distrito_destino, direccion, agencia } = req.body || {};

  if (!nombre || !dni || !celular || !distrito_destino || !direccion || !agencia) {
    return res.status(400).json({ error: 'Todos los datos del cliente son obligatorios (incluida la dirección)' });
  }

  try {
    // Duplicado de DNI: si cambió, no debe existir en otro cliente
    const duplicado = await pool.query(
      'SELECT id FROM clientes WHERE dni = $1 AND id <> $2',
      [dni, id]
    );
    if (duplicado.rows.length) {
      return res.status(409).json({ error: 'Ese DNI ya está registrado en otro cliente' });
    }

    const { rows } = await pool.query(
      `UPDATE clientes
          SET nombre = $1, dni = $2, celular = $3,
              distrito_destino = $4, direccion = $5, agencia = $6
        WHERE id = $7
        RETURNING id, nombre, dni, celular, distrito_destino, direccion, agencia`,
      [nombre, dni, celular, distrito_destino, direccion, agencia, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ ok: true, cliente: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ese DNI ya está registrado en otro cliente' });
    }
    console.error('[clientes/patch]', err.message);
    res.status(500).json({ error: 'Error al actualizar el cliente' });
  }
});

export default router;
