// ============================================================
// Play One — Dataset del modelo (desde la base de datos)
//
// Arma la serie diaria de ventas por SKU (ventana DIAS días) y la
// tabla de entrenamiento: una fila por (talla, día) con sus
// características y la demanda real de ese día.
//
// Todo el historial de movimientos está en movimientos_stock:
//   · tipo 'salida'  → ventas (las del seed de pedidos y las
//                      simuladas por historial-ventas.js)
//   · tipo 'entrada' → inventario inicial, reposiciones y
//                      devoluciones por cancelación
//
// El particionado temporal (entrenar con el pasado, evaluar con el
// último mes) lo hace evaluacion.js: aquí sólo se arma la tabla.
// ============================================================

import pool from '../db/pool.js';
import { CARACTERISTICAS, caracteristicas } from './features.js';

export const DIAS = 180; // ventana del histórico (6 meses)
export const MIN_DIAS = 28; // días mínimos antes del día a predecir
export const MS_DIA = 86400000;

/** Medianoche local del primer día de la ventana (hace DIAS días) */
export function inicioPeriodo() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy.getTime() - DIAS * MS_DIA;
}

/** Índice de día (0..DIAS−1) de un timestamp; −1 si está fuera de la ventana */
export function diaDe(fecha, inicio) {
  const d = Math.floor((fecha - inicio) / MS_DIA);
  return d >= 0 && d < DIAS ? d : -1;
}

/**
 * Serie diaria de ventas por SKU. Devuelve un Map
 * skuId → array de DIAS enteros (unidades vendidas por día).
 */
export async function ventasDiarias(cliente = pool, inicio = inicioPeriodo()) {
  const { rows } = await cliente.query(
    `SELECT sku_id, fecha, cantidad
       FROM movimientos_stock
      WHERE tipo = 'salida' AND fecha >= $1`,
    [new Date(inicio)]
  );

  const series = new Map();
  for (const r of rows) {
    const dia = diaDe(r.fecha.getTime(), inicio);
    if (dia < 0) continue;
    if (!series.has(r.sku_id)) series.set(r.sku_id, new Array(DIAS).fill(0));
    series.get(r.sku_id)[dia] += Number(r.cantidad);
  }
  return series;
}

/**
 * Dataset completo: metadatos de cada SKU disponible, su serie
 * diaria y las filas de entrenamiento (talla × día).
 */
export async function construirDataset(cliente = pool) {
  const inicio = inicioPeriodo();

  const { rows: skus } = await cliente.query(`
    SELECT s.id AS sku_id, s.stock_actual, s.stock_minimo, s.disponible,
           m.codigo, m.precio_base,
           CASE WHEN t.peg = trunc(t.peg) THEN trunc(t.peg)::text ELSE t.peg::text END AS talla
      FROM skus s
      JOIN modelos m ON m.id = s.modelo_id
      JOIN tallas  t ON t.id = s.talla_id
     WHERE s.disponible
     ORDER BY m.codigo, t.orden
  `);

  const series = await ventasDiarias(cliente, inicio);
  const filas = [];

  for (const sku of skus) {
    const diario = series.get(sku.sku_id) || new Array(DIAS).fill(0);
    sku.diario = diario;

    for (let dia = MIN_DIAS; dia < DIAS; dia += 1) {
      const historial = diario.slice(0, dia); // sólo hasta t−1
      const fecha = new Date(inicio + dia * MS_DIA);
      filas.push({
        skuId: sku.sku_id,
        dia,
        x: caracteristicas(historial, fecha),
        y: diario[dia],
      });
    }
  }

  return { inicio, skus, filas, caracteristicas: CARACTERISTICAS };
}

/**
 * Formato para ml/entrenar.py: una matriz X (con las columnas en
 * el orden de CARACTERISTICAS), el vector y, el día de cada fila
 * (para el corte temporal del backtest) y la serie diaria por SKU
 * (para que Python calcule la línea base igual que Node).
 */
export function comoJsonEntrenamiento(filas, skus = []) {
  return {
    caracteristicas: CARACTERISTICAS,
    X: filas.map((f) => f.x),
    y: filas.map((f) => f.y),
    dias_fila: filas.map((f) => f.dia),
    series: Object.fromEntries(skus.map((s) => [String(s.sku_id), s.diario])),
  };
}
