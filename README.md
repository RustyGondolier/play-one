# Play One — Sistema de gestión operativa

Prototipo web para la transformación digital de **Play One**, microempresa peruana que vende **zapatillas de fútbol** por canales digitales (captación en TikTok → ventas en WhatsApp → despacho por agencia).

El sistema es una **herramienta interna de gestión** (1–2 usuarios) que reemplaza el Excel y la hoja de envío manual con la que hoy opera el negocio.

## Módulos

| Módulo | Estado |
|--------|--------|
| Autenticación (propietario / ayudante) | ✅ |
| Inventario en tiempo real con alertas de stock mínimo | ✅ |
| Reposición de stock (entrada de mercadería con registro) | ✅ |
| Registro de productos nuevos (modelo, categoría, precio, tallas) | ✅ |
| Directorio de clientes con detección por DNI | ✅ |
| Registro de pedidos (precio del producto, descuento opcional fijo, baja de stock) | ✅ |
| Embudo de ventas (contactado → reservado → despachado → entregado) | ✅ |
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
│  │   ├─ schema.sql    # 9 tablas
│  │   └─ seed.sql      # datos de prueba (90 SKU, 60 pedidos, 2 usuarios)
│  ├─ routes/
│  │   ├─ auth.js       # POST /api/auth/login
│  │   ├─ skus.js       # GET /api/skus, POST /api/skus/:id/reponer
│  │   ├─ modelos.js    # GET/POST /api/modelos
│  │   ├─ clientes.js   # GET/POST /api/clientes, GET /api/clientes/:dni
│  │   └─ pedidos.js    # GET/POST /api/pedidos, PATCH /api/pedidos/:id/estado
│  └─ middleware/       # (pendiente)
├─ client/              # React + Vite
│  ├─ index.html
│  ├─ vite.config.js    # proxy /api → :3001
│  └─ src/
│     ├─ App.jsx        # rutas protegidas
│     ├─ api.js         # cliente fetch con token
│     ├─ pages/         # Login, Dashboard, PedidoNuevo, Pedidos, EnvioPdf,
│     │                 # Reportes, Clientes, ProductoNuevo
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
| GET | `/api/skus` | Los 90 SKU con precio del producto y `alerta` si está bajo el mínimo |
| POST | `/api/skus/:id/reponer` | Añade stock y registra el movimiento de entrada |
| GET | `/api/modelos` | Catálogo de productos con precio y stock total |
| POST | `/api/modelos` | Registra un producto nuevo con sus tallas y stock inicial |
| GET | `/api/clientes` | Directorio de clientes con su cantidad de pedidos |
| GET | `/api/clientes/:dni` | Busca un cliente por DNI (detecta clientes ya registrados) |
| POST | `/api/clientes` | Registra un cliente nuevo |
| GET | `/api/pedidos` | Lista de pedidos para el tablero del embudo |
| POST | `/api/pedidos` | Crea el pedido (cliente por DNI, precio del producto, descuento opcional, baja de stock) |
| PATCH | `/api/pedidos/:id/estado` | Avanza el estado del pedido en el embudo |

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
