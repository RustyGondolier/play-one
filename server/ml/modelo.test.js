// Pruebas del módulo ML (sin base de datos):
//   node --test ml/modelo.test.js
//
// Cubre la matemática (OLS/Ridge, métricas), las características
// y el contrato de paridad con ml/entrenar.py: el mismo dataset
// debe producir los MISMOS coeficientes en Python y en Node
// (tolerancia 1e-6).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  estandarizador,
  estandarizar,
  resolverSistema,
  ajustar,
  predecir,
  metricas,
} from './modelo.js';
import {
  CARACTERISTICAS,
  mediaVentana,
  pendienteVentana,
  esFinde,
  caracteristicas,
  pronosticar,
} from './features.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..', '..');
const RUTA_ENTRENAR = path.join(RAIZ, 'ml', 'entrenar.py');

// ------------------------------------------------------------
// Matemática básica
// ------------------------------------------------------------

test('estandarizador: media 0 y desvío 1 (ddof = 0)', () => {
  const X = [[1, 10], [2, 20], [3, 30]];
  const { media, escala } = estandarizador(X);

  assert.equal(media[0], 2);
  assert.equal(media[1], 20);
  // desvío poblacional de 1,2,3 = sqrt(2/3)
  assert.ok(Math.abs(escala[0] - Math.sqrt(2 / 3)) < 1e-12);
  // columna constante → escala 1 (como StandardScaler de sklearn)
  const c = estandarizador([[5], [5], [5]]);
  assert.equal(c.escala[0], 1);
});

test('estandarizar centra y escala', () => {
  const X = [[1, 100], [3, 200]];
  const scaler = estandarizador(X);
  const Z = estandarizar(X, scaler);

  for (let j = 0; j < 2; j += 1) {
    const media = (Z[0][j] + Z[1][j]) / 2;
    assert.ok(Math.abs(media) < 1e-12);
  }
});

test('resolverSistema resuelve un sistema conocido', () => {
  // 2x + y = 5 ; x + 3y = 10  →  x = 1, y = 3
  const x = resolverSistema([[2, 1], [1, 3]], [5, 10]);
  assert.ok(Math.abs(x[0] - 1) < 1e-12);
  assert.ok(Math.abs(x[1] - 3) < 1e-12);
});

test('resolverSistema lanza ante una matriz singular', () => {
  assert.throws(() => resolverSistema([[1, 2], [2, 4]], [1, 2]), /singular/);
});

test('ajustar con λ = 0 reproduce la recta exacta (OLS)', () => {
  // y = 3 + 2·x exacto → OLS debe recuperar el coeficiente exacto
  const X = [];
  const y = [];
  for (let i = 0; i < 20; i += 1) {
    X.push([i]);
    y.push(3 + 2 * i);
  }
  const modelo = ajustar(X, y, { lambda: 0 });

  // con una sola característica, w_std · (x−μ)/σ = 2·(x−μ)/σ
  // ⇒ w_std = 2·σ
  const esperado = 2 * estandarizador(X).escala[0];
  assert.ok(Math.abs(modelo.coeficientes[0] - esperado) < 1e-9);
  // el intercepto de este modelo es la media de y (y se centra en ȳ)
  assert.ok(Math.abs(modelo.intercepto - 22) < 1e-9); // media de 3+2·x, x = 0..19
  assert.equal(modelo.algoritmo, 'ols');

  // y la predicción es prácticamente exacta
  for (const xi of [0, 7, 19]) {
    assert.ok(Math.abs(predecir(modelo, [xi]) - (3 + 2 * xi)) < 1e-9);
  }
});

test('ajustar con λ > 0 encoge los coeficientes (Ridge)', () => {
  const X = [[0], [1], [2], [3], [4]];
  const y = [1, 3, 5, 7, 9]; // pendiente 2
  const ols = ajustar(X, y, { lambda: 0 });
  const ridge = ajustar(X, y, { lambda: 10 });

  assert.ok(
    Math.abs(ridge.coeficientes[0]) < Math.abs(ols.coeficientes[0]),
    'la regularización debe encoger el coeficiente'
  );
  assert.equal(ridge.algoritmo, 'ridge');
});

test('metricas: MAE, RMSE y WAPE sobre un caso conocido', () => {
  const reales = [2, 0, 4];
  const predichos = [1, 1, 6];
  const m = metricas(reales, predichos);

  // |errores| = 1, 1, 2 → MAE = 4/3 ; RMSE = sqrt(6/3) = sqrt(2)
  // Σ|reales| = 6      → WAPE = 4/6
  assert.equal(m.n, 3);
  assert.ok(Math.abs(m.mae - 4 / 3) < 1e-12);
  assert.ok(Math.abs(m.rmse - Math.SQRT2) < 1e-12);
  assert.ok(Math.abs(m.wape - 4 / 6) < 1e-12);
});

test('metricas con todo en cero no divide por cero', () => {
  const m = metricas([0, 0], [1, 2]);
  assert.equal(m.wape, 0);
  assert.ok(m.mae > 0);
});

// ------------------------------------------------------------
// Características
// ------------------------------------------------------------

test('mediaVentana usa los últimos n valores (o todos si hay menos)', () => {
  const h = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.equal(mediaVentana(h, 7), (2 + 3 + 4 + 5 + 6 + 7 + 8) / 7);
  assert.equal(mediaVentana(h, 28), 4.5); // todos
  assert.equal(mediaVentana([], 7), 0);
});

test('pendienteVentana devuelve la pendiente de mínimos cuadrados', () => {
  // serie lineal exacta con pendiente 0.5
  const h = Array.from({ length: 28 }, (_, i) => 10 + 0.5 * i);
  assert.ok(Math.abs(pendienteVentana(h, 28) - 0.5) < 1e-12);

  // constante → pendiente 0
  assert.equal(pendienteVentana(new Array(28).fill(3), 28), 0);

  // con menos de 2 puntos no hay pendiente
  assert.equal(pendienteVentana([5], 28), 0);
  assert.equal(pendienteVentana([], 28), 0);
});

test('esFinde marca viernes, sábado y domingo', () => {
  const d = (y, m, dd) => new Date(y, m, dd); // Date local (m: 0 = enero)
  // ancla: 15 de noviembre de 2026 es domingo
  assert.equal(d(2026, 10, 15).getDay(), 0);

  assert.equal(esFinde(d(2026, 10, 12)), 0); // jueves
  assert.equal(esFinde(d(2026, 10, 13)), 1); // viernes
  assert.equal(esFinde(d(2026, 10, 14)), 1); // sábado
  assert.equal(esFinde(d(2026, 10, 15)), 1); // domingo
  assert.equal(esFinde(d(2026, 10, 16)), 0); // lunes
  assert.equal(esFinde(d(2026, 10, 20)), 1); // viernes
  assert.equal(esFinde(d(2026, 10, 21)), 1); // sábado
});

test('caracteristicas devuelve las 4 columnas en el orden del dataset', () => {
  const historial = Array.from({ length: 30 }, (_, i) => (i % 7 === 5 ? 3 : 1));
  const fecha = new Date(2026, 10, 15); // viernes
  const x = caracteristicas(historial, fecha);

  assert.equal(x.length, CARACTERISTICAS.length);
  assert.deepEqual(CARACTERISTICAS, ['media7', 'media28', 'pendiente', 'finde']);
  assert.equal(x[3], 1); // viernes
  assert.equal(x[0], mediaVentana(historial, 7));
  assert.equal(x[1], mediaVentana(historial, 28));
  assert.equal(x[2], pendienteVentana(historial, 28));
});

test('pronosticar es recursivo, no negativo y respeta el horizonte', () => {
  const historial = Array.from({ length: 60 }, (_, i) => (i % 7 >= 5 ? 4 : 1));
  const fechas = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 15 + i));

  // modelo entrenado con las MISMAS 4 características que usa la inferencia
  const filas = [];
  for (let d = 28; d < 60; d += 1) {
    filas.push(caracteristicas(historial.slice(0, d), fechas[0]));
  }
  const y = filas.map((_, i) => (i % 7 >= 5 ? 4 : 1));
  const modelo = ajustar(filas, y, { lambda: 1 });

  const p = pronosticar(historial, modelo, fechas);

  assert.equal(p.length, 7);
  for (const v of p) assert.ok(Number.isFinite(v) && v >= 0, `predicción inválida: ${v}`);
  // el resultado es determinista
  assert.deepEqual(p, pronosticar(historial, modelo, fechas));
});

// ------------------------------------------------------------
// Paridad Python ↔ Node
// ------------------------------------------------------------

/** Dataset sintético pequeño y determinista (sin tocar la BD) */
function datasetSintetico(n = 240, p = 4) {
  let s = 12345;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const X = [];
  const y = [];
  for (let i = 0; i < n; i += 1) {
    const fila = Array.from({ length: p }, () => rnd() * 10);
    X.push(fila);
    y.push(0.5 + fila[0] * 0.4 - fila[1] * 0.2 + rnd() * 0.5);
  }
  return { X, y };
}

function pythonDisponible() {
  const r = spawnSync('python', ['--version'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0;
}

test('paridad Python ↔ Node: mismos coeficientes (tolerancia 1e-6)', (t) => {
  if (!pythonDisponible()) {
    t.skip('python no está disponible en esta máquina');
    return;
  }

  const { X, y } = datasetSintetico();
  // sin columna de día: Python entrena con TODAS las filas, igual que Node
  const temporal = {
    caracteristicas: ['x0', 'x1', 'x2', 'x3'],
    X,
    y,
  };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playone-paridad-'));
  const dsPath = path.join(dir, 'dataset.json');
  const outPath = path.join(dir, 'modelo.json');
  fs.writeFileSync(dsPath, JSON.stringify(temporal));

  // Entrena en Python (respaldo puro: no requiere sklearn) con λ = 1
  const r = spawnSync(
    'python',
    [RUTA_ENTRENAR, '--sin-sklearn', '--dataset', dsPath, '--salida', outPath, '--lambda', '1'],
    { encoding: 'utf8', windowsHide: true }
  );
  if (r.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.fail(`ml/entrenar.py falló: ${r.stderr}`);
  }

  const artefacto = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });

  const modeloNode = ajustar(X, y, { lambda: 1 });

  assert.equal(artefacto.caracteristicas.length, modeloNode.coeficientes.length);
  for (let j = 0; j < modeloNode.coeficientes.length; j += 1) {
    assert.ok(
      Math.abs(artefacto.coeficientes[j] - modeloNode.coeficientes[j]) < 1e-6,
      `coeficiente ${j}: python=${artefacto.coeficientes[j]} node=${modeloNode.coeficientes[j]}`
    );
  }
  assert.ok(
    Math.abs(artefacto.intercepto - modeloNode.intercepto) < 1e-6,
    `intercepto: python=${artefacto.intercepto} node=${modeloNode.intercepto}`
  );

  // y el scaler también debe coincidir (lo aplica la inferencia)
  for (let j = 0; j < modeloNode.scaler.media.length; j += 1) {
    assert.ok(Math.abs(artefacto.scaler.media[j] - modeloNode.scaler.media[j]) < 1e-9);
    assert.ok(Math.abs(artefacto.scaler.escala[j] - modeloNode.scaler.escala[j]) < 1e-9);
  }
});

test('paridad Python ↔ Node con λ = 0 (OLS exacto)', (t) => {
  if (!pythonDisponible()) {
    t.skip('python no está disponible en esta máquina');
    return;
  }

  const { X, y } = datasetSintetico(150, 3);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playone-paridad-'));
  const dsPath = path.join(dir, 'dataset.json');
  const outPath = path.join(dir, 'modelo.json');
  fs.writeFileSync(
    dsPath,
    JSON.stringify({ caracteristicas: ['x0', 'x1', 'x2'], X, y })
  );

  const r = spawnSync(
    'python',
    [RUTA_ENTRENAR, '--sin-sklearn', '--dataset', dsPath, '--salida', outPath, '--lambda', '0'],
    { encoding: 'utf8', windowsHide: true }
  );
  if (r.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.fail(`ml/entrenar.py falló: ${r.stderr}`);
  }

  const artefacto = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });

  const modeloNode = ajustar(X, y, { lambda: 0 });
  for (let j = 0; j < modeloNode.coeficientes.length; j += 1) {
    assert.ok(
      Math.abs(artefacto.coeficientes[j] - modeloNode.coeficientes[j]) < 1e-6,
      `coeficiente ${j}: python=${artefacto.coeficientes[j]} node=${modeloNode.coeficientes[j]}`
    );
  }
  assert.equal(artefacto.algoritmo, 'ols');
});
