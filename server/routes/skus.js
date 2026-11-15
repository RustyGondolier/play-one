import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// GET /api/skus
// SKU disponibles a la venta (disponible = TRUE) con su talla PEG
// y equivalentes USA/cm, precio del producto y la bandera "alerta"
// (solo aplica a tallas marcadas como disponibles).
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.id,
             s.modelo_id,
             m.codigo,
             m.nombre AS modelo,
             m.precio_base,
             CASE WHEN t.peg = trunc(t.peg) THEN trunc(t.peg)::text ELSE t.peg::text END AS talla,
             CASE WHEN t.usa  = trunc(t.usa)  THEN trunc(t.usa)::text  ELSE t.usa::text  END AS usa,
             CASE WHEN t.cm   = trunc(t.cm)   THEN trunc(t.cm)::text   ELSE t.cm::text   END AS cm,
             s.stock_actual,
             s.stock_minimo,
             (s.stock_actual < s.stock_minimo) AS alerta
        FROM skus s
        JOIN modelos m ON m.id = s.modelo_id
        JOIN tallas  t ON t.id = s.talla_id
       WHERE s.disponible = TRUE
       ORDER BY alerta DESC, m.nombre, t.orden
    `);
    res.json(rows);
  } catch (err) {
    console.error('[skus]', err.message);
    res.status(500).json({ error: 'Error al consultar el stock' });
  }
});

// PATCH /api/skus/:id  { disponible?, stock_minimo? }
// - disponible: marca/desmarca la casilla de la talla. Desmarcada: no se
//   puede vender y no genera alerta.
// - stock_minimo: mínimo de ESTA talla (edita el umbral de alerta).
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { disponible, stock_minimo } = req.body || {};

  if (disponible !== undefined && typeof disponible !== 'boolean') {
    return res.status(400).json({ error: 'El campo disponible debe ser true o false' });
  }

  const cambios = [];
  const valores = [];
  if (disponible !== undefined) {
    valores.push(disponible);
    cambios.push(`disponible = $${valores.length}`);
  }
  if (stock_minimo !== undefined) {
    const minimo = Number(stock_minimo);
    if (!Number.isInteger(minimo) || minimo < 0) {
      return res.status(400).json({ error: 'El stock mínimo debe ser un número entero mayor o igual a 0' });
    }
    valores.push(minimo);
    cambios.push(`stock_minimo = $${valores.length}`);
  }
  if (!cambios.length) {
    return res.status(400).json({ error: 'Indica qué campo cambiar: disponible o stock_minimo' });
  }

  valores.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE skus SET ${cambios.join(', ')}
        WHERE id = $${valores.length}
        RETURNING id, disponible, stock_minimo, stock_actual,
                  (stock_actual < stock_minimo) AS alerta`,
      valores
    );
    if (!rows.length) return res.status(404).json({ error: 'SKU no encontrado' });
    res.json({ ok: true, ...rows[0] });
  } catch (err) {
    console.error('[skus/patch]', err.message);
    res.status(500).json({ error: 'Error al actualizar la talla' });
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
