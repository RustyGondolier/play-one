#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Play One — Entrenamiento del modelo de pronóstico de demanda
============================================================

Toma ml/dataset.json (lo genera server/ml/exportar-dataset.js) y
escribe ml/modelo.json, el artefacto que el servidor Node sólo
APLICA en inferencia (patrón "entrenamiento offline → inferencia
online": el servidor nunca entrena en producción).

Dos caminos, el mismo modelo:

  1. scikit-learn (recomendado; es lo que corre en Google Colab):
         Pipeline(StandardScaler(), Ridge(alpha=λ))
  2. Respaldo en Python puro (sin numpy ni scikit-learn): mismas
     matemáticas resueltas a mano. Por eso este script corre en
     cualquier parte, aunque el entorno no tenga librerías.

Convención idéntica a server/ml/modelo.js (el test de paridad
compara los coeficientes de ambos con tolerancia 1e-6):
  · X se estandariza (media 0, desvío 1, ddof=0)
  · y se centra
  · se resuelve (XᵀX + λI)·w = Xᵀ(y − ȳ)
  · intercepto = ȳ

Uso:
    python ml/entrenar.py                       # con sklearn si hay
    python ml/entrenar.py --sin-sklearn         # fuerza el respaldo puro
    python ml/entrenar.py --lambda 0            # OLS puro (para comparar)
    python ml/entrenar.py --dataset d.json --salida m.json
"""

import argparse
import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone

ALFA_EMA = 0.3        # línea base: suavizado exponencial (igual que evaluacion.js)
VENTANA_TEST = 14     # días de prueba: las 2 últimas semanas
LAMBDA = 1.0          # regularización Ridge (valor por defecto de scikit-learn)
AQUI = os.path.dirname(os.path.abspath(__file__))


# --------------------------------------------------------------------------
# Respaldo en Python puro (sin numpy ni scikit-learn)
# --------------------------------------------------------------------------
def estandarizador(X):
    """Media y desvío típico por columna (ddof=0, como StandardScaler)."""
    n = len(X)
    p = len(X[0])
    media = [sum(fila[j] for fila in X) / n for j in range(p)]
    escala = []
    for j in range(p):
        var = sum((fila[j] - media[j]) ** 2 for fila in X) / n
        d = math.sqrt(var)
        escala.append(d if d > 1e-12 else 1.0)
    return media, escala


def resolver_sistema(A, b):
    """Eliminación de Gauss-Jordan con pivoteo parcial."""
    n = len(b)
    M = [list(fila) + [b[i]] for i, fila in enumerate(A)]
    for c in range(n):
        pivote = max(range(c, n), key=lambda f: abs(M[f][c]))
        if abs(M[pivote][c]) < 1e-12:
            raise ValueError("Sistema singular: las características son dependientes")
        M[c], M[pivote] = M[pivote], M[c]
        for f in range(n):
            if f == c:
                continue
            factor = M[f][c] / M[c][c]
            if factor == 0:
                continue
            for k in range(c, n + 1):
                M[f][k] -= factor * M[c][k]
    return [M[i][n] / M[i][i] for i in range(n)]


def ajustar_puro(X, y, alpha):
    """OLS/Ridge por mínimos cuadrados, sin librerías."""
    n, p = len(X), len(X[0])
    media, escala = estandarizador(X)
    Xs = [[(fila[j] - media[j]) / escala[j] for j in range(p)] for fila in X]
    media_y = sum(y) / n

    A = [[0.0] * p for _ in range(p)]
    b = [0.0] * p
    for i in range(n):
        yc = y[i] - media_y
        for j in range(p):
            b[j] += Xs[i][j] * yc
            for k in range(p):
                A[j][k] += Xs[i][j] * Xs[i][k]
    for j in range(p):
        A[j][j] += alpha

    w = resolver_sistema(A, b)
    return {"media": media, "escala": escala}, w, media_y


# --------------------------------------------------------------------------
# Camino principal: scikit-learn
# --------------------------------------------------------------------------
def ajustar_sklearn(X, y, alpha):
    from sklearn.linear_model import Ridge
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    pipe = Pipeline([("scaler", StandardScaler()), ("ridge", Ridge(alpha=alpha))])
    pipe.fit(X, y)
    scaler = pipe.named_steps["scaler"]
    modelo = pipe.named_steps["ridge"]
    return (
        {"media": scaler.mean_.tolist(), "escala": scaler.scale_.tolist()},
        modelo.coef_.tolist(),
        float(modelo.intercept_),
    )


# --------------------------------------------------------------------------
# Métricas (mismas fórmulas que server/ml/modelo.js)
# --------------------------------------------------------------------------
def metricas(reales, predichos):
    n = min(len(reales), len(predichos))
    if n == 0:
        return {"n": 0, "mae": 0.0, "rmse": 0.0, "wape": 0.0}
    suma_abs = sum(abs(predichos[i] - reales[i]) for i in range(n))
    suma_cuad = sum((predichos[i] - reales[i]) ** 2 for i in range(n))
    suma_real = sum(abs(v) for v in reales[:n])
    return {
        "n": n,
        "mae": suma_abs / n,
        "rmse": math.sqrt(suma_cuad / n),
        "wape": (suma_abs / suma_real) if suma_real else 0.0,
    }


def predecir(scaler, w, intercepto, x):
    media, escala = scaler["media"], scaler["escala"]
    return intercepto + sum(
        w[j] * ((x[j] - media[j]) / escala[j]) for j in range(len(w))
    )


def linea_base(series, dias, corte):
    """Suavizado exponencial simple por SKU (sólo información pasada)."""
    reales, predichos = [], []
    for diario in series.values():
        inicio = min(28, len(diario))  # ventana inicial
        suavizado = sum(diario[:inicio]) / inicio if inicio else 0.0
        for d in range(inicio, dias):
            if d >= corte:
                reales.append(diario[d])
                predichos.append(max(0.0, suavizado))
            suavizado = ALFA_EMA * diario[d] + (1 - ALFA_EMA) * suavizado
    return metricas(reales, predichos)


# --------------------------------------------------------------------------
def main():
    # Windows usa cp1252 en la consola: sin esto, imprimir ✔ o λ truena
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser(description="Entrena el modelo de demanda de Play One")
    ap.add_argument("--dataset", default=os.path.join(AQUI, "dataset.json"))
    ap.add_argument("--salida", default=os.path.join(AQUI, "modelo.json"))
    ap.add_argument("--lambda", dest="alpha", type=float, default=LAMBDA)
    ap.add_argument("--sin-sklearn", action="store_true",
                    help="fuerza el respaldo en Python puro")
    args = ap.parse_args()

    with open(args.dataset, encoding="utf-8") as f:
        datos = json.load(f)

    X, y, dias_col = datos["X"], datos["y"], datos.get("dias_fila")
    caracteristicas = datos.get("caracteristicas") or [
        f"x{j}" for j in range(len(X[0]))
    ]
    dias = int(datos.get("dias", 180))
    corte = dias - VENTANA_TEST

    if dias_col is None:
        # sin columna de día: se entrena con todo (no hay backtest temporal)
        i_entre, i_prueba = list(range(len(X))), []
    else:
        i_entre = [i for i, d in enumerate(dias_col) if d < corte]
        i_prueba = [i for i, d in enumerate(dias_col) if d >= corte]

    Xe = [X[i] for i in i_entre]
    ye = [y[i] for i in i_entre]

    libreria = "Python puro (mínimos cuadrados)"
    if args.sin_sklearn:
        scaler, w, intercepto = ajustar_puro(Xe, ye, args.alpha)
    else:
        try:
            scaler, w, intercepto = ajustar_sklearn(Xe, ye, args.alpha)
            import sklearn
            libreria = f"scikit-learn {sklearn.__version__} (StandardScaler + Ridge)"
        except ImportError:
            print("· scikit-learn no está instalado: se usa el respaldo en Python puro",
                  file=sys.stderr)
            scaler, w, intercepto = ajustar_puro(Xe, ye, args.alpha)

    # Backtest sobre la ventana de prueba (información futura = sólo evaluación)
    m_modelo = {"n": 0, "mae": 0.0, "rmse": 0.0, "wape": 0.0}
    if i_prueba:
        m_modelo = metricas(
            [y[i] for i in i_prueba],
            [max(0.0, predecir(scaler, w, intercepto, X[i])) for i in i_prueba],
        )

    m_base = {"n": 0, "mae": 0.0, "rmse": 0.0, "wape": 0.0}
    series = datos.get("series")
    if series and i_prueba:
        m_base = linea_base({k: v for k, v in series.items()}, dias, corte)

    mejora = 0.0
    if m_base["wape"] > 0:
        mejora = (m_base["wape"] - m_modelo["wape"]) / m_base["wape"] * 100

    with open(args.dataset, "rb") as f:
        sha = hashlib.sha256(f.read()).hexdigest()[:16]

    artefacto = {
        "version": 1,
        "algoritmo": "ridge" if args.alpha > 0 else "ols",
        "libreria": libreria,
        "lambda": args.alpha,
        "caracteristicas": caracteristicas,
        "scaler": {"media": scaler["media"], "escala": scaler["escala"]},
        "coeficientes": [round(c, 12) for c in w],
        "intercepto": intercepto,
        "filas": len(Xe),
        "sku": datos.get("sku"),
        "entrenado_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dataset": {
            "archivo": os.path.basename(args.dataset),
            "sha256": sha,
            "filas": len(X),
        },
        "ventana": {
            "entrenamiento": [datos.get("dias_minimos_historial", 28), corte - 1],
            "prueba": [corte, dias - 1] if i_prueba else None,
        },
        "metricas": {
            "modelo": {k: round(v, 6) if isinstance(v, float) else v
                       for k, v in m_modelo.items()},
            "linea_base": {k: round(v, 6) if isinstance(v, float) else v
                           for k, v in m_base.items()},
            "mejora_wape_pct": round(mejora, 2),
            "modelo_gana": m_modelo["wape"] <= m_base["wape"],
        },
    }

    with open(args.salida, "w", encoding="utf-8") as f:
        json.dump(artefacto, f, ensure_ascii=False, indent=2)

    print(f"✔ {os.path.basename(args.salida)}  [{libreria}]  λ={args.alpha}")
    print(f"   {artefacto['filas']} filas de entrenamiento · "
          f"{len(i_prueba)} de prueba · {len(caracteristicas)} características")
    print(f"   coeficientes: {[round(c, 4) for c in w]}  intercepto {intercepto:.4f}")
    if i_prueba:
        print(f"   MAE {m_modelo['mae']:.4f} · RMSE {m_modelo['rmse']:.4f} · "
              f"WAPE {m_modelo['wape']:.4f}  (línea base WAPE {m_base['wape']:.4f})")
        print(f"   el modelo {'GANA' if m_modelo['wape'] <= m_base['wape'] else 'NO gana'} "
              f"a la línea base ({mejora:+.1f}% de WAPE)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
