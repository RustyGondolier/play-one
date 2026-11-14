-- ============================================================
-- Play One — Datos iniciales (zapatillas de fútbol Adidas)
-- Productos, códigos y tallas tomados de la plantilla
-- "PLANTILLAS PLAYONE.xlsx" (hojas STOCK COMPARTIDO y
-- STOCK EN ESTUDIO). Ejecutar DESPUÉS de schema.sql
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
-- 2. Tallas registradas con sus equivalentes
--    PEG/USA/cm exactos según "STOCK EN ESTUDIO"; las tallas
--    35.5 a 38.5 (aparecen en el stock) se extrapolan de esa
--    misma tabla de conversión
-- ------------------------------------------------------------
INSERT INTO tallas (peg, usa, cm, orden) VALUES
  (35.5, 3.5,  21.0, 35.5),   -- extrapolado
  (36.5, 4.0,  21.5, 36.5),   -- extrapolado
  (38.0, 5.5,  23.0, 38.0),   -- extrapolado
  (38.5, 5.5,  23.0, 38.5),   -- extrapolado
  (39.5, 6.5,  24.0, 39.5),   -- STOCK EN ESTUDIO
  (40.0, 7.0,  24.5, 40.0),
  (40.5, 7.5,  25.0, 40.5),
  (41.5, 8.0,  25.5, 41.5),
  (42.0, 8.5,  26.0, 42.0),
  (42.5, 9.0,  26.5, 42.5),
  (43.5, 9.5,  27.0, 43.5),
  (44.0, 10.0, 27.5, 44.0);

-- ------------------------------------------------------------
-- 3. Agencias de transporte (catálogo editable desde la web)
-- ------------------------------------------------------------
INSERT INTO agencias (nombre) VALUES
  ('Olva Courier'),
  ('Shalom'),
  ('Epack'),
  ('InDrive');

-- ------------------------------------------------------------
-- 4. Catálogo real: 23 productos Adidas de la plantilla
--    (código + nombre tal como están en el Excel.
--     Precios de referencia de la hoja ABRIL: MESSI 320,
--     PRED 275, resto 250)
-- ------------------------------------------------------------
INSERT INTO modelos (codigo, nombre, precio_base) VALUES
  ('KJ3418', 'CHIMP F50 VERDE LEAGUE SP',  250.00),
  ('KK1376', 'F50 MESSI ROJO CLUB',         320.00),
  ('IH7213', 'PRED BLANCO LEAGUE CL',       275.00),
  ('NO VENTA', 'HYP ROSADO CLUB Y LEAGUE',  250.00),
  ('IH4585', 'HYP BLANCO LEAGUE SP',        250.00),
  ('KJ3436', 'HYP NEGRO LEAGUE',            250.00),
  ('KJ6711', 'HYP ROSA LEAGUE SP',          250.00),
  ('IH2104', 'PRED NEGRO VERDE LEAG CL',    275.00),
  ('KK1367', 'HYP VERDE CLUB',              250.00),
  ('JR5029', 'PRED NEGRO ROJO LEAGUE',      275.00),
  ('ID3883', 'PRED ESSENTIALS',             275.00),
  ('JR6926', 'F50 SPARKF BLAN LEAGUE',      250.00),
  ('JR7912', 'PRED ROJO LEAGUE SL',         275.00),
  ('KK3809', 'F50 SPARKF VERDE CLUB',       250.00),
  ('JR9051', 'F50 VERDE NEON CLUB',         250.00),
  ('KJ3779', 'F50 YAMAL LEAGUE',            250.00),
  ('JR7917', 'PRED ROJO LEAGUE CL',         275.00),
  ('KI5869', 'PRED KAKA LEAGUE',            275.00),
  ('JR7880', 'CHIMP PRED ROJO LEAG SL',     275.00),
  ('JR8979', 'F50 VERDE NEON LEAG SP',      250.00),
  ('IH7212', 'PRED ROSA LEAGUE CL',         275.00),
  ('KK3808', 'F50 SPARKF ROSA CLUB',        250.00),
  ('JP6273', 'CHIMP PRED NEGR VERD L',      275.00);

-- ------------------------------------------------------------
-- 5. SKU: cada producto nace con TODAS las tallas del catálogo,
--    desmarcadas (no disponibles) y en 0. Después se marcan las
--    tallas que el negocio maneja, con su stock real del Excel.
-- ------------------------------------------------------------
INSERT INTO skus (modelo_id, talla_id, stock_actual, stock_minimo, disponible)
SELECT m.id, t.id, 0, 1, FALSE
  FROM modelos m
  CROSS JOIN tallas t;

-- Tallas con existencia real en la plantilla (columna PLAY ONE):
-- marcadas como disponibles con su stock. "vendido" queda en 0
-- (sigue disponible: se puede conseguir de nuevo).
WITH datos (codigo, peg, stock) AS (
  VALUES
    ('KJ3418',   40.0, 1),   ('KK1376',   42.5, 1),
    ('IH7213',   41.5, 1),   ('NO VENTA', 41.5, 1),
    ('IH4585',   41.5, 1),   ('KJ3436',   41.5, 1),
    ('KJ6711',   40.5, 0),   -- vendido
    ('IH2104',   38.5, 1),   ('KK1367',   38.0, 1),
    ('JR5029',   42.0, 1),   ('ID3883',   41.5, 1),
    ('JR6926',   36.5, 1),   ('JR7912',   36.5, 1),
    ('KK3809',   40.5, 1),   ('JR9051',   42.0, 1),
    ('KJ3779',   35.5, 1),   ('JR7917',   38.5, 1),
    ('KI5869',   41.5, 1),   ('JR7880',   42.0, 1),
    ('JR8979',   42.0, 1),   ('IH7212',   41.5, 1),
    ('KK3808',   40.0, 1),   ('JP6273',   41.5, 1),
    -- STOCK EN ESTUDIO: F50 MESSI (KK1376) por talla
    ('KK1376',   40.5, 3),   ('KK1376',   41.5, 5),
    ('KK1376',   42.0, 2)
)
UPDATE skus s
   SET disponible = TRUE, stock_actual = d.stock
  FROM datos d
  JOIN modelos m ON m.codigo = d.codigo
  JOIN tallas  t ON t.peg   = d.peg
 WHERE s.modelo_id = m.id
   AND s.talla_id  = t.id;

-- ------------------------------------------------------------
-- 6. Movimiento inicial de inventario (explica el stock actual)
-- ------------------------------------------------------------
INSERT INTO movimientos_stock (sku_id, tipo, cantidad, motivo)
SELECT s.id, 'entrada', s.stock_actual, 'Inventario inicial (plantilla Excel)'
  FROM skus s
 WHERE s.disponible AND s.stock_actual > 0;

-- ------------------------------------------------------------
-- 7. Clientes (datos de prueba)
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
-- 8. 60 pedidos de prueba sobre las tallas disponibles
--    (descuento opcional: monto fijo en soles, 0 si no aplica;
--     agencia del pedido = agencia del cliente)
-- ------------------------------------------------------------
WITH activos AS (
  SELECT row_number() OVER (ORDER BY id) - 1 AS rn, id FROM skus WHERE disponible
),
total AS (SELECT count(*) AS n FROM activos)
INSERT INTO pedidos (cliente_id, sku_id, precio, descuento, agencia, estado, creado_en)
SELECT 1 + (g % 8) AS cliente_id,
       a.id        AS sku_id,
       m.precio_base AS precio,
       CASE WHEN g % 3 = 0 THEN ((g % 4) + 1) * 5.00 ELSE 0 END AS descuento,
       c.agencia,
       CASE WHEN g % 10 IN (0, 1) THEN 'contactado'
            WHEN g % 10 IN (2, 3) THEN 'reservado'
            WHEN g % 10 IN (4, 5) THEN 'despachado'
            ELSE 'entregado' END AS estado,
       now()
         - ((g % 30) || ' days')::interval
         - ((g % 24) || ' hours')::interval AS creado_en
  FROM generate_series(1, 60) AS g
  JOIN total ON TRUE
  JOIN activos a ON a.rn = g % total.n
  JOIN skus s     ON s.id = a.id
  JOIN modelos m  ON m.id = s.modelo_id
  JOIN clientes c ON c.id = 1 + (g % 8)
 ORDER BY g;

-- Comprobante de agencia (opcional): solo pedidos despachados/entregados
UPDATE pedidos
   SET comprobante = lpad(((id * 7919) % 90000000 + 10000000)::text, 8, '0')
                  || ' - ' || chr(74 + (id % 15))
                  || lpad(((id * 37) % 9000 + 1000)::text, 4, '0')
 WHERE estado IN ('despachado', 'entregado');

-- ------------------------------------------------------------
-- 9. Historial de estados (auditoría del embudo)
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
-- 10. Envíos (para pedidos despachados y entregados)
-- ------------------------------------------------------------
INSERT INTO envios (pedido_id, codigo, agencia, generado_en)
SELECT p.id,
       'ENV-' || lpad(p.id::text, 5, '0'),
       p.agencia,
       p.creado_en + interval '1 day'
  FROM pedidos p
 WHERE p.estado IN ('despachado', 'entregado');

-- Resumen
SELECT (SELECT count(*) FROM usuarios)   AS usuarios,
       (SELECT count(*) FROM tallas)     AS tallas,
       (SELECT count(*) FROM agencias)   AS agencias,
       (SELECT count(*) FROM modelos)    AS modelos,
       (SELECT count(*) FROM skus)       AS skus,
       (SELECT count(*) FROM skus WHERE disponible) AS disponibles,
       (SELECT count(*) FROM skus WHERE disponible AND stock_actual < stock_minimo) AS en_alerta,
       (SELECT count(*) FROM clientes)   AS clientes,
       (SELECT count(*) FROM pedidos)    AS pedidos,
       (SELECT count(*) FROM pedidos WHERE descuento > 0) AS con_descuento,
       (SELECT count(*) FROM pedidos WHERE comprobante IS NOT NULL) AS con_comprobante,
       (SELECT count(*) FROM envios)     AS envios;
