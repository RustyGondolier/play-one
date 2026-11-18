// ============================================================
// Play One - Evaluación del modelo (backtesting)
//
// Entrena con el PASADO y evalúa con el futuro, como corresponde
// en series temporales: se ajusta con los días hasta el corte y se
// evalúa sólo en la ventana de prueba (los últimos VENTANA_TEST
// días). Nunca se mezcla información futura en el entrenamiento.
//
// Además se calcula una LÍNEA BASE: suavizado exponencial simple
//   ŷ(t) = α·ventas(t−1) + (1−α)·ŷ(t−1)     α = 0.3
// recorriendo la misma ventana por SKU. Si el modelo no le gana a
// la línea base, se dice honestamente en el informe.
//
// Métricas: MAE, RMSE y WAPE (no MAPE: la demanda diaria tiene
// muchos ceros y el MAPE se dispara).
// ============================================================

import pool from '../db/pool.js';
import { ajustar, metricas, predecir } from './modelo.js';
import { construirDataset, DIAS, MIN_DIAS } from './dataset.js';

export const VENTANA_TEST = 14; // días de prueba (las 2 últimas semanas)
export const LAMBDA = 1.0; // regularización Ridge (valor por defecto de scikit-learn)
export const ALFA_EMA = 0.3; // suavizado exponencial de la línea base

/**
 * Línea base: suavizado exponencial simple por SKU, recorriendo
 * la ventana completa (se inicializa con la media de los primeros
 * MIN_DIAS días y sólo se evalúa en la ventana de prueba).
 */
function lineaBase(skus, corte) {
  const reales = [];
  const predichos = [];

  for (const sku of skus) {
    const diario = sku.diario;
    let suavizado = 0;
    for (let d = 0; d < MIN_DIAS; d += 1) suavizado += diario[d];
    suavizado /= MIN_DIAS;

    for (let d = MIN_DIAS; d < DIAS; d += 1) {
      const prediccion = Math.max(0, suavizado);
      if (d >= corte) {
        reales.push(diario[d]);
        predichos.push(prediccion);
      }
      suavizado = ALFA_EMA * diario[d] + (1 - ALFA_EMA) * suavizado;
    }
  }
  return metricas(reales, predichos);
}

/** Métricas del modelo y de la línea base, por SKU y en global */
export async function evaluar(cliente = pool) {
  const { skus, filas, caracteristicas } = await construirDataset(cliente);
  const corte = DIAS - VENTANA_TEST;

  const entrenamiento = filas.filter((f) => f.dia < corte);
  const prueba = filas.filter((f) => f.dia >= corte);

  if (!entrenamiento.length || !prueba.length) {
    throw new Error('No hay datos suficientes para evaluar el modelo');
  }

  const modelo = ajustar(
    entrenamiento.map((f) => f.x),
    entrenamiento.map((f) => f.y),
    { lambda: LAMBDA }
  );
  modelo.caracteristicas = caracteristicas;
  modelo.entrenado_en = new Date().toISOString();
  modelo.ventana_entrenamiento = [MIN_DIAS, corte - 1];
  modelo.ventana_prueba = [corte, DIAS - 1];

  const reales = prueba.map((f) => f.y);
  const predichos = prueba.map((f) => Math.max(0, predecir(modelo, f.x)));
  const global = metricas(reales, predichos);
  const base = lineaBase(skus, corte);

  // Por SKU (14 días de prueba cada uno)
  const porSku = [];
  for (const sku of skus) {
    const filasSku = prueba.filter((f) => f.skuId === sku.sku_id);
    const m = metricas(
      filasSku.map((f) => f.y),
      filasSku.map((f) => Math.max(0, predecir(modelo, f.x)))
    );
    porSku.push({
      sku_id: sku.sku_id,
      codigo: sku.codigo,
      talla: sku.talla,
      mae: Number(m.mae.toFixed(4)),
      rmse: Number(m.rmse.toFixed(4)),
      wape: Number(m.wape.toFixed(4)),
    });
  }

  return {
    ventana_dias: VENTANA_TEST,
    filas_entrenamiento: entrenamiento.length,
    filas_prueba: prueba.length,
    sku: skus.length,
    algoritmo: modelo.algoritmo,
    lambda: modelo.lambda,
    caracteristicas,
    coeficientes: modelo.coeficientes.map((c) => Number(c.toFixed(6))),
    intercepto: Number(modelo.intercepto.toFixed(6)),
    modelo: {
      mae: Number(global.mae.toFixed(4)),
      rmse: Number(global.rmse.toFixed(4)),
      wape: Number(global.wape.toFixed(4)),
    },
    linea_base: {
      algoritmo: `suavizado exponencial α=${ALFA_EMA}`,
      mae: Number(base.mae.toFixed(4)),
      rmse: Number(base.rmse.toFixed(4)),
      wape: Number(base.wape.toFixed(4)),
    },
    mejora_wape: Number(((base.wape - global.wape) / (base.wape || 1) * 100).toFixed(1)),
    modelo_gana: global.wape <= base.wape,
    por_sku: porSku,
  };
}
