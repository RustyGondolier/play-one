import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// GET /api/skus
// Lista los SKU (modelo × talla) con stock, mínimo, precio del producto
// y la bandera "alerta" (stock por debajo del mínimo).
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.id,
             s.modelo_id,
             m.nombre AS modelo,
             m.precio_base,
             s.talla,
             s.stock_actual,
             s.stock_minimo,
             (s.stock_actual < s.stock_minimo) AS alerta
        FROM skus s
        JOIN modelos m ON m.id = s.modelo_id
       ORDER BY alerta DESC, m.nombre, s.talla
    `);
    res.json(rows);
  } catch (err) {
    console.error('[skus]', err.message);
    res.status(500).json({ error: 'Error al consultar el stock' });
  }
});

// POST /api/skus/:id/reponer  { cantidad }
// Añade stock (entrada de mercadería) y registra el movimiento.
router.post('/:id/reponer', async (req, res) => {
  const { id } = req.params;
  const cantidad = Number(req.body?.cantidad);
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: 'La cantidad debe ser un número entero mayor a 0' });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `UPDATE skus
          SET stock_actual = stock_actual + $1
        WHERE id = $2
        RETURNING id, stock_actual`,
      [cantidad, id]
    );
    if (!rows.length) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ error: 'SKU no encontrado' });
    }
    await cliente.query(
      `INSERT INTO movimientos_stock (sku_id, tipo, cantidad, motivo)
       VALUES ($1, 'entrada', $2, 'Reposición de stock')`,
      [id, cantidad]
    );
    await cliente.query('COMMIT');
    res.json({ ok: true, stock_actual: rows[0].stock_actual });
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error('[skus/reponer]', err.message);
    res.status(500).json({ error: 'Error al reponer el stock' });
  } finally {
    cliente.release();
  }
});

export default router;
