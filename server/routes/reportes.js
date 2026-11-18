// ============================================================
// Play One - Reporte semanal (idea 5 de la matriz de priorización)
//
//   GET /api/reportes/semanal
//
// Devuelve los indicadores de la semana en curso (lunes → hoy) y
// de la semana anterior (lunes → domingo), con la variación y la
// tendencia de cada uno. Además:
//   · ventas por día de la semana (para la gráfica),
//   · las consultas que quedaron sin stock, agrupadas por producto,
//   · el próximo quiebre que predice el módulo ML.
//
// "Semana" = lunes 00:00 a domingo 23:59 (hora de Perú, que es la
// del servidor). Todo se calcula con timestamps explícitos, así la
// semana anterior está COMPLETA aunque el reporte se pida un lunes.
// ============================================================

import { Router } from 'express';
import pool from '../db/pool.js';
import { pronosticarStock } from '../ml/inferencia.js';

const router = Router();
const MS_DIA = 86400000;

/** Lunes 00:00 de la semana que contiene `fecha` */
function lunesDe(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = domingo
  const desdeLunes = dow === 0 ? 6 : dow - 1;
  return new Date(d.getTime() - desdeLunes * MS_DIA);
}

/** Etiqueta legible de la semana ISO (p. ej. "Semana 46 · 9-15 nov 2026") */
function etiquetaSemana(inicio) {
  const fin = new Date(inicio.getTime() + 6 * MS_DIA);
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
  const mismaSemana = inicio.getMonth() === fin.getMonth();
  const rango = mismaSemana
    ? `${inicio.getDate()}-${fin.getDate()} ${MES[fin.getMonth()]}`
    : `${inicio.getDate()} ${MES[inicio.getMonth()]} - ${fin.getDate()} ${MES[fin.getMonth()]}`;
  return { rango: `${rango} ${fin.getFullYear()}`, iso: semanaISO(inicio) };
}

/** Número de semana ISO-8601 */
function semanaISO(fecha) {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - inicioAno) / MS_DIA + 1) / 7);
}

/** Variación porcentual y tendencia respecto de la semana anterior */
function tendencia(actual, anterior) {
  if (anterior === null || anterior === undefined || anterior === 0) {
    return { variacion_pct: null, tendencia: anterior === 0 && actual > 0 ? 'nuevo' : 'sin_dato' };
  }
  const pct = ((actual - anterior) / anterior) * 100;
  const redondeado = Number(pct.toFixed(1));
  return {
    variacion_pct: redondeado,
    tendencia: redondeado > 0 ? 'sube' : redondeado < 0 ? 'baja' : 'igual',
  };
}

/** Pedidos pendientes (contactado/reservado) a una fecha dada */
async function pendientesEn(cliente, momento) {
  const { rows } = await cliente.query(
    `SELECT count(*)::int AS n
       FROM pedidos p
      WHERE p.creado_en < $1
        AND (SELECT e.estado
               FROM estados_pedido e
              WHERE e.pedido_id = p.id AND e.fecha <= $1
              ORDER BY e.fecha DESC, e.id DESC
              LIMIT 1) IN ('contactado', 'reservado')`,
    [momento]
  );
  return rows[0].n;
}

// GET /api/reportes/semanal
router.get('/semanal', async (req, res) => {
  try {
    const ahora = new Date();
    const lunesActual = lunesDe(ahora);
    const lunesAnterior = new Date(lunesActual.getTime() - 7 * MS_DIA);
    const finAnterior = new Date(lunesActual.getTime() - 1); // dom 23:59:59.999

    // --- Unidades vendidas (salidas de stock) por semana --------
    // El rango cubre las DOS semanas y el corte es lunesActual:
    // si el WHERE terminara en lunesActual, la semana actual
    // siempre daría 0.
    const hastaSemana = new Date(lunesActual.getTime() + 7 * MS_DIA);
    const unidades = await pool.query(
      `SELECT CASE WHEN fecha >= $1 THEN 'actual' ELSE 'anterior' END AS semana,
              count(*)::int AS movimientos,
              COALESCE(SUM(cantidad), 0)::int AS unidades
         FROM movimientos_stock
        WHERE tipo = 'salida'
          AND fecha >= $2 AND fecha < $3
        GROUP BY 1`,
      [lunesActual, lunesAnterior, hastaSemana]
    );
    const porSemana = Object.fromEntries(unidades.rows.map((r) => [r.semana, r]));

    // --- Pedidos e ingresos por semana --------------------------
    const pedidos = await pool.query(
      `SELECT CASE WHEN creado_en >= $1 THEN 'actual' ELSE 'anterior' END AS semana,
              count(*)::int AS pedidos,
              count(*) FILTER (WHERE estado = 'cancelado')::int AS cancelados,
              COALESCE(SUM(precio - descuento) FILTER (WHERE estado <> 'cancelado'), 0)::numeric
                AS ingresos
         FROM pedidos
        WHERE creado_en >= $2 AND creado_en < $3
        GROUP BY 1`,
      [lunesActual, lunesAnterior, hastaSemana]
    );
    const pedPorSemana = Object.fromEntries(pedidos.rows.map((r) => [r.semana, r]));

    // --- Consultas que quedaron sin stock -----------------------
    const consultas = await pool.query(
      `SELECT CASE WHEN fecha >= $1 THEN 'actual' ELSE 'anterior' END AS semana,
              count(*)::int AS n
         FROM consultas_sin_stock
        WHERE fecha >= $2 AND fecha < $3
        GROUP BY 1`,
      [lunesActual, lunesAnterior, hastaSemana]
    );
    const conPorSemana = Object.fromEntries(consultas.rows.map((r) => [r.semana, r]));

    // --- Pendientes del embudo (estado a hoy y al cierre de la
    //     semana anterior) ---------------------------------------
    const pendientesAhora = await pendientesEn(pool, ahora);
    const pendientesAntes = await pendientesEn(pool, lunesActual);

    // --- Próximo quiebre que predice el ML ----------------------
    let pronostico = null;
    try {
      pronostico = await pronosticarStock();
    } catch (err) {
      // el reporte no debe caerse si el ML falla: se informa aparte
      console.error('[reportes/pronostico]', err.message);
    }
    const proximo = pronostico?.resumen?.proximo_quiebre ?? null;
    const diasQuiebre = proximo?.dias_hasta_quiebre ?? null;

    // --- Indicadores con su semana anterior y tendencia ---------
    const val = (obj, clave) => Number(obj?.[clave] ?? 0);
    const bruto = [
      {
        clave: 'unidades_vendidas',
        nombre: 'Unidades vendidas',
        unidad: 'un',
        actual: val(porSemana.actual, 'unidades'),
        anterior: val(porSemana.anterior, 'unidades'),
      },
      {
        clave: 'ingresos',
        nombre: 'Ingresos por ventas',
        unidad: 'S/',
        actual: val(pedPorSemana.actual, 'ingresos'),
        anterior: val(pedPorSemana.anterior, 'ingresos'),
        decimales: 2,
      },
      {
        clave: 'pedidos',
        nombre: 'Pedidos registrados',
        unidad: 'ped.',
        actual: val(pedPorSemana.actual, 'pedidos'),
        anterior: val(pedPorSemana.anterior, 'pedidos'),
      },
      {
        clave: 'pedidos_pendientes',
        nombre: 'Pedidos pendientes',
        unidad: 'ped.',
        actual: pendientesAhora,
        anterior: pendientesAntes,
      },
      {
        clave: 'consultas_sin_stock',
        nombre: 'Consultas sin stock',
        unidad: 'int.',
        actual: val(conPorSemana.actual, 'n'),
        anterior: val(conPorSemana.anterior, 'n'),
      },
      {
        clave: 'dias_hasta_quiebre',
        nombre: 'Días hasta el próximo quiebre',
        unidad: 'días',
        actual: diasQuiebre,
        anterior: null, // el pronóstico de la semana pasada no se conserva
        decimales: 1,
      },
    ];

    const indicadores = bruto.map((i) => {
      const t = i.anterior === null
        ? { variacion_pct: null, tendencia: 'sin_dato' } // sin dato previo
        : tendencia(i.actual, i.anterior);
      return { ...i, ...t };
    });

    // --- Ventas por día de la semana (gráfica) ------------------
    const diario = await pool.query(
      `SELECT date_trunc('day', fecha)::date AS dia,
              count(*)::int AS unidades
         FROM movimientos_stock
        WHERE tipo = 'salida' AND fecha >= $1 AND fecha < $2
        GROUP BY 1 ORDER BY 1`,
      [lunesActual, new Date(lunesActual.getTime() + 7 * MS_DIA)]
    );
    const porDia = new Map(diario.rows.map((r) => [r.dia.toISOString().slice(0, 10), r.unidades]));
    const ventasDiarias = Array.from({ length: 7 }, (_, i) => {
      const dia = new Date(lunesActual.getTime() + i * MS_DIA);
      const clave = dia.toISOString().slice(0, 10);
      return {
        dia: clave,
        dia_semana: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'][i],
        unidades: porDia.get(clave) ?? 0,
        futuro: dia > ahora,
      };
    });

    // --- Consultas sin stock: los productos más pedidos ---------
    const topConsultas = await pool.query(
      `SELECT producto, motivo, count(*)::int AS intentos, max(fecha) AS ultimo
         FROM consultas_sin_stock
        WHERE fecha >= $1
        GROUP BY producto, motivo
        ORDER BY intentos DESC, ultimo DESC
        LIMIT 5`,
      [lunesActual]
    );

    // --- Tallas en riesgo (las 5 más urgentes del pronóstico) ---
    const enRiesgo = (pronostico?.pronostico ?? [])
      .filter((p) => p.nivel_riesgo === 'alto' || p.nivel_riesgo === 'medio')
      .slice(0, 5);

    const eActual = etiquetaSemana(lunesActual);
    const eAnterior = etiquetaSemana(lunesAnterior);

    res.json({
      generado_en: ahora.toISOString(),
      semana: {
        numero: eActual.iso,
        rango: eActual.rango,
        desde: lunesActual.toISOString(),
        hasta: ahora.toISOString(),
      },
      semana_anterior: {
        numero: eAnterior.iso,
        rango: eAnterior.rango,
        desde: lunesAnterior.toISOString(),
        hasta: finAnterior.toISOString(),
      },
      indicadores,
      ventas_diarias: ventasDiarias,
      consultas_sin_stock: topConsultas.rows.map((r) => ({
        producto: r.producto,
        motivo: r.motivo,
        intentos: r.intentos,
        ultimo: r.ultimo,
      })),
      tallas_en_riesgo: enRiesgo,
      pronostico: pronostico
        ? {
            origen: pronostico.origen,
            generado_en: pronostico.generado_en,
            resumen: pronostico.resumen,
          }
        : null,
      // el modelo NO se pudo calcular: se avisa sin tumbar el reporte
      ...(pronostico ? {} : { error_pronostico: 'Pronóstico no disponible' }),
    });
  } catch (err) {
    console.error('[reportes/semanal]', err.message);
    res.status(500).json({ error: 'No se pudo generar el reporte semanal' });
  }
});

export default router;
