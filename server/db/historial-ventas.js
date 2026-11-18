// ============================================================
// Play One - Histórico de ventas (dataset para el módulo de ML)
//
// El negocio NO tiene exportable su histórico de ventas: la plantilla
// sólo trae el stock actual. Sin embargo, para entrenar y evaluar el
// modelo de pronóstico hace falta una serie temporal. Por eso este
// archivo GENERA un histórico SIMULADO de los últimos 6 meses de
// forma determinista (misma semilla → mismo dataset) y lo declara
// abiertamente en ml/README.md y en el informe.
//
// Reglas del dataset:
//   · 180 días de demanda por cada SKU disponible, con estacionalidad
//     (los lives de TikTok caen viernes/sábado/domingo → ×2.5),
//     tendencia (+6% en el período) y ruido de Poisson.
//   · Politica de reposición: cuando el saldo baja de 2 unidades y
//     todavía quedan ventas por surtir, se compra un lote de 8.
//   · Los pedidos del seed generan su salida (igual que hace la API
//     al crear un pedido) y los cancelados devuelven la unidad.
//
// INVARIANTE (se verifica al final y hace fallar el setup si no se
// cumple): para cada SKU disponible
//
//     Σ(entradas) − Σ(salidas) = stock_actual
//
// Es decir, el log de movimientos cuadra EXACTAMENTE con el stock
// real de la plantilla Excel. Si no cuadra, el dataset no sirve.
// ============================================================

import { pathToFileURL } from 'node:url';
import pool from './pool.js';

export const DIAS = 180; // 6 meses de histórico
export const LOTE = 8; // unidades por reposición
export const UMBRAL_DEMANDA = 4; // demanda futura mínima para justificar una compra
const MS_DIA = 86400000;
const HORA_INICIAL = 8; // el inventario inicial se carga a las 8:00
const MOTIVO_INICIAL = 'Inventario inicial (plantilla Excel)';
const MOTIVO_REPOSICION = 'Reposición de stock';
const MOTIVO_VENTA = 'Venta';
const MOTIVO_VENTA_HISTORICA = 'Venta (histórico simulado)';
const MAX_INTENTOS = 6;

// ------------------------------------------------------------
// PRNG determinista (mulberry32): misma semilla → misma serie
// ------------------------------------------------------------
export function mulberry32(semilla) {
  let a = semilla | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Poisson por el método de Knuth (con λ chico converge en pocos pasos)
function poisson(lambda, rnd) {
  const limite = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rnd();
  } while (p > limite);
  return k - 1;
}

// ------------------------------------------------------------
// Serie diaria de ventas de un SKU (enteros, siempre ≥ 0)
// ------------------------------------------------------------
export function serieDiaria({ semilla, objetivo, inicio }) {
  const rnd = mulberry32(semilla);

  // Pesos por día: estacionalidad de los lives + tendencia
  const pesos = [];
  for (let d = 0; d < DIAS; d += 1) {
    const dow = new Date(inicio + d * MS_DIA).getDay();
    const finde = dow === 5 || dow === 6 || dow === 0; // vie, sáb y dom
    const estacional = finde ? 2.5 : 1;
    const tendencia = 1 + 0.06 * (d / (DIAS - 1)); // +6% en el período
    pesos.push(estacional * tendencia);
  }
  const media = pesos.reduce((s, p) => s + p, 0) / DIAS;

  const serie = [];
  for (let d = 0; d < DIAS; d += 1) {
    const lambda = (objetivo / DIAS) * (pesos[d] / media);
    serie.push(poisson(lambda, rnd));
  }
  return serie;
}

// Convierte la serie en eventos de salida (una fila por unidad vendida),
// con hora aleatoria dentro del día (los lives venden de noche).
function eventosDeVentas(serie, inicio, semilla) {
  const rnd = mulberry32(semilla);
  const eventos = [];
  for (let d = 0; d < DIAS; d += 1) {
    for (let u = 0; u < serie[d]; u += 1) {
      const hora = 10 + Math.floor(rnd() * 12); // 10:00 - 21:00
      const minuto = Math.floor(rnd() * 60);
      eventos.push({
        fecha: inicio + d * MS_DIA + hora * 3600000 + minuto * 60000,
        tipo: 'salida',
        cantidad: 1,
        motivo: MOTIVO_VENTA_HISTORICA,
        simulado: true,
      });
    }
  }
  return eventos;
}

// Ordena los eventos por fecha; a igual fecha, las entradas (devoluciones
// y compras) van antes que las salidas.
export function ordenarEventos(eventos) {
  eventos.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha - b.fecha;
    if (a.tipo === b.tipo) return 0;
    return a.tipo === 'entrada' ? -1 : 1;
  });
  return eventos;
}

// Garantiza que la última devolución (cancelación) tenga ventas
// posteriores: si la devolución quedara al final del histórico, el
// saldo pasaría por negativo antes de que vuelva la unidad.
function asegurarVentasPosteriores(eventos) {
  let ultimaEntrada = -1;
  for (let i = eventos.length - 1; i >= 0; i -= 1) {
    if (eventos[i].tipo === 'entrada') {
      ultimaEntrada = i;
      break;
    }
  }
  if (ultimaEntrada < 0) return;

  const necesarias = eventos
    .slice(ultimaEntrada)
    .filter((e) => e.tipo === 'entrada')
    .reduce((s, e) => s + e.cantidad, 0);

  let posteriores = eventos
    .slice(ultimaEntrada + 1)
    .filter((e) => e.tipo === 'salida')
    .reduce((s, e) => s + e.cantidad, 0);

  // Fecha objetivo: poco después de la devolución, nunca en el futuro
  const devolucion = eventos[ultimaEntrada].fecha;
  const limite = Date.now() - 60000;
  const base = Math.max(devolucion + 1, Math.min(devolucion + 2 * 3600000, limite));

  let desplazadas = 0;
  while (posteriores < necesarias) {
    const fecha = base + desplazadas; // ms distintos: sin empates
    let usada = false;
    // sólo ventas de ANTES de la devolución (las de después ya cuentan)
    for (let i = eventos.length - 1; i >= 0 && !usada; i -= 1) {
      if (eventos[i].simulado && eventos[i].fecha < devolucion) {
        eventos[i].fecha = fecha;
        usada = true;
      }
    }
    if (!usada) {
      eventos.push({
        fecha,
        tipo: 'salida',
        cantidad: 1,
        motivo: MOTIVO_VENTA_HISTORICA,
        simulado: true,
      });
    }
    posteriores += 1;
    desplazadas += 1;
  }
}

// ------------------------------------------------------------
// Simula la politica de reposición sobre una lista de eventos
// ya ordenados por fecha. Devuelve las compras que disparó, el
// saldo final y el saldo mínimo alcanzado (nunca debe ser < 0).
// ------------------------------------------------------------
export function simular({ inicial, eventos }) {
  // Demanda futura (incluida la venta en curso) en cada posición
  const futuras = new Array(eventos.length);
  let acumulado = 0;
  for (let i = eventos.length - 1; i >= 0; i -= 1) {
    if (eventos[i].tipo === 'salida') acumulado += eventos[i].cantidad;
    futuras[i] = acumulado;
  }

  let saldo = inicial;
  let minimo = inicial;
  const compras = [];

  for (let i = 0; i < eventos.length; i += 1) {
    const e = eventos[i];
    if (e.tipo === 'entrada') {
      saldo += e.cantidad; // devolución de cancelación
    } else {
      // ¿Conviene reponer? sólo si el saldo está bajo Y quedan
      // ventas por surtir (si no, sería comprar para nadie).
      while (saldo <= 2 && futuras[i] >= UMBRAL_DEMANDA) {
        saldo += LOTE;
        compras.push({
          // llega un minuto antes de la venta que agota el stock
          fecha: e.fecha - 60000,
          tipo: 'entrada',
          cantidad: LOTE,
          motivo: MOTIVO_REPOSICION,
          simulado: true,
        });
      }
      saldo -= e.cantidad;
    }
    if (saldo < minimo) minimo = saldo;
  }

  return { compras, saldoFinal: saldo, saldoMinimo: minimo };
}

// ------------------------------------------------------------
// Elige el inventario inicial del SKU de modo que el log cuadre:
//
//     inicial + reposiciones + devoluciones − ventas = stock_actual
//
// Se recorre n = nº de lotes comprados de mayor a menor (historia
// más rica primero) hasta encontrar un n que la simulación confirme.
// ------------------------------------------------------------
export function resolverSKU({ stock, eventos }) {
  const ventas = eventos
    .filter((e) => e.tipo === 'salida')
    .reduce((s, e) => s + e.cantidad, 0);
  const devoluciones = eventos
    .filter((e) => e.tipo === 'entrada')
    .reduce((s, e) => s + e.cantidad, 0);

  // Presupuesto total de unidades que pueden entrar al período
  const presupuesto = stock + ventas - devoluciones;
  if (presupuesto < 0) {
    throw new Error(
      `Presupuesto negativo (${presupuesto}): el log no podría cuadrar con el stock ${stock}`
    );
  }
  if (presupuesto === 0) {
    // Sin margen para inventario inicial: sólo cuadran los movimientos
    // que fija el seed de pedidos (devolución − venta = stock = 0).
    const prueba = simular({ inicial: 0, eventos });
    if (prueba.saldoMinimo < 0) return null;
    return { inicial: 0, compras: [] };
  }

  const nMax = Math.floor((presupuesto - 1) / LOTE);
  for (let n = nMax; n >= 0; n -= 1) {
    const inicial = presupuesto - n * LOTE;
    if (inicial < 1) continue;
    const r = simular({ inicial, eventos });
    if (r.compras.length === n && r.saldoMinimo >= 0) {
      return { inicial, compras: r.compras, saldoMinimo: r.saldoMinimo };
    }
  }
  return null; // ningún n cuadra: el llamador reintenta con más demanda
}

// ------------------------------------------------------------
// Genera e inserta todo el histórico y verifica el invariante.
// ------------------------------------------------------------
export async function generarHistorial({ cliente = pool, verbose = true } = {}) {
  const previos = await cliente.query('SELECT count(*)::int AS n FROM movimientos_stock');
  if (previos.rows[0].n > 0) {
    throw new Error(
      `Ya hay ${previos.rows[0].n} movimientos en la base. ` +
        'Ejecuta npm run db:setup (limpia todo) antes de regenerar el histórico.'
    );
  }

  const { rows: skus } = await cliente.query(`
    SELECT s.id AS sku_id, s.stock_actual, m.codigo,
           CASE WHEN t.peg = trunc(t.peg) THEN trunc(t.peg)::text ELSE t.peg::text END AS talla
      FROM skus s
      JOIN modelos m ON m.id = s.modelo_id
      JOIN tallas  t ON t.id = s.talla_id
     WHERE s.disponible
     ORDER BY s.id
  `);

  // Movimientos que fija el seed de pedidos: la salida al crear el
  // pedido (igual que hace POST /api/pedidos) y, si se canceló, la
  // devolución de la unidad.
  const { rows: pedidos } = await cliente.query(
    'SELECT id, sku_id, estado, creado_en FROM pedidos ORDER BY id'
  );

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const inicio = hoy.getTime() - DIAS * MS_DIA; // medianoche hace 180 días

  const eventos = new Map(skus.map((s) => [s.sku_id, []]));
  for (const p of pedidos) {
    const lista = eventos.get(p.sku_id);
    if (!lista) continue; // pedido sobre una talla no disponible
    const fecha = p.creado_en.getTime();
    lista.push({
      fecha,
      tipo: 'salida',
      cantidad: 1,
      motivo: MOTIVO_VENTA,
      pedidoId: p.id,
    });
    if (p.estado === 'cancelado') {
      lista.push({
        fecha: fecha + MS_DIA,
        tipo: 'entrada',
        cantidad: 1,
        motivo: `Cancelación del pedido #${p.id}`,
        pedidoId: p.id,
      });
    }
  }

  const movimientos = [];
  const detalle = [];
  let sinHistorico = 0;

  for (const sku of skus) {
    const fijos = eventos.get(sku.sku_id) || [];
    const semilla = sku.sku_id * 9973 + 17;
    const objetivoBase = 5 + Math.floor(mulberry32(semilla + 1)() * 61); // 5..65

    let solucion = null;
    let todos = [];

    for (let intento = 0; intento < MAX_INTENTOS && !solucion; intento += 1) {
      const objetivo = objetivoBase + intento * LOTE;
      const serie = serieDiaria({ semilla, objetivo, inicio });
      todos = [...fijos, ...eventosDeVentas(serie, inicio, semilla + 7777)];
      ordenarEventos(todos);
      asegurarVentasPosteriores(todos);
      ordenarEventos(todos); // el guardia puede insertar una venta
      solucion = resolverSKU({ stock: sku.stock_actual, eventos: todos });
    }

    if (!solucion) {
      throw new Error(
        `No se pudo cuadrar el histórico del SKU ${sku.codigo} · ${sku.talla} ` +
          `(stock ${sku.stock_actual}). Revisa la politica de reposición.`
      );
    }

    if (solucion.inicial > 0) {
      movimientos.push({
        skuId: sku.sku_id,
        tipo: 'entrada',
        cantidad: solucion.inicial,
        fecha: inicio + HORA_INICIAL * 3600000,
        motivo: MOTIVO_INICIAL,
        pedidoId: null,
      });
    }
    for (const c of solucion.compras) {
      movimientos.push({
        skuId: sku.sku_id,
        tipo: 'entrada',
        cantidad: c.cantidad,
        fecha: c.fecha,
        motivo: c.motivo,
        pedidoId: null,
      });
    }
    // Ventas del período: las simuladas + las de los pedidos del seed
    for (const e of todos) {
      movimientos.push({
        skuId: sku.sku_id,
        tipo: e.tipo,
        cantidad: e.cantidad,
        fecha: e.fecha,
        motivo: e.motivo,
        pedidoId: e.pedidoId ?? null,
      });
    }

    const ventas = todos.filter((e) => e.tipo === 'salida').length;
    if (solucion.inicial === 0 && solucion.compras.length === 0) sinHistorico += 1;
    detalle.push({
      sku: `${sku.codigo} · ${sku.talla}`,
      stock: sku.stock_actual,
      inicial: solucion.inicial,
      compras: solucion.compras.length,
      ventas,
      saldoMinimo: solucion.saldoMinimo ?? 0,
    });
  }

  // --- Inserta en una sola sentencia -------------------------
  movimientos.sort((a, b) => a.fecha - b.fecha);
  const cols = {
    sku: movimientos.map((m) => m.skuId),
    tipo: movimientos.map((m) => m.tipo),
    cantidad: movimientos.map((m) => m.cantidad),
    fecha: movimientos.map((m) => new Date(m.fecha)),
    motivo: movimientos.map((m) => m.motivo),
    pedido: movimientos.map((m) => m.pedidoId),
  };

  await cliente.query(
    `INSERT INTO movimientos_stock (sku_id, tipo, cantidad, fecha, motivo, pedido_id)
     SELECT * FROM unnest($1::integer[], $2::text[], $3::integer[],
                          $4::timestamptz[], $5::text[], $6::integer[])`,
    [cols.sku, cols.tipo, cols.cantidad, cols.fecha, cols.motivo, cols.pedido]
  );

  // --- Invariante: el log debe cuadrar con el stock real -----
  const { rows: descuadres } = await cliente.query(`
    SELECT m.codigo,
           t.peg,
           s.stock_actual,
           COALESCE(SUM(v.cantidad) FILTER (WHERE v.tipo = 'entrada'), 0) AS entradas,
           COALESCE(SUM(v.cantidad) FILTER (WHERE v.tipo = 'salida'), 0)  AS salidas
      FROM skus s
      JOIN modelos m ON m.id = s.modelo_id
      JOIN tallas  t ON t.id = s.talla_id
      LEFT JOIN movimientos_stock v ON v.sku_id = s.id
     WHERE s.disponible
     GROUP BY s.id, m.codigo, t.peg, s.stock_actual
    HAVING COALESCE(SUM(v.cantidad) FILTER (WHERE v.tipo = 'entrada'), 0)
         - COALESCE(SUM(v.cantidad) FILTER (WHERE v.tipo = 'salida'), 0)
       <> s.stock_actual
     ORDER BY m.codigo, t.peg
  `);

  if (descuadres.length) {
    throw new Error(
      `El histórico no cuadra con el stock real en ${descuadres.length} SKU: ` +
        descuadres
          .map((d) => `${d.codigo}/${d.peg} (stock ${d.stock_actual}, log ${d.entradas - d.salidas})`)
          .join(', ')
    );
  }

  const resumen = {
    skus: skus.length,
    movimientos: movimientos.length,
    entradas: movimientos.filter((m) => m.tipo === 'entrada').length,
    salidas: movimientos.filter((m) => m.tipo === 'salida').length,
    compras: movimientos.filter((m) => m.motivo === MOTIVO_REPOSICION).length,
    pedidos: pedidos.length,
    sinHistorico,
    descuadres: 0,
    ventaMinima: Math.min(...detalle.map((d) => d.saldoMinimo)),
  };

  if (verbose) {
    console.log(
      `Histórico de ${DIAS} días: ${resumen.movimientos} movimientos ` +
        `(${resumen.entradas} entradas / ${resumen.salidas} salidas), ` +
        `${resumen.compras} reposiciones, invariante en 0 SKU con desviación`
    );
  }

  return { resumen, detalle };
}

// Uso directo: node db/historial-ventas.js
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    await generarHistorial();
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
