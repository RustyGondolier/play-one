import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// GET /api/skus
// Lista los SKU (modelo × talla) con su stock, stock mínimo y una bandera
// "alerta" que indica stock por debajo del mínimo (Pantalla 1 del prototipo).
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.id,
             m.nombre AS modelo,
             m.categoria,
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

export default router;
