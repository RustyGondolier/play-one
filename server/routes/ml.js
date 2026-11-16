// ============================================================
// Play One — Rutas del módulo de ML (alerta predictiva)
//
//   GET /api/ml/pronostico   pronóstico de demanda y quiebre de
//                            stock por talla (7 días)
//   GET /api/ml/evaluacion   backtesting del modelo: métricas en
//                            una ventana futura + línea base
//
// El modelo NO se entrena aquí: se entrena offline con
// ml/entrenar.py (scikit-learn) y el servidor sólo aplica el
// artefacto ml/modelo.json. Si el artefacto falta, inferencia.js
// reentrena en Node y lo marca como "fallback-node".
// ============================================================

import { Router } from 'express';
import pool from '../db/pool.js';
import { pronosticarStock } from '../ml/inferencia.js';
import { evaluar } from '../ml/evaluacion.js';

const router = Router();

// GET /api/ml/pronostico — alerta predictiva de quiebre de stock
router.get('/pronostico', async (req, res) => {
  try {
    const pronostico = await pronosticarStock();
    res.json(pronostico);
  } catch (err) {
    console.error('[ml/pronostico]', err.message);
    res.status(500).json({ error: 'No se pudo calcular el pronóstico' });
  }
});

// GET /api/ml/evaluacion — ¿qué tan bien funciona el modelo?
// Entrena con el pasado y evalúa con el último mes (sin mezclar
// información futura en el entrenamiento).
router.get('/evaluacion', async (req, res) => {
  try {
    const evaluacion = await evaluar();
    res.json(evaluacion);
  } catch (err) {
    console.error('[ml/evaluacion]', err.message);
    res.status(500).json({ error: 'No se pudo evaluar el modelo' });
  }
});

export default router;
