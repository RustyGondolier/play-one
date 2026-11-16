// ============================================================
// Play One — Regresión lineal sin dependencias (Node puro)
//
// Implementa OLS y Ridge por mínimos cuadrados, resolviendo el
// sistema normal con eliminación de Gauss y pivoteo parcial.
//
// Convención IDÉNTICA a scikit-learn dentro de un Pipeline
// (StandardScaler → Ridge):
//   · X se estandariza: media 0 y desvío 1 (ddof = 0)
//   · y se centra ( Ridge siempre centra la variable objetivo )
//   · se resuelve  (XᵀX + λ·I) · w = Xᵀ·(y − ȳ)
//   · intercepto = ȳ
//
// Con λ = 0 queda OLS exacto. El test de paridad verifica que
// Python (scikit-learn o el respaldo puro) y Node producen los
// mismos coeficientes (tolerancia 1e-6).
// ============================================================

/**
 * Media y desvío típico por columna de X (ddof = 0, como
 * StandardScaler de scikit-learn). Una columna constante queda
 * con desvío 1 para no dividir entre cero (igual que sklearn).
 */
export function estandarizador(X) {
  const n = X.length;
  const p = X[0].length;
  const media = new Array(p).fill(0);
  const escala = new Array(p).fill(0);

  for (const fila of X) {
    for (let j = 0; j < p; j += 1) media[j] += fila[j];
  }
  for (let j = 0; j < p; j += 1) media[j] /= n;

  for (const fila of X) {
    for (let j = 0; j < p; j += 1) escala[j] += (fila[j] - media[j]) ** 2;
  }
  for (let j = 0; j < p; j += 1) {
    const d = Math.sqrt(escala[j] / n);
    escala[j] = d > 1e-12 ? d : 1;
  }

  return { media, escala };
}

/** Aplica un estandarizador a una matriz de características */
export function estandarizar(X, { media, escala }) {
  return X.map((fila) => fila.map((v, j) => (v - media[j]) / escala[j]));
}

/**
 * Resuelve A·x = b por eliminación de Gauss-Jordan con pivoteo
 * parcial. A debe ser cuadrada y no singular.
 */
export function resolverSistema(A, b) {
  const n = b.length;
  const M = A.map((fila, i) => [...fila, b[i]]);

  for (let c = 0; c < n; c += 1) {
    let pivote = c;
    for (let f = c + 1; f < n; f += 1) {
      if (Math.abs(M[f][c]) > Math.abs(M[pivote][c])) pivote = f;
    }
    if (Math.abs(M[pivote][c]) < 1e-12) {
      throw new Error('Sistema singular: las características son dependientes');
    }
    if (pivote !== c) [M[c], M[pivote]] = [M[pivote], M[c]];

    for (let f = 0; f < n; f += 1) {
      if (f === c) continue;
      const factor = M[f][c] / M[c][c];
      if (factor === 0) continue;
      for (let k = c; k <= n; k += 1) M[f][k] -= factor * M[c][k];
    }
  }

  return M.map((fila, i) => fila[n] / fila[i]);
}

/**
 * Ajusta el modelo y = X·w + intercepto por Ridge (λ = 0 ⇒ OLS).
 * Devuelve el artefacto que se serializa a JSON y que Node aplica
 * en inferencia (ver inferencia.js).
 */
export function ajustar(X, y, { lambda = 0 } = {}) {
  if (!X.length || X.length !== y.length) throw new Error('X e y no coinciden');
  const n = X.length;
  const p = X[0].length;

  const scaler = estandarizador(X);
  const Xs = estandarizar(X, scaler);
  let mediaY = 0;
  for (const v of y) mediaY += v;
  mediaY /= n;

  // XᵀX + λI   y   Xᵀ(y − ȳ)
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let i = 0; i < n; i += 1) {
    const yc = y[i] - mediaY;
    for (let j = 0; j < p; j += 1) {
      b[j] += Xs[i][j] * yc;
      for (let k = 0; k < p; k += 1) A[j][k] += Xs[i][j] * Xs[i][k];
    }
  }
  for (let j = 0; j < p; j += 1) A[j][j] += lambda;

  const coeficientes = resolverSistema(A, b);
  return {
    algoritmo: lambda > 0 ? 'ridge' : 'ols',
    lambda,
    caracteristicas: null, // lo completa quien arma el dataset
    scaler,
    coeficientes,
    intercepto: mediaY,
    filas: n,
  };
}

/** Predice para una fila en la escala original */
export function predecir(modelo, x) {
  const { scaler, coeficientes, intercepto } = modelo;
  let suma = intercepto;
  for (let j = 0; j < x.length; j += 1) {
    const xs = (x[j] - scaler.media[j]) / scaler.escala[j];
    suma += xs * coeficientes[j];
  }
  return suma;
}

/**
 * Métricas de error. Se usa WAPE (error absoluto total / demanda
 * total) en lugar de MAPE: la demanda diaria tiene muchos ceros y
 * el MAPE se dispara (división entre cero).
 */
export function metricas(reales, predichos) {
  const n = Math.min(reales.length, predichos.length);
  if (n === 0) return { n: 0, mae: 0, rmse: 0, wape: 0 };

  let sumaAbs = 0;
  let sumaCuad = 0;
  let sumaReal = 0;
  for (let i = 0; i < n; i += 1) {
    const error = predichos[i] - reales[i];
    sumaAbs += Math.abs(error);
    sumaCuad += error * error;
    sumaReal += Math.abs(reales[i]);
  }

  return {
    n,
    mae: sumaAbs / n,
    rmse: Math.sqrt(sumaCuad / n),
    wape: sumaReal > 0 ? sumaAbs / sumaReal : 0,
  };
}
