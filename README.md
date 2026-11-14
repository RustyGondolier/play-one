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
| Agencias de transporte editables (catálogo + alta desde el pedido) | ✅ |
| Registro de pedidos (precio del producto, descuento opcional fijo, agencia por pedido, baja de stock) | ✅ |
| Embudo de ventas con fechas de registro/cambio de estado y filtros | ✅ |
| Comprobante de agencia opcional al despachar | ✅ |
| Hoja de envío en PDF | ⏳ pendiente |
| Reporte semanal + alerta predictiva de reposición (ML) | ⏳ pendiente |

## Stack

- **Backend:** Node.js + Express (ESM), PostgreSQL con `pg`
- **Base de datos:** [Neon](https://neon.tech) (plan gratuito; no se pausa por inactividad)
- **Deploy:** [Render](https://render.com) (plan gratuito)
- **Frontend:** React 18 + Vite, react-router-dom, CSS puro (carpeta `client/`)

## Estructura

```
play-one/
├─ server/
│  ├─ index.js          # app Express (puerto 3001)
│  ├─ package.json
│  ├─ db/
│  │   ├─ pool.js       # conexión a Neon (DATABASE_URL)
│  │   ├─ schema.sql    # 10 tablas
│  │   └─ seed.sql      # catálogo real Adidas (23 productos, 276 SKU),
│  │                     # tallas con equivalentes, 60 pedidos, 2 usuarios
│  ├─ routes/
│  │   ├─ auth.js       # POST /api/auth/login
│  │   ├─ skus.js       # GET /api/skus, PATCH /:id (disponible), POST /:id/reponer
│  │   ├─ modelos.js    # GET/POST /api/modelos (con detalle de tallas)
│  │   ├─ clientes.js   # GET/POST /api/clientes, GET /api/clientes/:dni
│  │   ├─ agencias.js   # GET/POST /api/agencias
│  │   └─ pedidos.js    # GET/POST /api/pedidos, PATCH /:id/estado, PATCH /:id/comprobante
│  └─ middleware/       # (pendiente)
├─ client/              # React + Vite
│  ├─ index.html
│  ├─ vite.config.js    # proxy /api → :3001
│  └─ src/
│     ├─ App.jsx        # rutas protegidas
│     ├─ api.js         # cliente fetch con token
│     ├─ pages/         # Login, Dashboard, PedidoNuevo, Pedidos, EnvioPdf,
│     │                 # Reportes, Clientes, Productos
│     └─ components/    # Layout (menú), AlertaBadge
├─ ml/                  # alerta predictiva (pendiente)
├─ docs/                # informes y evidencias
├─ .env.example         # plantilla de variables de entorno
└─ README.md
```

## Puesta en marcha

### 1. Base de datos (Neon)

1. Crea una cuenta en [console.neon.tech](https://console.neon.tech) y crea un proyecto (plan Free).
2. Copia la **connection string** (busca `sslmode=require`).
3. En el SQL Editor de Neon ejecuta primero `server/db/schema.sql` y luego `server/db/seed.sql`.
   El seed trae el **catálogo real del negocio** (23 productos Adidas de fútbol con su código,
   12 tallas con equivalentes PEG/USA/cm y el stock de la plantilla Excel del curso).

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

### 5. Probar

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
| PATCH | `/api/skus/:id` | Marca/desmarca la casilla de disponibilidad de la talla |
| POST | `/api/skus/:id/reponer` | Añade stock y registra el movimiento de entrada |
| GET | `/api/modelos` | Catálogo con código, precio, stock y detalle de tallas (disponible/alerta) |
| POST | `/api/modelos` | Registra un producto (código, producto, precio) con las tallas desmarcadas |
| GET | `/api/clientes` | Directorio de clientes con su cantidad de pedidos |
| GET | `/api/clientes/:dni` | Busca un cliente por DNI (detecta clientes ya registrados) |
| POST | `/api/clientes` | Registra un cliente nuevo |
| GET | `/api/agencias` | Catálogo de agencias de transporte |
| POST | `/api/agencias` | Agrega una agencia de transporte |
| GET | `/api/pedidos` | Pedidos con código, agencia, comprobante, fecha de registro e historial de estados |
| POST | `/api/pedidos` | Crea el pedido (cliente por DNI, valida talla disponible, agencia del pedido, descuento opcional, baja de stock) |
| PATCH | `/api/pedidos/:id/estado` | Avanza el estado del pedido en el embudo |
| PATCH | `/api/pedidos/:id/comprobante` | Guarda el comprobante de la agencia (solo despachado/entregado, opcional) |

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
