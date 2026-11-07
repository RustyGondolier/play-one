-- ============================================================
-- Play One — Datos de prueba
-- Ejecutar DESPUÉS de schema.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Usuarios (sin dominio propio: identificadores simples,
--    sin verificación de correo. Contraseña de ambos: "playone2026")
-- ------------------------------------------------------------
INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES
  ('Propietario Play One', 'propietario',
   'scrypt$8beba715f50389d403e42e34bd404280$5420376b07ecda8a1397ae58960c6b2b1e999baece66d5a7d487ebabf48cf0faccffaab5ae7f893a29cea0376a50f84a4fdbf4c2535533e1905cfada942c023c',
   'propietario'),
  ('Ayudante Play One', 'ayudante',
   'scrypt$8beba715f50389d403e42e34bd404280$5420376b07ecda8a1397ae58960c6b2b1e999baece66d5a7d487ebabf48cf0faccffaab5ae7f893a29cea0376a50f84a4fdbf4c2535533e1905cfada942c023c',
   'ayudante');

-- ------------------------------------------------------------
-- 2. Catálogo: 15 modelos
-- ------------------------------------------------------------
INSERT INTO modelos (nombre, categoria, precio_base) VALUES
  ('Runner Pro 90',      'running',  129.90),
  ('Sprint Flow',        'running',  119.90),
  ('Marathon Elite',     'running',  159.90),
  ('Cloud Cushion',      'running',  139.90),
  ('Trail Grip',         'running',  149.90),
  ('Street Classic',     'urbano',    99.90),
  ('Urban High',         'urbano',   119.90),
  ('Retro Court',        'urbano',   109.90),
  ('Skate Board',        'urbano',   105.90),
  ('Canvas Low',         'urbano',    79.90),
  ('Train X',            'training', 125.90),
  ('Lift Support',       'training', 135.90),
  ('Flex Step',          'training', 115.90),
  ('Cross Fit One',      'training', 145.90),
  ('Kids Runner',        'kids',      69.90);

-- ------------------------------------------------------------
-- 3. Stock: 90 SKU (15 modelos × 6 tallas, 37-42)
--    Algunos quedan por debajo del mínimo (5) para ver las alertas
-- ------------------------------------------------------------
INSERT INTO skus (modelo_id, talla, stock_actual, stock_minimo)
SELECT m.id,
       (36 + t.n)::text,
       ((m.id * 17 + t.n * 11) % 40),   -- 0 a 39 unidades
       5
  FROM modelos m
  CROSS JOIN (SELECT generate_series(1, 6) AS n) t;

-- ------------------------------------------------------------
-- 4. Movimiento inicial de inventario (explica el stock actual)
-- ------------------------------------------------------------
INSERT INTO movimientos_stock (sku_id, tipo, cantidad, motivo)
SELECT s.id, 'entrada', s.stock_actual + 10, 'Carga inicial de inventario'
  FROM skus s;

-- ------------------------------------------------------------
-- 5. Clientes
-- ------------------------------------------------------------
INSERT INTO clientes (nombre, dni, celular, distrito_destino, agencia) VALUES
  ('María Quispe',      '45678912', '987654321', 'Arequipa',    'Olva Courier'),
  ('Juan Rojas',        '41234567', '912345678', 'Lima',        'Shalom'),
  ('Lucía Flores',      '46789012', '998877665', 'Cusco',       'Olva Courier'),
  ('Carlos Medina',     '42345678', '976543210', 'Trujillo',    'Epack'),
  ('Ana Torres',        '48901234', '965432108', 'Piura',       'Shalom'),
  ('Luis Mendoza',      '43456789', '954321097', 'Arequipa',    'Olva Courier'),
  ('Rosa Paredes',      '49012345', '943210986', 'Chiclayo',    'Epack'),
  ('Diego Castillo',    '44567890', '932109875', 'Arequipa',    'Olva Courier');

-- ------------------------------------------------------------
-- 6. 60 pedidos de prueba con su estado del embudo
-- ------------------------------------------------------------
INSERT INTO pedidos (cliente_id, sku_id, precio, estado, creado_en)
SELECT 1 + (g % 8) AS cliente_id,
       s.id        AS sku_id,
       m.precio_base AS precio,
       CASE WHEN g % 10 IN (0, 1) THEN 'contactado'
            WHEN g % 10 IN (2, 3) THEN 'reservado'
            WHEN g % 10 IN (4, 5) THEN 'despachado'
            ELSE 'entregado' END AS estado,
       now()
         - ((g % 30) || ' days')::interval
         - ((g % 24) || ' hours')::interval AS creado_en
  FROM generate_series(1, 60) AS g
  JOIN skus s     ON s.id = 1 + ((g * 7) % 90)
  JOIN modelos m  ON m.id = s.modelo_id
 ORDER BY g;

-- ------------------------------------------------------------
-- 7. Historial de estados (auditoría del embudo)
-- ------------------------------------------------------------
INSERT INTO estados_pedido (pedido_id, estado, fecha, usuario_id)
SELECT p.id, 'contactado', p.creado_en, 1 FROM pedidos p;

INSERT INTO estados_pedido (pedido_id, estado, fecha, usuario_id)
SELECT p.id, 'reservado', p.creado_en + interval '6 hours', 1
  FROM pedidos p WHERE p.estado IN ('reservado', 'despachado', 'entregado');

INSERT INTO estados_pedido (pedido_id, estado, fecha, usuario_id)
SELECT p.id, 'despachado', p.creado_en + interval '1 day', 1
  FROM pedidos p WHERE p.estado IN ('despachado', 'entregado');

INSERT INTO estados_pedido (pedido_id, estado, fecha, usuario_id)
SELECT p.id, 'entregado', p.creado_en + interval '4 days', 1
  FROM pedidos p WHERE p.estado = 'entregado';

-- ------------------------------------------------------------
-- 8. Descuentos aplicados en lives (2 de cada 3 pedidos)
-- ------------------------------------------------------------
INSERT INTO descuentos (pedido_id, tipo, monto, fecha_live)
SELECT p.id,
       CASE WHEN p.id % 7 = 0 THEN 'talla_exclusiva'
            WHEN p.id % 7 = 1 THEN 'modelo_unico'
            ELSE 'transmision' END,
       (p.id % 4 + 1) * 5.00,          -- S/ 5 a S/ 20
       p.creado_en::date
  FROM pedidos p
 WHERE p.id % 3 = 0;

-- ------------------------------------------------------------
-- 9. Envíos (para pedidos despachados y entregados)
-- ------------------------------------------------------------
INSERT INTO envios (pedido_id, codigo, agencia, generado_en)
SELECT p.id,
       'ENV-' || lpad(p.id::text, 5, '0'),
       c.agencia,
       p.creado_en + interval '1 day'
  FROM pedidos p
  JOIN clientes c ON c.id = p.cliente_id
 WHERE p.estado IN ('despachado', 'entregado');

-- Resumen
SELECT (SELECT count(*) FROM usuarios)  AS usuarios,
       (SELECT count(*) FROM modelos)   AS modelos,
       (SELECT count(*) FROM skus)      AS skus,
       (SELECT count(*) FROM skus WHERE stock_actual < stock_minimo) AS skus_en_alerta,
       (SELECT count(*) FROM clientes)  AS clientes,
       (SELECT count(*) FROM pedidos)   AS pedidos,
       (SELECT count(*) FROM descuentos) AS descuentos,
       (SELECT count(*) FROM envios)    AS envios;
