# Play One - Guion de demo (sustentación)

Duración sugerida: **8-10 minutos**. Cubre lo que se evalúa en el Avance 3 (IA/ML +
reportes) y repasa el sistema completo para que se vea como un producto terminado.

## Antes de empezar (2 min)

1. **Despertar el servicio:** abre el link de Render. El plan Free duerme a los 15 min
   y el primer arranque tarda ~1 min. Si esperas a la demo, se ve el error.
   > Alternativa: correr en local (`npm start` en `server/` + `npm run build` en `client/`)
   > y usar el de Render sólo como respaldo.
2. **Abrir dos pestañas:** una con la app y otra con el panel de Render/Neon por si
   preguntan por la infraestructura.
3. **Tener a mano los usuarios:** `propietario` / `playone2026`.

## Guion

### 1. Problema y solución (1 min)

> Play One vende zapas de fútbol Adidas por TikTok Live y hoy lleva el stock en Excel y
> las hojas de envío a mano. El sistema reemplaza eso con inventario en tiempo real,
> un embudo de pedidos, y -lo nuevo en este avance- un **reporte semanal** y una
> **alerta predictiva** que dice de qué talla se va a quedar sin stock.

### 2. Login y dashboard (1 min)

- Entra con `propietario` / `playone2026`.
- Muestra las 4 tarjetas: tallas en stock, modelos, **bajo el mínimo** y
  **tallas en riesgo de quiebre (7 días)** - esta última viene del modelo.
- Señala la **alerta predictiva** debajo de las tarjetas: *«la talla KJ6711 · 40.5 ya está
  sin stock…»*.
- Resalta que el rojo **solo aparece en alertas** (bajo mínimo, riesgo alto, errores).

### 3. Reporte semanal (2 min) ← **corazón del Avance 3**

Pestaña **Reportes**:

1. **Semana en curso vs. anterior** (Semana 46 vs. 45) con la **tendencia** de cada
   indicador: unidades vendidas, ingresos, pedidos, pendientes, consultas sin stock,
   días hasta el próximo quiebre.
2. **Ventas por día** - la gráfica de barras muestra el pico de viernes/sábado
   (los lives de TikTok).
3. **Demanda perdida** - los intentos de compra que respondieron *409 sin stock*.
   > Para que haya datos: crear un pedido desde **Nuevo pedido** con una talla agotada
   > (por ejemplo `KJ6711 · 40.5`, que está en 0) y ver cómo queda registrado aquí.
4. **Alerta predictiva** - las 5 tallas más urgentes con stock, demanda/día, días hasta
   agotarse y sugerencia de reposición. El badge dice el **origen del modelo**
   (`artefacto` = entrenado con scikit-learn).

### 4. Qué hay por debajo del modelo (2 min) ← **si preguntan por IA/ML**

- **Dataset:** 180 días × 26 tallas = **3.952 filas**. *«El negocio no tenía histórico
  de ventas exportable, así que generamos uno **declarado como simulado**: misma
  estacionalidad de los lives (vie-dom ×2,5), tendencia +6 % y ruido de Poisson - y
  verificamos que el log cuadre **exactamente** con el stock real del Excel:
  0 desviaciones.»*
- **Modelo:** regresión **Ridge** (λ=1) con `StandardScaler`, las 4 características
  (`media7`, `media28`, `pendiente`, `finde`), entrenada en **scikit-learn**.
- **Evaluación honesta:** entrenamos con el pasado y probamos con el futuro
  (últimos 14 días). **WAPE 1,2623 vs. 1,3706 de la línea base → gana en un 7,9 %.**
- **MLOps:** entrenamiento *offline* → artefacto `ml/modelo.json` en git → el servidor
  sólo lo aplica. *«Si borramos el artefacto, el servidor se reentrena solo en Node y lo
  dice en la respuesta.»*
- **Pruebas:** `npm test` → 24 pruebas, incluidas dos que comparan los coeficientes de
  Python y Node con tolerancia 1e-6.

### 5. El resto del sistema (2-3 min)

Recorrido rápido por lo ya entregado:

- **Inventario:** alerta de stock mínimo por producto y por talla; casilla de
  disponibilidad (desmarcada → gris, no se vende).
- **Productos:** alta con solo código, producto y precio; nace con **todas las tallas
  desmarcadas**.
- **Clientes:** búsqueda por DNI, dirección obligatoria, DNI duplicado → 409.
- **Pedidos:** precio del producto, descuento opcional, agencia por pedido, dirección
  copiada del cliente (snapshot), baja de stock automática.
- **Embudo:** contactado → reservado → despachado → entregado, con fechas e historial.
- **Cancelación:** solo desde contactado/reservado, **devuelve la unidad al inventario**,
  motivo opcional, se puede reactivar. (Mostrarlo en la columna de *Cancelados*, que es
  una sección aparte y colapsada.)
- **409 sin stock:** intentar vender una talla agotada y ver el mensaje + el registro
  en el reporte.

### 6. Cierre (30 s)

> *«El sistema está desplegado en Render con la base en Neon, todo el costo es cero.
> Las pruebas están en `npm test` y la documentación técnica del modelo en
> `ml/README.md`.»*

## Preguntas esperadas y respuestas cortas

| Pregunta | Respuesta |
|---|---|
| ¿Los datos de ventas son reales? | **No: están simulados y así se declara.** La plantilla del Excel sólo traía stock. Lo que sí es real es que el log cuadra con el stock del Excel (invariante verificado). La métrica del modelo es válida internamente; la generalización queda pendiente de ventas reales. |
| ¿Por qué Ridge y no una red neuronal? | 180 días × 26 tallas es poco para una red; con Ridge hay interpretabilidad, 4 features y una línea base que vencer. Y la vencimos (7,9 % de WAPE). |
| ¿Qué es el WAPE? | Error absoluto total / demanda total. Lo usamos en vez del MAPE porque la demanda diaria tiene ceros y el MAPE se dispara. |
| ¿Cuánto cuesta? | S/ 0: Render Free + Neon Free. El Postgres de Render Free expira a 30 días, por eso la BD está en Neon. |
| ¿Y si se duerme el servicio? | El plan Free duerme a los 15 min; se abre el link ~1 min antes de la demo. |
| ¿Por qué el rojo aquí? | El rojo queda **solo** para alertas semánticas (stock bajo mínimo, riesgo alto, errores). La marca es azul `#0F70FF` sobre fondo `#FDFEFF`. |

## Respaldo si falla el deploy

```bash
cd server && npm install && npm run db:setup   # o db:migrate si no quieres borrar
npm start                                       # http://localhost:3001
cd ../client && npm install && npm run build    # Express sirve client/dist
```
