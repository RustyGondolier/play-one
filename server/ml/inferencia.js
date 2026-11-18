// ============================================================
// Play One - Inferencia: pronóstico de quiebre de stock
//
// Camino principal (MLOps estándar "entrenamiento offline →
// inferencia online"):
//   1. ml/entrenar.py entrena con scikit-learn (en Colab o local)
//      y exporta ml/modelo.json con los coeficientes y las
//      métricas del backtesting.
//   2. Este módulo sólo APLICA ese artefacto: ~1 ms por request,
//      sin consumir CPU de entrenamiento en el servidor.
//
// Si el artefacto no existe (alguien clonó el repo sin él), el
// servidor no se queda mudo: reentrena un OLS/Ridge en Node puro
// con los mismos coeficientes y sigue respondiendo. Ese respaldo
// está marcado como "fallback-node" en la respuesta.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ajustar, predecir } from './modelo.js';
import { construirDataset, DIAS } from './dataset.js';
import { pronosticar } from './features.js';
import { LAMBDA } from './evaluacion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RUTA_ARTEFACTO = path.join(__dirname, '..', '..', 'ml', 'modelo.json');
export const HORIZONTE = 7; // días que se proyectan

/** Carga el artefacto de Python; si falta, devuelve null */
export function leerArtefacto(ruta = RUTA_ARTEFACTO) {
  if (!fs.existsSync(ruta)) return null;
  try {
    const crudo = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    // validación mínima: que el artefacto sea aplicable
    if (!Array.isArray(crudo.coeficientes) || !crudo.scaler) return null;
    if (crudo.scaler.media.length !== crudo.coeficientes.length) return null;
    return crudo;
  } catch {
    return null;
  }
}

/**
 * Devuelve el modelo a usar: el artefacto de Python si existe,
 * o un Ridge reentrenado en Node (respaldo). En ambos casos el
 * artefacto tiene la misma forma: { scaler, coeficientes, intercepto }.
 */
export async function cargarModelo({ cliente, dataset } = {}) {
  const artefacto = leerArtefacto();
  if (artefacto) {
    return {
      modelo: artefacto,
      origen: 'artefacto',
      detalle: {
        archivo: path.basename(RUTA_ARTEFACTO),
        entrenado_en: artefacto.entrenado_en ?? null,
        libreria: artefacto.libreria ?? null,
        filas: artefacto.filas ?? null,
        metricas: artefacto.metricas ?? null,
      },
    };
  }

  // Responder sin artefacto: se reentrena en Node con los mismos datos
  const { filas, caracteristicas } = dataset ?? (await construirDataset(cliente));
  const modelo = ajustar(
    filas.map((f) => f.x),
    filas.map((f) => f.y),
    { lambda: LAMBDA }
  );
  modelo.caracteristicas = caracteristicas;
  modelo.entrenado_en = new Date().toISOString();

  return {
    modelo,
    origen: 'fallback-node',
    detalle: {
      archivo: null,
      entrenado_en: modelo.entrenado_en,
      libreria: 'Node puro (OLS/Ridge sin dependencias)',
      filas: filas.length,
      metricas: null,
    },
  };
}

/**
 * Pronóstico por talla disponible: demanda esperada por día,
 * días hasta agotarse, sugerencia de reposición y nivel de riesgo.
 */
export async function pronosticarStock({ cliente } = {}) {
  const dataset = await construirDataset(cliente);
  const { skus, inicio } = dataset;
  const { modelo, origen, detalle } = await cargarModelo({ cliente, dataset });

  // Fechas del horizonte: de hoy a hoy + 6 días
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  const fechas = Array.from({ length: HORIZONTE }, (_, i) => new Date(hoy.getTime() + i * 86400000));

  const pronostico = [];
  for (const sku of skus) {
    const historial = sku.diario;
    const predicciones = pronosticar(historial, modelo, fechas).map((v) =>
      Number(v.toFixed(3))
    );
    const demanda = predicciones.reduce((s, v) => s + v, 0) / predicciones.length;
    const ventasVentana = historial.reduce((s, v) => s + v, 0);

    const stock = Number(sku.stock_actual);
    const stockMin = Number(sku.stock_minimo);
    const dias = demanda > 0.001 ? stock / demanda : null;
    const sugerencia = Math.max(0, Math.ceil(demanda * 7 + stockMin - stock));

    let riesgo = 'bajo';
    if (dias === null) riesgo = 'sin_datos';
    else if (dias <= 7) riesgo = 'alto';
    else if (dias <= 14) riesgo = 'medio';

    let confianza = 'baja';
    if (ventasVentana >= 30) confianza = 'alta';
    else if (ventasVentana >= 10) confianza = 'media';

    pronostico.push({
      sku_id: sku.sku_id,
      codigo: sku.codigo,
      talla: sku.talla,
      stock,
      stock_minimo: stockMin,
      precio: Number(sku.precio_base),
      ventas_ventana: ventasVentana,
      demanda_diaria: Number(demanda.toFixed(4)),
      dias_hasta_quiebre: dias === null ? null : Number(dias.toFixed(1)),
      sugerencia_reposicion: sugerencia,
      valor_reposicion: Number((sugerencia * Number(sku.precio_base)).toFixed(2)),
      nivel_riesgo: riesgo,
      confianza,
      prediccion_7d: predicciones,
    });
  }

  // Lo más urgente primero
  pronostico.sort((a, b) => {
    const da = a.dias_hasta_quiebre ?? 9999;
    const db = b.dias_hasta_quiebre ?? 9999;
    return da - db || a.codigo.localeCompare(b.codigo);
  });

  const alto = pronostico.filter((p) => p.nivel_riesgo === 'alto');
  const medio = pronostico.filter((p) => p.nivel_riesgo === 'medio');

  return {
    generado_en: new Date().toISOString(),
    origen,
    detalle,
    algoritmo: modelo.algoritmo,
    lambda: modelo.lambda,
    caracteristicas: modelo.caracteristicas ?? null,
    ventana_dias: DIAS,
    inicio_ventana: new Date(inicio).toISOString(),
    horizonte_dias: HORIZONTE,
    resumen: {
      tallas: pronostico.length,
      en_riesgo_alto: alto.length,
      en_riesgo_medio: medio.length,
      unidades_sugeridas: pronostico.reduce((s, p) => s + p.sugerencia_reposicion, 0),
      valor_reposicion: Number(
        pronostico.reduce((s, p) => s + p.valor_reposicion, 0).toFixed(2)
      ),
      proximo_quiebre: pronostico.find((p) => p.dias_hasta_quiebre !== null) ?? null,
    },
    pronostico,
  };
}
