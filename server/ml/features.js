// ============================================================
// Play One - Características del modelo de pronóstico
//
// Mismas fórmulas que ml/entrenar.py: cualquier cambio hay que
// hacerlo en los DOS lados (el test de paridad lo verifica).
//
// Para predecir el día t sólo se usa información hasta t−1:
//   · media7    media de ventas de los últimos 7 días
//   · media28   media de ventas de los últimos 28 días
//   · pendiente pendiente de la recta de los últimos 28 días
//               (mínimos cuadrados; unidades: ventas/día)
//   · finde     1 si el día t es viernes, sábado o domingo
//               (los lives de TikTok concentran la demanda)
//
// media28 es la que absorbe el "nivel" de cada talla, por eso el
// modelo puede entrenarse con todas las tallas juntas (pooled).
// ============================================================

import { predecir } from './modelo.js';

export const CARACTERISTICAS = ['media7', 'media28', 'pendiente', 'finde'];

/** Media de los últimos n valores del historial (si hay menos, usa los que hay) */
export function mediaVentana(historial, n) {
  const inicio = Math.max(0, historial.length - n);
  let suma = 0;
  let cuenta = 0;
  for (let i = inicio; i < historial.length; i += 1) {
    suma += historial[i];
    cuenta += 1;
  }
  return cuenta ? suma / cuenta : 0;
}

/**
 * Pendiente de la recta de mínimos cuadrados sobre los últimos n
 * valores (x = 0..n−1 creciendo hacia el día más reciente).
 */
export function pendienteVentana(historial, n) {
  const inicio = Math.max(0, historial.length - n);
  const valores = historial.slice(inicio);
  const m = valores.length;
  if (m < 2) return 0;

  const xMedio = (m - 1) / 2;
  let yMedio = 0;
  for (const v of valores) yMedio += v;
  yMedio /= m;

  let numerador = 0;
  for (let i = 0; i < m; i += 1) numerador += (i - xMedio) * (valores[i] - yMedio);

  // Σ(x − x̄)² para x = 0..m−1  =  m(m²−1)/12
  const denominador = (m * (m * m - 1)) / 12;
  return denominador ? numerador / denominador : 0;
}

/** ¿Es el día t fin de semana? (5 = viernes, 6 = sábado, 0 = domingo) */
export function esFinde(fecha) {
  const dow = fecha.getDay();
  return dow === 5 || dow === 6 || dow === 0 ? 1 : 0;
}

/**
 * Vector de características para predecir el día `fecha`, usando el
 * historial de ventas que termina en AYER (el último elemento es
 * t−1). Este es el contrato que comparten el dataset, la
 * inferencia en Python y la de Node.
 */
export function caracteristicas(historial, fecha) {
  return [
    mediaVentana(historial, 7),
    mediaVentana(historial, 28),
    pendienteVentana(historial, 28),
    esFinde(fecha),
  ];
}

/**
 * Pronóstico recursivo de los próximos `dias` días: cada predicción
 * se agrega al historial y alimenta las ventanas del día siguiente
 * (los fines de semana se predicen con su propio dummy).
 * Devuelve la demanda predicha por día.
 */
export function pronosticar(historial, modelo, fechas) {
  const cola = [...historial];
  const predicciones = [];
  for (const fecha of fechas) {
    const y = predecir(modelo, caracteristicas(cola, fecha));
    const redondeado = Math.max(0, y);
    predicciones.push(redondeado);
    cola.push(redondeado);
  }
  return predicciones;
}
