-- ============================================================
-- Play One — Esquema de base de datos (PostgreSQL / Neon)
-- Ejecutar primero este archivo y luego seed.sql
-- ============================================================

DROP TABLE IF EXISTS envios CASCADE;
DROP TABLE IF EXISTS descuentos CASCADE;   -- tabla eliminada: el descuento vive en pedidos
DROP TABLE IF EXISTS estados_pedido CASCADE;
DROP TABLE IF EXISTS pedidos CASCADE;
DROP TABLE IF EXISTS movimientos_stock CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS skus CASCADE;
DROP TABLE IF EXISTS modelos CASCADE;
DROP TABLE IF EXISTS agencias CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- Usuarios del sistema (propietario y ayudante)
CREATE TABLE usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL,
  email         VARCHAR(120) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,              -- formato: scrypt$saltHex$hashHex
  rol           VARCHAR(20) NOT NULL DEFAULT 'ayudante'
                CHECK (rol IN ('propietario', 'ayudante')),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agencias de transporte (catálogo editable desde la web)
CREATE TABLE agencias (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL UNIQUE
);

-- Modelos de zapatillas de fútbol (única línea de negocio de Play One)
-- El precio (costo) se guarda aquí, con el producto (precio_base)
CREATE TABLE modelos (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  precio_base NUMERIC(10,2) NOT NULL CHECK (precio_base > 0),
  activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Stock por modelo × talla (90 líneas: 15 modelos × 6 tallas)
CREATE TABLE skus (
  id            SERIAL PRIMARY KEY,
  modelo_id     INTEGER NOT NULL REFERENCES modelos(id),
  talla         VARCHAR(5) NOT NULL,
  stock_actual  INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_minimo  INTEGER NOT NULL DEFAULT 5, -- alerta de reposición
  UNIQUE (modelo_id, talla)
);

-- Movimientos de inventario (entrada / salida / ajuste)
CREATE TABLE movimientos_stock (
  id         SERIAL PRIMARY KEY,
  sku_id     INTEGER NOT NULL REFERENCES skus(id),
  tipo       VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad   INTEGER NOT NULL CHECK (cantidad > 0),
  fecha      TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo     VARCHAR(200),
  pedido_id  INTEGER                          -- FK a pedidos se agrega después
);

-- Clientes (datos personales: acceso restringido, no se publican)
CREATE TABLE clientes (
  id               SERIAL PRIMARY KEY,
  nombre           VARCHAR(120) NOT NULL,
  dni              VARCHAR(12) NOT NULL,
  celular          VARCHAR(20) NOT NULL,
  distrito_destino VARCHAR(80) NOT NULL,
  agencia          VARCHAR(60) NOT NULL,       -- agencia de transporte
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pedidos (el precio vive en el producto: modelos.precio_base;
-- el descuento es opcional, monto fijo en soles.
-- La agencia es por pedido: el cliente puede cambiar de agencia
-- en cada envío. El comprobante de la agencia es opcional y se
-- agrega cuando el pedido está despachado.)
CREATE TABLE pedidos (
  id          SERIAL PRIMARY KEY,
  cliente_id  INTEGER NOT NULL REFERENCES clientes(id),
  sku_id      INTEGER NOT NULL REFERENCES skus(id),
  precio      NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  descuento   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  agencia     VARCHAR(60),
  comprobante VARCHAR(60),                    -- N° de comprobante de la agencia (opcional)
  estado      VARCHAR(20) NOT NULL DEFAULT 'contactado'
              CHECK (estado IN ('contactado', 'reservado', 'despachado', 'entregado')),
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE movimientos_stock
  ADD CONSTRAINT fk_movimientos_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id);

-- Historial de estados del embudo (auditoría de la trazabilidad)
CREATE TABLE estados_pedido (
  id          SERIAL PRIMARY KEY,
  pedido_id   INTEGER NOT NULL REFERENCES pedidos(id),
  estado      VARCHAR(20) NOT NULL
              CHECK (estado IN ('contactado', 'reservado', 'despachado', 'entregado')),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id  INTEGER REFERENCES usuarios(id)
);

-- Hojas de envío generadas en PDF
CREATE TABLE envios (
  id           SERIAL PRIMARY KEY,
  pedido_id    INTEGER NOT NULL UNIQUE REFERENCES pedidos(id),
  codigo       VARCHAR(20) NOT NULL UNIQUE,   -- p. ej. ENV-00042
  agencia      VARCHAR(60) NOT NULL,
  hoja_pdf_url TEXT,
  generado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices útiles
CREATE INDEX idx_skus_alerta       ON skus (stock_actual, stock_minimo);
CREATE INDEX idx_pedidos_estado    ON pedidos (estado);
CREATE INDEX idx_estados_pedido    ON estados_pedido (pedido_id, fecha);
CREATE INDEX idx_movimientos_sku   ON movimientos_stock (sku_id, fecha);
