-- ============================================================
-- Play One — Migración v2 (NO borra datos)
-- Se puede ejecutar más de una vez (es idempotente).
-- Uso: npm run db:migrate   (desde la carpeta server/)
-- ============================================================

-- 1) Producto: stock mínimo base (propagable a sus tallas)
ALTER TABLE modelos
  ADD COLUMN IF NOT EXISTS stock_minimo_default INTEGER NOT NULL DEFAULT 1;

-- 2) Cliente: dirección exacta de entrega
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS direccion VARCHAR(200) NOT NULL DEFAULT '';

-- 3) Pedido: destino y dirección copiados del cliente al crearlo
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS distrito_destino VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS direccion VARCHAR(200) NOT NULL DEFAULT '';

-- 4) Duplicado de DNI también protegido a nivel de base de datos
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_dni ON clientes (dni);

-- 5) Relleno: los pedidos sin dirección (los existentes) heredan
--    la dirección actual de su cliente. Los que ya tienen dirección
--    NO se tocan: así nunca se pisa un snapshot ya guardado.
UPDATE pedidos p
   SET distrito_destino = c.distrito_destino,
       direccion        = c.direccion
  FROM clientes c
 WHERE c.id = p.cliente_id
   AND p.direccion = '';

-- 6) El stock mínimo base del producto nace igual a sus tallas
UPDATE modelos m
   SET stock_minimo_default = (
         SELECT COALESCE(MIN(s.stock_minimo), 1)
           FROM skus s WHERE s.modelo_id = m.id
       )
 WHERE NOT EXISTS (SELECT 1 FROM modelos m2 WHERE m2.id = m.id);

-- 7) Estado 'cancelado': el cliente se arrepiente ANTES del despacho.
--    Se amplían los CHECK de ambas tablas (se quita y se vuelve a crear
--    la restricción para que también cubra los pedidos ya existentes).
ALTER TABLE pedidos
  DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE pedidos
  ADD CONSTRAINT pedidos_estado_check
  CHECK (estado IN ('contactado', 'reservado', 'despachado', 'entregado', 'cancelado'));

ALTER TABLE estados_pedido
  DROP CONSTRAINT IF EXISTS estados_pedido_estado_check;
ALTER TABLE estados_pedido
  ADD CONSTRAINT estados_pedido_estado_check
  CHECK (estado IN ('contactado', 'reservado', 'despachado', 'entregado', 'cancelado'));

-- 8) Motivo de la cancelación (opcional, texto libre)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS motivo_cancelacion VARCHAR(200) NOT NULL DEFAULT '';

-- 9) Consultas que quedaron SIN STOCK (409 de POST /api/pedidos).
--    Es la materia prima del reporte semanal: cuánta demanda se
--    perdió por no tener la talla, y de qué producto era.
CREATE TABLE IF NOT EXISTS consultas_sin_stock (
  id          SERIAL PRIMARY KEY,
  sku_id      INTEGER NOT NULL REFERENCES skus(id),
  motivo      VARCHAR(20) NOT NULL DEFAULT 'sin_stock'
              CHECK (motivo IN ('sin_stock', 'no_disponible')),
  producto    VARCHAR(120) NOT NULL,   -- snapshot: "Código · Talla"
  fecha       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consultas_fecha
  ON consultas_sin_stock (fecha);
