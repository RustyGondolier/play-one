import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// GET /api/modelos — catálogo con código, precio, stock y el
// detalle de TODAS las tallas del catálogo (con equivalentes
// USA/cm, stock y si están marcadas como disponibles)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.id,
             m.codigo,
             m.nombre,
             m.precio_base,
             m.stock_minimo_default,
             m.activo,
             COALESCE(SUM(s.stock_actual) FILTER (WHERE s.disponible), 0)::int AS stock_total,
             COUNT(s.id) FILTER (WHERE s.disponible)::int AS tallas_disponibles,
             COUNT(s.id)::int AS tallas,
             COALESCE(
               json_agg(
                 json_build_object(
                   'sku_id',       s.id,
                   'peg',          CASE WHEN t.peg = trunc(t.peg) THEN trunc(t.peg)::text ELSE t.peg::text END,
                   'usa',          CASE WHEN t.usa  = trunc(t.usa)  THEN trunc(t.usa)::text  ELSE t.usa::text  END,
                   'cm',           CASE WHEN t.cm   = trunc(t.cm)   THEN trunc(t.cm)::text   ELSE t.cm::text   END,
                   'stock_actual', s.stock_actual,
                   'stock_minimo', s.stock_minimo,
                   'disponible',   s.disponible,
                   'alerta',       s.disponible AND s.stock_actual < s.stock_minimo
                 ) ORDER BY t.orden
               ) FILTER (WHERE s.id IS NOT NULL),
               '[]'
             ) AS tallas_detalle
        FROM modelos m
        LEFT JOIN skus s ON s.modelo_id = m.id
        LEFT JOIN tallas t ON t.id = s.talla_id
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

// POST /api/modelos — registra un producto nuevo
// body: { codigo, nombre, precio_base }
// Crea el producto con TODAS las tallas del catálogo desmarcadas
// (en 0 y sin alerta); después se marcan las tallas disponibles.
router.post('/', async (req, res) => {
  const { codigo, nombre, precio_base } = req.body || {};

  if (!codigo || !String(codigo).trim()) {
    return res.status(400).json({ error: 'El código del producto es obligatorio' });
  }
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'El nombre del producto es obligatorio' });
  }
  const precio = Number(precio_base);
  if (!Number.isFinite(precio) || precio <= 0) {
    return res.status(400).json({ error: 'El precio debe ser un número mayor a 0' });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const existente = await cliente.query(
      'SELECT id FROM modelos WHERE codigo = $1 OR nombre = $2',
      [String(codigo).trim(), String(nombre).trim()]
    );
    if (existente.rows.length) {
      await cliente.query('ROLLBACK');
      return res.status(409).json({ error: 'Ya existe un producto con ese código o nombre' });
    }

    const { rows } = await cliente.query(
      `INSERT INTO modelos (codigo, nombre, precio_base)
       VALUES ($1, $2, $3) RETURNING id`,
      [String(codigo).trim(), String(nombre).trim(), precio]
    );
    const modeloId = rows[0].id;

    // Todas las tallas del catálogo, desmarcadas y en 0
    const skus = await cliente.query(
      `INSERT INTO skus (modelo_id, talla_id, stock_actual, stock_minimo, disponible)
       SELECT $1, t.id, 0, 1, FALSE FROM tallas t
       RETURNING id`,
      [modeloId]
    );

    await cliente.query('COMMIT');
    res.status(201).json({ ok: true, id: modeloId, skus: skus.rows.length });
  } catch (err) {
    await cliente.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un producto con ese código o nombre' });
    }
    console.error('[modelos/post]', err.message);
    res.status(500).json({ error: 'Error al registrar el producto' });
  } finally {
    cliente.release();
  }
});

// PATCH /api/modelos/:id  { stock_minimo_default, aplicar_a_todas? }
// Cambia el stock mínimo BASE del producto. Si aplicar_a_todas es true,
// el mismo valor se aplica a todas las tallas de ese producto.
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { aplicar_a_todas } = req.body || {};
  const minimo = Number(req.body?.stock_minimo_default);

  if (!Number.isInteger(minimo) || minimo < 0) {
    return res.status(400).json({ error: 'El stock mínimo debe ser un número entero mayor o igual a 0' });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const actualizado = await cliente.query(
      'UPDATE modelos SET stock_minimo_default = $1 WHERE id = $2 RETURNING id, stock_minimo_default',
      [minimo, id]
    );
    if (!actualizado.rows.length) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    let tallas = 0;
    if (aplicar_a_todas) {
      const r = await cliente.query(
        'UPDATE skus SET stock_minimo = $1 WHERE modelo_id = $2',
        [minimo, id]
      );
      tallas = r.rowCount;
    }
    await cliente.query('COMMIT');
    res.json({ ok: true, stock_minimo_default: minimo, tallas_actualizadas: tallas });
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error('[modelos/patch]', err.message);
    res.status(500).json({ error: 'Error al actualizar el stock mínimo' });
  } finally {
    cliente.release();
  }
});

export default router;
