import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const ORDEN_ESTADOS = ['contactado', 'reservado', 'despachado', 'entregado'];

// GET /api/pedidos — lista para el tablero del embudo:
// incluye agencia, comprobante, fecha de registro y el historial
// con la fecha de cada cambio de estado.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id,
             c.nombre AS cliente,
             c.dni,
             (m.nombre || ' · ' || s.talla) AS producto,
             to_char(p.creado_en, 'DD/MM') AS fecha,
             to_char(p.creado_en, 'YYYY-MM-DD') AS fecha_iso,
             to_char(p.creado_en, 'DD/MM/YYYY HH24:MI') AS fecha_registro,
             p.precio,
             p.descuento,
             p.agencia,
             p.comprobante,
             p.estado,
             COALESCE(
               (
                 SELECT json_agg(
                          json_build_object(
                            'estado', e.estado,
                            'fecha',  to_char(e.fecha, 'DD/MM/YYYY HH24:MI'),
                            'fecha_iso', to_char(e.fecha, 'YYYY-MM-DD')
                          ) ORDER BY e.fecha
                        )
                   FROM estados_pedido e
                  WHERE e.pedido_id = p.id
               ),
               '[]'
             ) AS historial
        FROM pedidos p
        JOIN clientes c ON c.id = p.cliente_id
        JOIN skus s     ON s.id = p.sku_id
        JOIN modelos m  ON m.id = s.modelo_id
       ORDER BY p.creado_en DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[pedidos]', err.message);
    res.status(500).json({ error: 'Error al consultar los pedidos' });
  }
});

// POST /api/pedidos — crea el pedido:
//  - detecta/crea el cliente por DNI
//  - toma el precio del producto (modelos.precio_base)
//  - descuento opcional de monto fijo
//  - la agencia es del pedido (el cliente puede cambiar de agencia)
//  - descuenta el stock y registra el movimiento
router.post('/', async (req, res) => {
  const { nombre, dni, celular, distrito_destino, agencia, sku_id, descuento } = req.body || {};

  if (!dni || !sku_id) {
    return res.status(400).json({ error: 'DNI del cliente y producto son obligatorios' });
  }
  const desc = Number(descuento || 0);
  if (!Number.isFinite(desc) || desc < 0) {
    return res.status(400).json({ error: 'El descuento debe ser un número mayor o igual a 0' });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // 1. Cliente: usar el registrado por DNI o crearlo
    let clienteId;
    let agenciaPedido = String(agencia || '').trim();
    const existente = await cliente.query(
      'SELECT id, agencia FROM clientes WHERE dni = $1',
      [dni]
    );
    if (existente.rows.length) {
      clienteId = existente.rows[0].id;
      // si no envían agencia, se mantiene la del cliente
      if (!agenciaPedido) agenciaPedido = existente.rows[0].agencia;
    } else {
      if (!nombre || !celular || !distrito_destino || !agenciaPedido) {
        await cliente.query('ROLLBACK');
        return res.status(400).json({
          error: 'Cliente nuevo: completa nombre, celular, destino y agencia',
        });
      }
      const nuevo = await cliente.query(
        `INSERT INTO clientes (nombre, dni, celular, distrito_destino, agencia)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [nombre, dni, celular, distrito_destino, agenciaPedido]
      );
      clienteId = nuevo.rows[0].id;
    }

    // 2. Producto: precio del producto y stock disponible
    const sku = await cliente.query(
      `SELECT s.id, s.stock_actual, m.precio_base, m.nombre
         FROM skus s JOIN modelos m ON m.id = s.modelo_id
        WHERE s.id = $1`,
      [sku_id]
    );
    if (!sku.rows.length) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    const { stock_actual, precio_base, nombre: modelo } = sku.rows[0];

    if (stock_actual < 1) {
      await cliente.query('ROLLBACK');
      return res.status(409).json({ error: `Sin stock disponible de ${modelo}` });
    }
    if (desc > Number(precio_base)) {
      await cliente.query('ROLLBACK');
      return res.status(400).json({ error: 'El descuento no puede superar el precio del producto' });
    }

    // 3. Pedido
    const pedido = await cliente.query(
      `INSERT INTO pedidos (cliente_id, sku_id, precio, descuento, agencia, estado)
       VALUES ($1, $2, $3, $4, $5, 'contactado')
       RETURNING id, precio, descuento, agencia, estado, creado_en`,
      [clienteId, sku_id, precio_base, desc, agenciaPedido]
    );
    const p = pedido.rows[0];

    // 4. Baja de stock + movimiento
    await cliente.query('UPDATE skus SET stock_actual = stock_actual - 1 WHERE id = $1', [sku_id]);
    await cliente.query(
      `INSERT INTO movimientos_stock (sku_id, tipo, cantidad, motivo, pedido_id)
       VALUES ($1, 'salida', 1, 'Venta', $2)`,
      [sku_id, p.id]
    );

    // 5. Historial del embudo
    await cliente.query(
      `INSERT INTO estados_pedido (pedido_id, estado, fecha) VALUES ($1, 'contactado', now())`,
      [p.id]
    );

    await cliente.query('COMMIT');
    res.status(201).json({ ok: true, pedido: p });
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error('[pedidos/post]', err.message);
    res.status(500).json({ error: 'Error al registrar el pedido' });
  } finally {
    cliente.release();
  }
});

// PATCH /api/pedidos/:id/estado  { estado } — avanza el embudo (solo hacia adelante)
router.patch('/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body || {};
  if (!ORDEN_ESTADOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const actual = await cliente.query('SELECT estado FROM pedidos WHERE id = $1', [id]);
    if (!actual.rows.length) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    const iActual = ORDEN_ESTADOS.indexOf(actual.rows[0].estado);
    const iNuevo = ORDEN_ESTADOS.indexOf(estado);
    if (iNuevo <= iActual) {
      await cliente.query('ROLLBACK');
      return res.status(400).json({ error: 'Solo se puede avanzar hacia adelante en el embudo' });
    }

    await cliente.query('UPDATE pedidos SET estado = $1 WHERE id = $2', [estado, id]);
    await cliente.query(
      `INSERT INTO estados_pedido (pedido_id, estado, fecha) VALUES ($1, $2, now())`,
      [id, estado]
    );
    await cliente.query('COMMIT');
    res.json({ ok: true, estado });
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error('[pedidos/estado]', err.message);
    res.status(500).json({ error: 'Error al actualizar el estado' });
  } finally {
    cliente.release();
  }
});

// PATCH /api/pedidos/:id/comprobante  { comprobante }
// Guarda (o limpia) el N° de comprobante de la agencia. Solo aplica
// cuando el pedido está despachado o entregado; es opcional.
router.patch('/:id/comprobante', async (req, res) => {
  const { id } = req.params;
  const comprobante = String(req.body?.comprobante ?? '').trim();

  if (comprobante.length > 60) {
    return res.status(400).json({ error: 'El comprobante no puede superar 60 caracteres' });
  }

  try {
    const actual = await pool.query('SELECT estado FROM pedidos WHERE id = $1', [id]);
    if (!actual.rows.length) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    if (!['despachado', 'entregado'].includes(actual.rows[0].estado)) {
      return res.status(400).json({
        error: 'El comprobante se agrega cuando el pedido está despachado',
      });
    }
    await pool.query('UPDATE pedidos SET comprobante = $1 WHERE id = $2', [
      comprobante || null,
      id,
    ]);
    res.json({ ok: true, comprobante: comprobante || null });
  } catch (err) {
    console.error('[pedidos/comprobante]', err.message);
    res.status(500).json({ error: 'Error al guardar el comprobante' });
  }
});

export default router;
