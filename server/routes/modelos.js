import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// GET /api/modelos — catálogo con precio y stock total
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.id,
             m.nombre,
             m.categoria,
             m.precio_base,
             m.activo,
             COALESCE(SUM(s.stock_actual), 0)::int AS stock_total,
             COUNT(s.id)::int AS skus
        FROM modelos m
        LEFT JOIN skus s ON s.modelo_id = m.id
       WHERE m.activo = TRUE
       GROUP BY m.id
       ORDER BY m.nombre
    `);
    res.json(rows);
  } catch (err) {
    console.error('[modelos]', err.message);
    res.status(500).json({ error: 'Error al consultar el catálogo' });
  }
});

// POST /api/modelos — registra un producto nuevo con sus tallas y stock inicial
// body: { nombre, categoria, precio_base, tallas: [37,38,...], stock_inicial, stock_minimo }
router.post('/', async (req, res) => {
  const { nombre, categoria, precio_base, tallas, stock_inicial, stock_minimo } = req.body || {};

  if (!nombre || !categoria) {
    return res.status(400).json({ error: 'Nombre y categoría son obligatorios' });
  }
  const precio = Number(precio_base);
  if (!Number.isFinite(precio) || precio <= 0) {
    return res.status(400).json({ error: 'El precio debe ser un número mayor a 0' });
  }
  const listaTallas = Array.isArray(tallas) ? tallas.map((t) => String(t).trim()).filter(Boolean) : [];
  if (!listaTallas.length) {
    return res.status(400).json({ error: 'Indica al menos una talla' });
  }
  const inicial = Number(stock_inicial ?? 0);
  const minimo = Number(stock_minimo ?? 5);
  if (!Number.isInteger(inicial) || inicial < 0 || !Number.isInteger(minimo) || minimo < 0) {
    return res.status(400).json({ error: 'Stock inicial y mínimo deben ser enteros >= 0' });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const existente = await cliente.query('SELECT id FROM modelos WHERE nombre = $1', [nombre.trim()]);
    if (existente.rows.length) {
      await cliente.query('ROLLBACK');
      return res.status(409).json({ error: 'Ya existe un producto con ese nombre' });
    }

    const { rows } = await cliente.query(
      `INSERT INTO modelos (nombre, categoria, precio_base)
       VALUES ($1, $2, $3) RETURNING id`,
      [nombre.trim(), categoria, precio]
    );
    const modeloId = rows[0].id;

    for (const talla of listaTallas) {
      const sku = await cliente.query(
        `INSERT INTO skus (modelo_id, talla, stock_actual, stock_minimo)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [modeloId, talla, inicial, minimo]
      );
      if (inicial > 0) {
        await cliente.query(
          `INSERT INTO movimientos_stock (sku_id, tipo, cantidad, motivo)
           VALUES ($1, 'entrada', $2, 'Alta de producto')`,
          [sku.rows[0].id, inicial]
        );
      }
    }

    await cliente.query('COMMIT');
    res.status(201).json({ ok: true, id: modeloId, skus: listaTallas.length });
  } catch (err) {
    await cliente.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un producto con ese nombre' });
    }
    console.error('[modelos/post]', err.message);
    res.status(500).json({ error: 'Error al registrar el producto' });
  } finally {
    cliente.release();
  }
});

export default router;
