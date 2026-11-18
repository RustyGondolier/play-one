# Play One - Módulo de IA/ML: pronóstico de demanda y alerta de quiebre

> **Resumen para el informe:** modelo de regresión (Ridge) que pronostica la demanda diaria
> de cada talla durante 7 días y avisa cuándo se va a agotar. Se entrena **offline** con
> scikit-learn (en Google Colab o en local) y el servidor Node sólo **aplica** el artefacto
> entrenado. En el backtest de los últimos 14 días el modelo **le gana a la línea base en
> un 7,9 % de WAPE** (1,2623 vs 1,3706).

---

## 1. Por qué un modelo de regresión y no otra cosa

El negocio vende zapas de fútbol Adidas por TikTok Live, con demanda concentrada en
viernes/sábado/domingo. Lo que hay que responder es operativo y a corto plazo:

> **¿De qué talla me voy a quedar en los próximos 7 días y cuánto tengo que pedir?**

Eso es una **regresión sobre series temporales por SKU**: se usan ventanas de la serie
pasada para predecir el día siguiente. Se descartaron otras opciones por falta de datos o
por complejidad desproporcionada:

| Alternativa | Por qué no |
| --- | --- |
| ARIMA / SARIMAX | Requiere ≥ 50 observaciones *por SKU* sin saltos; con 26 tallas y ruido de Poisson el ajuste es inestable y no aporta sobre una regresión con ventanas. |
| Redes neuronales (LSTM) | Sobreajuste garantizado con 180 días × 26 tallas; sin GPU ni tiempo de entrenamiento razonable, y el error no justifica la caja negra. |
| Media móvil simple | Es la **línea base** que se usa para comparar. El modelo tiene que ganarle o no sirve. |

---

## 2. Dataset

| Campo | Valor |
| --- | --- |
| Origen | `movimientos_stock` (tipo `salida`) - ver §5 |
| Ventana | **180 días** (6 meses) × **26 tallas disponibles** |
| Filas | **3.952** = 26 SKU × (180 − 28) días con historial suficiente |
| Frecuencia | diaria, unidades enteras |
| Exportación | `node ml/exportar-dataset.js` → `ml/dataset.json` (249 KB) |

### 2.1 Declaración del dato simulado

> **El histórico de ventas es SIMULADO.** La plantilla `PLANTILLAS PLAYONE.xlsx` sólo trae
> el stock actual, no hay exportable de ventas. Para poder entrenar y *evaluar* el modelo,
> `server/db/historial-ventas.js` genera de forma **determinista** (PRNG `mulberry32` con
> semilla fija por SKU) los últimos 180 días de demanda, con:
>
> - **estacionalidad** de los lives de TikTok: viernes/sábado/domingo × 2,5,
> - **tendencia** de crecimiento +6 % en el período,
> - **ruido de Poisson** (demanda discreta, independiente por día),
> - una **política de reposición** realista: lote de 8 unidades cuando el saldo baja de 2
>   y todavía queda demanda por surtir.
>
> El generador **verifica un invariante** y aborta el `npm run db:setup` si no se cumple:
>
> ```
> Σ(entradas) − Σ(salidas) = stock_actual     para cada SKU disponible
> ```
>
> Es decir, el log de movimientos **cuadra exactamente** con el stock real de la plantilla
> Excel: 0 descuadres, saldo corrido nunca negativo, 0 movimientos en el futuro.
> El mismo criterio sigue la API: los pedidos del seed generan su salida y los cancelados
> su devolución.
>
> Esto se declara abiertamente en el informe: el modelo está entrenado y validado sobre
> datos sintéticos coherentes con el inventario real. **La métrica del modelo es
> internamente válida** (compara modelo vs. línea base sobre el mismo dato); la
> **generalización a la demanda real del negocio queda pendiente** de acumular ventas reales.

---

## 3. Características (features)

Para predecir el día **t** sólo se usa información hasta **t−1** (sin data leaking).
Las cuatro columnas, en el orden exacto de `CARACTERISTICAS`:

| # | Feature | Fórmula | Por qué |
| --- | --- | --- | --- |
| 0 | `media7` | media de ventas de los últimos 7 días | captura el nivel reciente |
| 1 | `media28` | media de ventas de los últimos 28 días | **absorbe el "nivel" de cada talla**, por eso el modelo se entrena con todas las tallas juntas (*pooled*) |
| 2 | `pendiente` | pendiente de la recta de mínimos cuadrados sobre los últimos 28 días (unidades/día) | detecta crecimiento o caída |
| 3 | `finde` | 1 si el día t es viernes, sábado o domingo, 0 si no | efecto live de TikTok |

Se descartó `tendencia = media7 − media28` por ser **linealmente dependiente** de las dos
medias ya presentes (colinearidad exacta: `media7 − media28` es una combinación lineal
de las columnas 0 y 1), lo que haría singular la matriz del sistema normal.

Los primeros 28 días no tienen historial completo: se descartan del entrenamiento
(`MIN_DIAS = 28`), por eso 26 × 152 = 3.952 filas.

---

## 4. Modelo

### 4.1 Matemática

Se usa la convención **idéntica** a un `Pipeline(StandardScaler(), Ridge(alpha=λ))` de
scikit-learn, implementada a mano tanto en Python (`ml/entrenar.py`) como en Node
(`server/ml/modelo.js`):

```
1. X se estandariza por columna:  x' = (x − μ) / σ        (σ con ddof = 0, como StandardScaler)
2. y se centra:                   ȳ = mean(y)
3. se resuelve el sistema:        (XᵀX + λ·I) · w = Xᵀ · (y − ȳ)
4. intercepto:                    β₀ = ȳ
5. predicción:                    ŷ = β₀ + Σ wⱼ · (xⱼ − μⱼ)/σⱼ
```

- **λ = 1,0** (valor por defecto de `Ridge` en scikit-learn). Con λ = 0 queda OLS exacto.
- El sistema se resuelve con **eliminación de Gauss-Jordan con pivoteo parcial**
  (`resolverSistema`), que no requiere dependencias numéricas.
- Una columna constante recibe σ = 1 para no dividir entre cero (igual que sklearn).

### 4.2 Entrenamiento offline → inferencia online

```
┌─────────────────────┐   ml/dataset.json   ┌──────────────────────┐
│  server/ (Node)     │ ──────────────────► │  ml/entrenar.py      │
│  exportar-dataset   │                     │  scikit-learn        │
└─────────────────────┘                     │  (Colab o local)     │
                                            └──────────┬───────────┘
                                                       │ ml/modelo.json
                                                       ▼
                                            ┌──────────────────────┐
                                            │  server/ml/          │
                                            │  inferencia.js       │  ← el servidor SÓLO
                                            │  (aplica, ~1 ms)     │     aplica el modelo
                                            └──────────────────────┘
```

El servidor **nunca entrena en producción**. Si alguien clona el repo sin `modelo.json`,
`cargarModelo()` reentrena un Ridge en Node puro con los mismos datos y la respuesta marca
`"origen": "fallback-node"`; con el artefacto marca `"origen": "artefacto"`.

```bash
node ml/exportar-dataset.js      # → ml/dataset.json
python ml/entrenar.py            # → ml/modelo.json  (usa sklearn si está instalado)
python ml/entrenar.py --sin-sklearn   # respaldo en Python puro (sin numpy/sklearn)
python ml/entrenar.py --lambda 0      # OLS puro, para comparar
```

---

## 5. Evaluación (backtesting honesto)

Se respeta la **regla de oro de series temporales**: se entrena con el pasado y se evalúa
con el futuro. Nunca se mezcla información futura en el entrenamiento.

| Ventana | Días | Filas |
| --- | --- | --- |
| Entrenamiento | 28 - 165 | 3.588 |
| Prueba (futura) | 166 - 179 (las 2 últimas semanas) | 364 |

### 5.1 Línea base

**Suavizado exponencial simple** (Holt) por SKU, α = 0,3, recorriendo la misma ventana:

```
ŷ(t) = α · ventas(t−1) + (1 − α) · ŷ(t−1)
```

Si el modelo no le gana a esto, se dice en el informe y se descarta el modelo.

### 5.2 Métricas

- **MAE** - error absoluto medio (unidades/día).
- **RMSE** - penaliza los errores grandes.
- **WAPE** - Σ|error| / Σ|real|. Se usa **WAPE y no MAPE** porque la demanda diaria
  tiene muchos ceros y el MAPE se dispara (división entre cero).

### 5.3 Resultados (dataset de 180 días)

| | MAE | RMSE | **WAPE** |
| --- | --- | --- | --- |
| **Modelo (Ridge, λ=1)** | 0,4612 | 0,6413 | **1,2623** |
| Línea base (EMA α=0,3) | 0,5008 | 0,7013 | 1,3706 |

**El modelo gana: −7,9 % de WAPE** (y también en MAE y RMSE).

Coeficientes aprendidos (intercepto = 0,2344):

| `media7` | `media28` | `pendiente` | `finde` |
| --- | --- | --- | --- |
| +0,0204 | +0,0697 | −0,0044 | +0,0877 |

**Interpretación:** el dummy de fin de semana (+0,088) y la media de 28 días (+0,070 por
unidad de demanda) son las variables que más empujan la predicción - coherente con que la
demanda la concentren los lives de TikTok. La `pendiente` entra con signo negativo y casi
nulo: en una serie de 180 días con ruido de Poisson la pendiente local es ruido, y la
regularización la encoge (es exactamente para lo que sirve λ).

### 5.4 Paridad Python ↔ Node

`server/ml/modelo.test.js` ejecuta `ml/entrenar.py` sobre un dataset sintético y compara
los coeficientes con la implementación en Node: **tolerancia 1e−6**. Así se garantiza que
el modelo entrenado en Colab y el que aplica el servidor son *el mismo modelo*. Hay dos
tests (λ = 1 y λ = 0); si la máquina no tiene `python`, se saltan con `t.skip()`.

---

## 6. Inferencia: qué devuelve el modelo

`GET /api/ml/pronostico` → `server/ml/inferencia.js`:

1. Reconstruye la serie diaria de cada SKU desde la base.
2. Pronosta **7 días de forma recursiva**: cada predicción se agrega al historial y
   alimenta las ventanas del día siguiente (los fines de semana se predicen con su dummy).
3. Convierte la demanda en **días hasta el quiebre** y una **sugerencia de reposición**:

```
demanda_diaria      = media(predicción_7d)
dias_hasta_quiebre  = stock_actual / demanda_diaria
sugerencia          = max(0, ⌈demanda_diaria × 7 + stock_minimo − stock_actual⌉)
```

4. Clasifica el **riesgo**:

| Nivel | Condición |
| --- | --- |
| `alto` | se agota en ≤ 7 días |
| `medio` | se agota en ≤ 14 días |
| `bajo` | no se agota en 14 días |
| `sin_datos` | la talla no registró demanda |

5. Asigna **confianza** según el volumen de la ventana: ≥ 30 ventas → alta, ≥ 10 → media,
   menos → baja.

La respuesta incluye `origen` (`artefacto` / `fallback-node`), las métricas del
backtest y el resumen (tallas en riesgo, unidades sugeridas, valor en soles).

---

## 7. Cómo re-entrenar el modelo

```bash
# 1. Regenerar el dataset desde la base de datos
cd server && node ml/exportar-dataset.js

# 2. Entrenar (en local o subiendo ml/dataset.json a Google Colab)
python ml/entrenar.py
#    → imprime coeficientes, métricas y si gana o no a la línea base
#    → escribe ml/modelo.json (se versiona en git)

# 3. Verificar que el servidor lo está usando
curl -s http://localhost:3001/api/ml/pronostico | jq .origen    # "artefacto"

# 4. Correr las pruebas (incluye la paridad Python ↔ Node)
cd server && npm test
```

> **Nota:** `ml/dataset.json` está en `.gitignore` porque la ventana se recorta en
> "hoy − 180 días" y cambia cada día. Se regenera con el paso 1. En cambio
> `ml/modelo.json` **sí se versiona**: es el que usa el servidor en producción.

---

## 8. Archivos

| Archivo | Qué hace |
| --- | --- |
| `server/ml/modelo.js` | OLS/Ridge a mano: estandarizador, Gauss-Jordan, predicción, métricas |
| `server/ml/features.js` | las 4 características + pronóstico recursivo |
| `server/ml/dataset.js` | arma la serie diaria y la tabla de entrenamiento desde la BD |
| `server/ml/evaluacion.js` | split temporal + línea base EMA + métricas por SKU |
| `server/ml/inferencia.js` | aplica `modelo.json` (o reentrena en Node) y calcula el riesgo |
| `server/ml/exportar-dataset.js` | `node ml/exportar-dataset.js` → `ml/dataset.json` |
| `server/ml/modelo.test.js` | 15 pruebas: matemática, features y **paridad Python ↔ Node** |
| `ml/entrenar.py` | entrenamiento scikit-learn (con respaldo en Python puro) |
| `ml/modelo.json` | **artefacto entrenado** (versionado) |
| `server/db/historial-ventas.js` | genera el histórico simulado y verifica el invariante |

---

## 9. API

| Endpoint | Descripción |
| --- | --- |
| `GET /api/ml/pronostico` | pronóstico 7 días por talla, días hasta el quiebre, sugerencia y riesgo |
| `GET /api/ml/evaluacion` | backtest: métricas del modelo y de la línea base, por SKU y global |
