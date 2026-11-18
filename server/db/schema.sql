-- ============================================================
-- Play One - Esquema de base de datos (PostgreSQL / Neon)
-- Ejecutar primero este archivo y luego seed.sql
-- ============================================================

DROP TABLE IF EXISTS envios CASCADE;
DROP TABLE IF EXISTS consultas_sin_stock CASCADE;
DROP TABLE IF EXISTS descuentos CASCADE;   -- tabla eliminada: el descuento vive en pedidos
DROP TABLE IF EXISTS estados_pedido CASCADE;
DROP TABLE IF EXISTS pedidos CASCADE;
DROP TABLE IF EXISTS movimientos_stock CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS skus CASCADE;
DROP TABLE IF EXISTS modelos CASCADE;
DROP TABLE IF EXISTS tallas CASCADE;
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

-- Catálogo de tallas registradas con sus equivalentes
-- (PEG = talla que usa el negocio; USA y cm según la tabla de
--  conversión de la plantilla "STOCK EN ESTUDIO")
CREATE TABLE tallas (
  id    SERIAL PRIMARY KEY,
  peg   NUMERIC(4,1) NOT NULL UNIQUE,   -- talla PEG/EUR (35.5, 36.5, 38...)
  usa   NUMERIC(4,1),                   -- equivalente USA
  cm    NUMERIC(4,1),                   -- equivalente en centímetros
  orden NUMERIC(5,1) NOT NULL           -- para listar de menor a mayor
);

-- Modelos de zapatillas de fútbol (solo Adidas; única línea de negocio)
-- El precio (costo) se guarda aquí, con el producto (precio_base).
-- stock_minimo_default es el mínimo del producto: se usa para las
-- tallas nuevas y se puede propagar a todas las tallas con un clic.
CREATE TABLE modelos (
  id                  SERIAL PRIMARY KEY,
  codigo              VARCHAR(20) NOT NULL UNIQUE,  -- código del producto (p.ej. KJ3418)
  nombre              VARCHAR(120) NOT NULL UNIQUE,
  precio_base         NUMERIC(10,2) NOT NULL CHECK (precio_base > 0),
  stock_minimo_default INTEGER NOT NULL DEFAULT 1,
  activo              BOOLEAN NOT NULL DEFAULT TRUE
);

-- Stock por modelo × talla. "disponible" es la casilla por talla:
-- marcada = se puede vender/conseguir; desmarcada = la talla aparece
-- gris, no se puede vender y no genera alerta aunque esté en 0.
CREATE TABLE skus (
  id            SERIAL PRIMARY KEY,
  modelo_id     INTEGER NOT NULL REFERENCES modelos(id),
  talla_id      INTEGER NOT NULL REFERENCES tallas(id),
  stock_actual  INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_minimo  INTEGER NOT NULL DEFAULT 1, -- alerta de reposición
  disponible     BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (modelo_id, talla_id)
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
-- distrito_destino = distrito/ciudad; direccion = dirección exacta
-- donde se entrega el pedido.
CREATE TABLE clientes (
  id               SERIAL PRIMARY KEY,
  nombre           VARCHAR(120) NOT NULL,
  dni              VARCHAR(12) NOT NULL UNIQUE,
  celular          VARCHAR(20) NOT NULL,
  distrito_destino VARCHAR(80) NOT NULL,
  direccion        VARCHAR(200) NOT NULL DEFAULT '',
  agencia          VARCHAR(60) NOT NULL,       -- agencia de transporte
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pedidos (el precio vive en el producto: modelos.precio_base;
-- el descuento es opcional, monto fijo en soles.
-- La agencia es por pedido: el cliente puede cambiar de agencia
-- en cada envío. El comprobante de la agencia es opcional y se
-- agrega cuando el pedido está despachado.)
-- Agencia, destino y dirección se guardan COPIADOS del cliente al
-- crear el pedido: si el cliente se muda después, los pedidos viejos
-- conservan la dirección con la que se entregaron.
-- 'cancelado': el cliente se arrepiente ANTES del despacho (contactado
-- o reservado); al cancelar la unidad vuelve al inventario y el motivo
-- se guarda en motivo_cancelacion (opcional). No aplica a despachados.
CREATE TABLE pedidos (
  id                 SERIAL PRIMARY KEY,
  cliente_id         INTEGER NOT NULL REFERENCES clientes(id),
  sku_id             INTEGER NOT NULL REFERENCES skus(id),
  precio             NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  descuento          NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  agencia            VARCHAR(60),
  distrito_destino   VARCHAR(80) NOT NULL DEFAULT '',
  direccion          VARCHAR(200) NOT NULL DEFAULT '',
  comprobante        VARCHAR(60),                    -- N° de comprobante de la agencia (opcional)
  motivo_cancelacion VARCHAR(200) NOT NULL DEFAULT '', -- por qué se canceló (opcional)
  estado             VARCHAR(20) NOT NULL DEFAULT 'contactado'
                     CHECK (estado IN ('contactado', 'reservado', 'despachado', 'entregado', 'cancelado')),
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE movimientos_stock
  ADD CONSTRAINT fk_movimientos_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id);

-- Historial de estados del embudo (auditoría de la trazabilidad)
CREATE TABLE estados_pedido (
  id          SERIAL PRIMARY KEY,
  pedido_id   INTEGER NOT NULL REFERENCES pedidos(id),
  estado      VARCHAR(20) NOT NULL
              CHECK (estado IN ('contactado', 'reservado', 'despachado', 'entregado', 'cancelado')),
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

-- Intentos de pedido que quedaron SIN STOCK (el 409 de POST /api/pedidos).
-- Materia prima del reporte semanal: demanda perdida por faltante.
-- 'producto' es un snapshot ("Código · Talla") para poder mostrarlo
-- aunque el catálogo cambie.
CREATE TABLE consultas_sin_stock (
  id        SERIAL PRIMARY KEY,
  sku_id    INTEGER NOT NULL REFERENCES skus(id),
  motivo    VARCHAR(20) NOT NULL DEFAULT 'sin_stock'
            CHECK (motivo IN ('sin_stock', 'no_disponible')),
  producto  VARCHAR(120) NOT NULL,
  fecha     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices útiles
CREATE INDEX idx_skus_alerta       ON skus (stock_actual, stock_minimo);
CREATE INDEX idx_pedidos_estado    ON pedidos (estado);
CREATE INDEX idx_estados_pedido    ON estados_pedido (pedido_id, fecha);
CREATE INDEX idx_movimientos_sku   ON movimientos_stock (sku_id, fecha);
