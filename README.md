# Play One — Sistema de gestión operativa

Prototipo web para la transformación digital de **Play One**, microempresa peruana que vende **zapatillas de fútbol** por canales digitales (captación en TikTok → ventas en WhatsApp → despacho por agencia).

El sistema es una **herramienta interna de gestión** (1–2 usuarios) que reemplaza el Excel y la hoja de envío manual con la que hoy opera el negocio.

## Módulos

| Módulo | Estado |
|--------|--------|
| Autenticación (propietario / ayudante) | ✅ |
| Inventario en tiempo real con alertas de stock mínimo | ✅ |
| Reposición de stock por talla (entrada de mercadería con registro) | ✅ |
| Catálogo real de zapatillas Adidas de fútbol: código, precio, tallas con equivalentes PEG/USA/cm y filtros | ✅ |
| Disponibilidad por talla (casilla: desmarcada → gris, no se vende y no genera alerta) | ✅ |
| Directorio de clientes con detección por DNI | ✅ |
| Edición de clientes (incluido el DNI con control de duplicado) | ✅ |
| Dirección exacta de entrega en el cliente (obligatoria) y copiada al pedido | ✅ |
| Stock mínimo editable: por producto (aplica a todas sus tallas) y por talla | ✅ |
| Agencias de transporte editables (catálogo + alta desde el pedido) | ✅ |
| Registro de pedidos (precio del producto, descuento opcional fijo, agencia por pedido, dirección de entrega, baja de stock) | ✅ |
| Embudo de ventas con fechas de registro/cambio de estado y filtros | ✅ |
| Comprobante de agencia opcional al despachar | ✅ |
| Cancelación de pedidos con devolución de stock al inventario y motivo | ✅ |
| Hoja de envío en PDF | ⏳ pendiente |
| Reporte semanal (indicadores vs. semana anterior + ventas por día) | ✅ |
| Alerta predictiva de reposición (ML: Ridge sobre 180 días) | ✅ |
| Registro de demanda perdida (intentos de compra sin stock) | ✅ |
| Deploy en Render (S/ 0) | ✅ |

## Stack

- **Backend:** Node.js + Express (ESM), PostgreSQL con `pg`
- **Base de datos:** [Neon](https://neon.tech) (plan gratuito)
- **Deploy:** [Render](https://render.com) (plan gratuito)
- **Frontend:** React 18 + Vite, react-router-dom, CSS puro (carpeta `client/`)
- **IA/ML:** scikit-learn (`Ridge` + `StandardScaler`) entrenado **offline** →
  artefacto `ml/modelo.json` que el servidor sólo aplica. Respaldo en Node puro si el
  artefacto falta. Detalles en [`ml/README.md`](ml/README.md).
- **Pruebas:** `node --test` (24 pruebas: generador de histórico + módulo ML con paridad
  Python ↔ Node)

## Estructura

```
play-one/
├─ server/
│  ├─ index.js          # app Express (puerto 3001)
│  ├─ package.json      # scripts: start, dev, db:setup, db:migrate, test
│  ├─ db/
│  │   ├─ pool.js             # conexión a Neon (DATABASE_URL)
│  │   ├─ schema.sql          # 11 tablas
│  │   ├─ seed.sql            # catálogo real Adidas (23 productos, 276 SKU),
│  │   │                       # tallas con equivalentes, 64 pedidos (4 cancelados)
│  │   ├─ historial-ventas.js  # genera 180 días de demanda simulada y verifica
│  │   │                       #   Σentradas − Σsalidas = stock_actual
│  │   ├─ historial-ventas.test.js
│  │   ├─ migracion-v2.sql    # columnas nuevas SIN borrar datos (idempotente)
│  │   ├─ setup.js            # npm run db:setup  (recrea todo: BORRA datos)
│  │   └─ migrate.js          # npm run db:migrate (aplica migración: NO borra)
│  ├─ ml/               # módulo de pronóstico (Node puro, sin dependencias)
│  │   ├─ modelo.js       # OLS/Ridge a mano: scaler, Gauss-Jordan, métricas
│  │   ├─ features.js     # media7, media28, pendiente, finde + pronóstico recursivo
│  │   ├─ dataset.js      # serie diaria de ventas y tabla de entrenamiento
│  │   ├─ evaluacion.js   # split temporal + línea base EMA + métricas
│  │   ├─ inferencia.js   # aplica ml/modelo.json (o reentrena) → riesgo de quiebre
│  │   ├─ exportar-dataset.js
│  │   └─ modelo.test.js  # 15 pruebas incl. paridad Python ↔ Node
│  └─ routes/
│      ├─ auth.js       # POST /api/auth/login
│      ├─ skus.js       # GET /api/skus, PATCH /:id (disponible, stock_minimo), POST /:id/reponer
│      ├─ modelos.js    # GET/POST /api/modelos, PATCH /:id (stock mínimo del producto)
│      ├─ clientes.js   # GET/POST /api/clientes, GET /:dni, PATCH /:id (con DNI duplicado → 409)
│      ├─ agencias.js   # GET/POST /api/agencias
│      ├─ pedidos.js    # GET/POST /api/pedidos, PATCH /:id/estado, /cancelar, /reactivar, /comprobante
│      ├─ ml.js         # GET /api/ml/pronostico, GET /api/ml/evaluacion
│      └─ reportes.js   # GET /api/reportes/semanal
├─ client/              # React + Vite
│  ├─ index.html
│  ├─ vite.config.js    # proxy /api → :3001
│  └─ src/
│     ├─ App.jsx        # rutas protegidas
│     ├─ api.js         # cliente fetch con token
│     ├─ pages/         # Login, Dashboard, PedidoNuevo, Pedidos, EnvioPdf,
│     │                 # Reportes, Clientes, Productos
│     └─ components/    # Layout (menú), AlertaBadge
├─ ml/                  # entrenamiento offline (Python/scikit-learn)
│  ├─ entrenar.py       #   Pipeline(StandardScaler, Ridge) → ml/modelo.json
│  ├─ modelo.json       #   artefacto entrenado (versionado en git)
│  ├─ dataset.json      #   exportado desde la BD (regenerable, en .gitignore)
│  └─ README.md         # doc técnica: fórmulas, features, métricas, resultados
├─ docs/                # diagrama de arquitectura y guía de la demo
├─ render.yaml          # definición del deploy en Render
├─ .env.example         # plantilla de variables de entorno
└─ README.md
```

## Puesta en marcha

### 1. Base de datos (Neon)

1. Crea una cuenta en [console.neon.tech](https://console.neon.tech) y crea un proyecto (plan Free).
2. Copia la **connection string** (busca `sslmode=require`).
3. Ejecuta el setup completo desde `server/`:

```bash
npm run db:setup     # schema.sql + seed.sql + histórico de ventas (BORRA datos)
```

El seed trae el **catálogo real del negocio** (23 productos Adidas de fútbol con su código,
12 tallas con equivalentes PEG/USA/cm y el stock de la plantilla Excel del curso) y después
`historial-ventas.js` genera los **180 días de demanda** que usa el modelo ML, verificando
que el log cuadre con el stock real.

> **Migraciones sin borrar datos:** si la base ya existe y solo quieres aplicar los cambios
> nuevos, ejecuta `npm run db:migrate` (desde `server/`). Aplica `db/migracion-v2.sql`,
> que es idempotente (se puede correr varias veces) y **nunca borra datos**.
> `npm run db:setup`, en cambio, recrea todo y **sí borra** lo que haya.
>
> La v2 agrega: `modelos.stock_minimo_default`, `clientes.direccion`,
> `pedidos.distrito_destino` / `pedidos.direccion`, el índice de DNI único, el estado
> **`cancelado`** (con `pedidos.motivo_cancelacion`) y la tabla **`consultas_sin_stock`**
> (demanda perdida que alimenta el reporte semanal).

### 2. Variables de entorno

En la raíz del proyecto:

```bash
cp .env.example .env
# edita .env y pega tu DATABASE_URL
```

### 3. Servidor

```bash
cd server
npm install
npm run dev        # modo desarrollo (reinicia ante cambios)
# o
npm start          # modo producción
```

### 4. Frontend

```bash
cd client
npm install
npm run dev        # http://localhost:5173 (con proxy al backend)
# o, para verlo junto al backend en el puerto 3001:
npm run build      # Express sirve client/dist
```

### 5. Modelo ML (solo si quieres re-entrenar)

```bash
cd server && node ml/exportar-dataset.js   # → ml/dataset.json
cd .. && python ml/entrenar.py             # → ml/modelo.json (scikit-learn)
```

El repositorio ya incluye `ml/modelo.json` entrenado: **no hace falta** para usar la app.
Si falta, el servidor reentrena en Node puro y lo marca `"origen": "fallback-node"`.
Ver [`ml/README.md`](ml/README.md).

### 6. Pruebas

```bash
cd server
npm test           # node --test: 24 pruebas (histórico + ML + paridad Python↔Node)
```

Los dos tests de paridad ejecutan `python ml/entrenar.py`; si la máquina no tiene
Python se saltan automáticamente (`t.skip()`).

### 7. Probar

```bash
# Login (usuarios del seed)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"propietario","password":"playone2026"}'

# Stock con alertas
curl http://localhost:3001/api/skus
```

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Devuelve un token JWT (8 h) |
| GET | `/api/skus` | Tallas disponibles a la venta con código, equivalencias USA/cm y `alerta` |
| PATCH | `/api/skus/:id` | Marca/desmarca la casilla de disponibilidad de la talla, o cambia su `stock_minimo` |
| POST | `/api/skus/:id/reponer` | Añade stock y registra el movimiento de entrada |
| GET | `/api/modelos` | Catálogo con código, precio, stock mínimo base y detalle de tallas (disponible/alerta/mínimo) |
| POST | `/api/modelos` | Registra un producto (código, producto, precio) con las tallas desmarcadas |
| PATCH | `/api/modelos/:id` | Cambia el stock mínimo del producto; con `aplicar_a_todas` lo propaga a sus tallas |
| GET | `/api/clientes` | Directorio de clientes (con dirección) y su cantidad de pedidos |
| GET | `/api/clientes/:dni` | Busca un cliente por DNI (detecta clientes ya registrados) |
| POST | `/api/clientes` | Registra un cliente nuevo (dirección obligatoria; DNI duplicado → 409) |
| PATCH | `/api/clientes/:id` | Editar cliente (nombre, DNI, celular, destino, dirección, agencia); DNI duplicado → 409 |
| GET | `/api/agencias` | Catálogo de agencias de transporte |
| POST | `/api/agencias` | Agrega una agencia de transporte |
| GET | `/api/pedidos` | Pedidos con código, agencia, dirección de entrega, comprobante, motivo de cancelación, fechas e historial |
| POST | `/api/pedidos` | Crea el pedido (cliente por DNI, valida talla disponible, agencia y dirección copiadas del cliente, descuento opcional, baja de stock) |
| PATCH | `/api/pedidos/:id/estado` | Avanza el estado del pedido en el embudo (rechaza `cancelado`: usar el endpoint de cancelar) |
| PATCH | `/api/pedidos/:id/cancelar` | Cancela un pedido contactado/reservado, guarda el motivo opcional y **devuelve la unidad al inventario** |
| PATCH | `/api/pedidos/:id/reactivar` | Deshace una cancelación: vuelve al estado previo y descuenta la unidad otra vez |
| PATCH | `/api/pedidos/:id/comprobante` | Guarda el comprobante de la agencia (solo despachado/entregado, opcional) |
| GET | `/api/ml/pronostico` | Pronóstico de demanda 7 días por talla, días hasta el quiebre, sugerencia de reposición y nivel de riesgo |
| GET | `/api/ml/evaluacion` | Backtest del modelo: MAE/RMSE/WAPE vs. línea base, global y por SKU |
| GET | `/api/reportes/semanal` | Indicadores de la semana vs. la anterior con tendencia, ventas por día, demanda perdida y tallas en riesgo |

> Los intentos de compra que responden **409** (sin stock o talla no disponible) quedan
> registrados en `consultas_sin_stock` y aparecen en el reporte semanal como
> *demanda perdida*.

## Deploy (Render + Neon, S/ 0)

El proyecto trae [`render.yaml`](render.yaml): crea el servicio en
[render.com](https://render.com) con **New → Blueprint** y apunta al repositorio.
La BD se queda en **Neon** (el Postgres de Render Free expira a 30 días).

| Servicio | Plan | Notas |
|----------|------|-------|
| Web Service (Node) | Free | 750 h/mes; **duerme a los 15 min** → cold start ≈ 1 min |
| Neon Postgres | Free | scale-to-zero a 5 min; la BD de este proyecto mide ~9 MB de 1 GB |

**Antes de una demo:** abre el link una vez para despertar el servicio (tarda ~1 min).
Ver [`docs/DEMO.md`](docs/DEMO.md) para el guion de la sustentación.

## Usuarios de prueba (seed)

| Identificador (`email`) | Contraseña | Rol |
|---------|------------|-----|
| `propietario` | playone2026 | propietario |
| `ayudante` | playone2026 | ayudante |

> No hay dominio propio ni verificación de correo: el campo `email` se usa como usuario simple.

## Cronograma (Avance 3 — Semana 15)

| Semana | Entregable |
|--------|------------|
| 12 | Auth + dashboard de stock con alertas |
| 13 | Registro de pedidos con baja de stock |
| 14 | PDF de envío + kanban del embudo + descuentos auditados |
| 15 | Reporte semanal + alerta ML + deploy en Render + demo + informe |

## Contexto académico

Innovación y Transformación Digital — Grupo 7, Ingeniería de Sistemas e Informática (UNSA, 2026). Avance de Proyecto Final 3.
