// Pruebas del generador de histórico (sin base de datos):
//   node --test db/historial-ventas.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

// El módulo crea el pool al importarse: se le pasa una URL ficticia
// para que no avise (estas pruebas nunca tocan la base).
process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/playone_test';
const {
  DIAS,
  LOTE,
  mulberry32,
  serieDiaria,
  ordenarEventos,
  simular,
  resolverSKU,
} = await import('./historial-ventas.js');

const INICIO = Date.UTC(2026, 4, 1); // 1 de mayo (sábado)
const MS_DIA = 86400000;

// Construye eventos de salida, uno por unidad, repartidos en n días
function ventasSimuladas(cantidad, { desde = 0, paso = 3 } = {}) {
  const eventos = [];
  for (let i = 0; i < cantidad; i += 1) {
    eventos.push({
      fecha: INICIO + (desde + i * paso) * MS_DIA,
      tipo: 'salida',
      cantidad: 1,
      motivo: 'Venta (histórico simulado)',
      simulado: true,
    });
  }
  return eventos;
}

test('mulberry32 es determinista y devuelve valores en [0, 1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const c = mulberry32(43);
  const serieA = Array.from({ length: 200 }, () => a());
  const serieB = Array.from({ length: 200 }, () => b());
  const serieC = Array.from({ length: 200 }, () => c());

  assert.deepEqual(serieA, serieB, 'misma semilla ⇒ misma serie');
  assert.notDeepEqual(serieA, serieC, 'semilla distinta ⇒ serie distinta');
  for (const v of serieA) assert.ok(v >= 0 && v < 1, `fuera de rango: ${v}`);
});

test('serieDiaria dura DIAS días, no tiene negativos y respeta el objetivo', () => {
  const objetivo = 40;
  const serie = serieDiaria({ semilla: 1234, objetivo, inicio: INICIO });

  assert.equal(serie.length, DIAS);
  for (const v of serie) assert.ok(Number.isInteger(v) && v >= 0);

  const total = serie.reduce((s, v) => s + v, 0);
  // Poisson: el total se acerca al objetivo (±25% es holgado)
  assert.ok(
    Math.abs(total - objetivo) <= objetivo * 0.25,
    `total ${total} demasiado lejos de ${objetivo}`
  );
});

test('serieDiaria es determinista (misma semilla ⇒ mismos datos)', () => {
  const uno = serieDiaria({ semilla: 77, objetivo: 30, inicio: INICIO });
  const dos = serieDiaria({ semilla: 77, objetivo: 30, inicio: INICIO });
  const otro = serieDiaria({ semilla: 78, objetivo: 30, inicio: INICIO });

  assert.deepEqual(uno, dos);
  assert.notDeepEqual(uno, otro);
});

test('la estacionalidad concentra la demanda en viernes, sábado y domingo', () => {
  const serie = serieDiaria({ semilla: 99, objetivo: 120, inicio: INICIO });
  let finde = 0;
  let entreSemana = 0;
  let diasFinde = 0;
  let diasEntreSemana = 0;

  for (let d = 0; d < DIAS; d += 1) {
    const dow = new Date(INICIO + d * MS_DIA).getDay();
    if (dow === 5 || dow === 6 || dow === 0) {
      finde += serie[d];
      diasFinde += 1;
    } else {
      entreSemana += serie[d];
      diasEntreSemana += 1;
    }
  }

  const porDiaFinde = finde / diasFinde;
  const porDiaEntreSemana = entreSemana / diasEntreSemana;
  assert.ok(
    porDiaFinde > porDiaEntreSemana * 1.5,
    `los fines de semana venden más (${porDiaFinde.toFixed(2)} vs ${porDiaEntreSemana.toFixed(2)})`
  );
});

test('simular repone cuando el saldo baja y sólo si queda demanda', () => {
  // 24 ventas seguidas con inventario inicial 3 → debe haber compras
  const eventos = ventasSimuladas(24, { paso: 1 });
  ordenarEventos(eventos);
  const r = simular({ inicial: 3, eventos });

  assert.ok(r.compras.length > 0, 'con 24 ventas y saldo 3 tiene que reponer');
  assert.equal(r.saldoFinal, 3 + r.compras.length * LOTE - 24);
  assert.ok(r.saldoMinimo >= 0, `saldo mínimo ${r.saldoMinimo} no puede ser negativo`);
});

test('simular no compra al final del período (no hay a quién venderle)', () => {
  // 3 ventas con inventario 3: nunca baja de 2 hasta el final
  const eventos = ventasSimuladas(3, { paso: 30 });
  ordenarEventos(eventos);
  const r = simular({ inicial: 3, eventos });

  assert.equal(r.compras.length, 0);
  assert.equal(r.saldoFinal, 0);
});

test('resolverSKU cuadra el invariante en distintos escenarios', () => {
  const escenarios = [
    { stock: 1, ventas: 60, devoluciones: 0 },
    { stock: 0, ventas: 45, devoluciones: 0 },
    { stock: 5, ventas: 8, devoluciones: 0 },
    { stock: 1, ventas: 30, devoluciones: 1 }, // un pedido cancelado
    { stock: 0, ventas: 12, devoluciones: 1 },
  ];

  for (const e of escenarios) {
    // ventas del período = las simuladas + la del pedido cancelado
    const eventos = ventasSimuladas(e.ventas - e.devoluciones, { paso: 3 });
    if (e.devoluciones) {
      // el pedido se cancela temprano: sale y vuelve al día siguiente
      const fecha = INICIO + 5 * MS_DIA;
      eventos.push({ fecha, tipo: 'salida', cantidad: 1, motivo: 'Venta', pedidoId: 1 });
      eventos.push({
        fecha: fecha + MS_DIA,
        tipo: 'entrada',
        cantidad: 1,
        motivo: 'Cancelación del pedido #1',
        pedidoId: 1,
      });
    }
    ordenarEventos(eventos);

    const sol = resolverSKU({ stock: e.stock, eventos });
    assert.ok(sol, `sin solución para ${JSON.stringify(e)}`);

    const entradas = sol.inicial + sol.compras.reduce((s, c) => s + c.cantidad, 0) + e.devoluciones;
    const salidas = e.ventas;
    assert.equal(
      entradas - salidas,
      e.stock,
      `descuadre en ${JSON.stringify(e)}: ${entradas} − ${salidas} ≠ ${e.stock}`
    );
    assert.ok(
      sol.inicial >= 1 || (sol.inicial === 0 && e.stock + e.ventas === e.devoluciones),
      `inventario inicial inválido: ${sol.inicial}`
    );
  }
});

test('resolverSKU prefiere la historia con más reposiciones', () => {
  // Mucha demanda ⇒ tiene que llegar al mayor nº de lotes posible
  const eventos = ventasSimuladas(100, { paso: 2 });
  ordenarEventos(eventos);
  const sol = resolverSKU({ stock: 1, eventos });

  assert.ok(sol);
  assert.equal(sol.inicial + sol.compras.length * LOTE, 1 + 100);
  assert.ok(sol.inicial >= 1 && sol.inicial <= LOTE, `inicial ${sol.inicial} fuera de rango`);
});

test('ordenarEventos pone las entradas antes que las salidas a igual fecha', () => {
  const eventos = [
    { fecha: 100, tipo: 'salida', cantidad: 1 },
    { fecha: 100, tipo: 'entrada', cantidad: 1 },
    { fecha: 50, tipo: 'salida', cantidad: 1 },
  ];
  ordenarEventos(eventos);

  assert.equal(eventos[0].fecha, 50);
  assert.equal(eventos[1].tipo, 'entrada');
  assert.equal(eventos[2].tipo, 'salida');
});
