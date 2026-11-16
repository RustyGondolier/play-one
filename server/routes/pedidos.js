import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// Orden del embudo (para avanzar hacia adelante)
const ORDEN_ESTADOS = ['contactado', 'reservado', 'despachado', 'entregado'];
// Un pedido se cancela solo mientras NO salió de la bodega:
// desde despachado el paquete ya viaja y no se cancela.
const ESTADOS_CANCELABLES = ['contactado', 'reservado'];

// GET /api/pedidos — lista para el tablero del embudo:
// incluye agencia, comprobante, motivo de cancelación, fecha de registro
// y el historial con la fecha de cada cambio de estado.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id,
             c.nombre AS cliente,
             c.dni,
             m.codigo,
             (m.nombre || ' · ' ||
               CASE WHEN t.peg = trunc(t.peg) THEN trunc(t.peg)::text ELSE t.peg::text END
             ) AS producto,
             CASE WHEN t.peg = trunc(t.peg) THEN trunc(t.peg)::text ELSE t.peg::text END AS talla,
             CASE WHEN t.usa  = trunc(t.usa)  THEN trunc(t.usa)::text  ELSE t.usa::text  END AS usa,
             to_char(p.creado_en, 'DD/MM') AS fecha,
             to_char(p.creado_en, 'YYYY-MM-DD') AS fecha_iso,
             to_char(p.creado_en, 'DD/MM/YYYY HH24:MI') AS fecha_registro,
             p.precio,
             p.descuento,
             p.agencia,
             p.distrito_destino,
             p.direccion,
             p.comprobante,
             p.estado,
             p.motivo_cancelacion,
             (SELECT to_char(e.fecha, 'DD/MM/YYYY HH24:MI')
                FROM estados_pedido e
               WHERE e.pedido_id = p.id AND e.estado = 'cancelado'
               ORDER BY e.fecha DESC LIMIT 1) AS fecha_cancelacion,
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
        JOIN tallas t   ON t.id = s.talla_id
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
//  - destino y dirección se COPIAN del cliente al pedido (snapshot),
//    para que un cambio posterior del cliente no altere pedidos viejos
//  - descuenta el stock y registra el movimiento
router.post('/', async (req, res) => {
  const {
    nombre, dni, celular, distrito_destino, direccion, agencia, sku_id, descuento,
  } = req.body || {};

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
    let destinoPedido = String(distrito_destino || '').trim();
    let direccionPedido = String(direccion || '').trim();

    const existente = await cliente.query(
      'SELECT id, agencia, distrito_destino, direccion FROM clientes WHERE dni = $1',
      [dni]
    );
    if (existente.rows.length) {
      const c = existente.rows[0];
      clienteId = c.id;
      // si no envían agencia/destino/dirección, se toman los del cliente
      if (!agenciaPedido) agenciaPedido = c.agencia;
      if (!destinoPedido) destinoPedido = c.distrito_destino;
      if (!direccionPedido) direccionPedido = c.direccion;
    } else {
      if (!nombre || !celular || !destinoPedido || !direccionPedido || !agenciaPedido) {
        await cliente.query('ROLLBACK');
        return res.status(400).json({
          error: 'Cliente nuevo: completa nombre, celular, destino, dirección y agencia',
        });
      }
      const nuevo = await cliente.query(
        `INSERT INTO clientes (nombre, dni, celular, distrito_destino, direccion, agencia)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [nombre, dni, celular, destinoPedido, direccionPedido, agenciaPedido]
      );
      clienteId = nuevo.rows[0].id;
    }

    // El pedido siempre debe llevar dirección de entrega
    if (!direccionPedido) {
      await cliente.query('ROLLBACK');
      return res.status(400).json({
        error: 'Falta la dirección de entrega: complétala en el pedido o en el cliente',
      });
    }

    // 2. Producto: precio, talla y stock disponible
    const sku = await cliente.query(
      `SELECT s.id, s.stock_actual, s.disponible,
              CASE WHEN t.peg = trunc(t.peg) THEN trunc(t.peg)::text ELSE t.peg::text END AS peg,
              m.precio_base, m.nombre, m.codigo
         FROM skus s
         JOIN modelos m ON m.id = s.modelo_id
         JOIN tallas  t ON t.id = s.talla_id
        WHERE s.id = $1`,
      [sku_id]
    );
    if (!sku.rows.length) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    const { stock_actual, disponible, precio_base, peg, nombre: modelo, codigo } = sku.rows[0];

    // Un intento de compra sin stock queda registrado para el
    // reporte semanal (demanda perdida). Se guarda el snapshot
    // "Código · Talla" para no depender del catálogo futuro.
    // Se inserta DESPUÉS del rollback: si se hiciera dentro de la
    // transacción, el rollback borraría el registro.
    const productoSnapshot = `${codigo} · ${peg}`;
    const registrarConsulta = async (motivo) => {
      await pool.query(
        `INSERT INTO consultas_sin_stock (sku_id, motivo, producto)
         VALUES ($1, $2, $3)`,
        [sku_id, motivo, productoSnapshot]
      );
    };

    if (!disponible) {
      await cliente.query('ROLLBACK');
      await registrarConsulta('no_disponible');
      return res.status(409).json({ error: `La talla ${peg} de ${modelo} no está disponible` });
    }
    if (stock_actual < 1) {
      await cliente.query('ROLLBACK');
      await registrarConsulta('sin_stock');
      return res.status(409).json({ error: `Sin stock disponible de ${modelo} · ${peg}` });
    }
    if (desc > Number(precio_base)) {
      await cliente.query('ROLLBACK');
      return res.status(400).json({ error: 'El descuento no puede superar el precio del producto' });
    }

    // 3. Pedido (con la dirección copiada del cliente o la del pedido)
    const pedido = await cliente.query(
      `INSERT INTO pedidos (cliente_id, sku_id, precio, descuento, agencia, distrito_destino, direccion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'contactado')
       RETURNING id, precio, descuento, agencia, distrito_destino, direccion, estado, creado_en`,
      [clienteId, sku_id, precio_base, desc, agenciaPedido, destinoPedido, direccionPedido]
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
// 'cancelado' NO entra por aquí: la cancelación tiene su propio endpoint
// porque devuelve la unidad al inventario.
router.patch('/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body || {};
  if (estado === 'cancelado') {
    return res.status(400).json({
      error: 'Para cancelar usa PATCH /api/pedidos/:id/cancelar (devuelve la unidad al inventario)',
    });
  }
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

// PATCH /api/pedidos/:id/cancelar  { motivo? }
// Cancela el pedido mientras aún NO esté despachado y DEVUELVE la unidad
// al inventario (movimiento 'entrada'). Registra la cancelación en el
// historial. El motivo es un texto libre opcional.
router.patch('/:id/cancelar', async (req, res) => {
  const { id } = req.params;
  const motivo = String(req.body?.motivo || '').trim();
  if (motivo.length > 200) {
    return res.status(400).json({ error: 'El motivo no puede superar 200 caracteres' });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const actual = await cliente.query(
      'SELECT id, sku_id, estado FROM pedidos WHERE id = $1',
      [id]
    );
    if (!actual.rows.length) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    const pedido = actual.rows[0];
    if (!ESTADOS_CANCELABLES.includes(pedido.estado)) {
      await cliente.query('ROLLBACK');
      return res.status(400).json({
        error:
          pedido.estado === 'cancelado'
            ? 'Ese pedido ya está cancelado'
            : 'Solo se puede cancelar un pedido contactado o reservado (aún no despachado)',
      });
    }

    // 1. Estado + motivo
    await cliente.query(
      'UPDATE pedidos SET estado = $1, motivo_cancelacion = $2 WHERE id = $3',
      ['cancelado', motivo, id]
    );
    // 2. Historial
    await cliente.query(
      `INSERT INTO estados_pedido (pedido_id, estado, fecha) VALUES ($1, 'cancelado', now())`,
      [id]
    );
    // 3. La unidad vuelve al inventario (el pedido nunca salió de la bodega)
    await cliente.query(
      'UPDATE skus SET stock_actual = stock_actual + 1 WHERE id = $1',
      [pedido.sku_id]
    );
    await cliente.query(
      `INSERT INTO movimientos_stock (sku_id, tipo, cantidad, motivo, pedido_id)
       VALUES ($1, 'entrada', 1, $2, $3)`,
      [pedido.sku_id, `Cancelación del pedido #${id}`, id]
    );

    const { rows: stock } = await cliente.query(
      'SELECT stock_actual FROM skus WHERE id = $1',
      [pedido.sku_id]
    );
    await cliente.query('COMMIT');
    res.json({ ok: true, estado: 'cancelado', motivo, stock_actual: stock[0].stock_actual });
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error('[pedidos/cancelar]', err.message);
    res.status(500).json({ error: 'Error al cancelar el pedido' });
  } finally {
    cliente.release();
  }
});

// PATCH /api/pedidos/:id/reactivar — deshace una cancelación:
// el pedido vuelve al estado previo (contactado/reservado, según su
// historial) y la unidad se descuenta del inventario otra vez.
router.patch('/:id/reactivar', async (req, res) => {
  const { id } = req.params;

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const actual = await cliente.query(
      'SELECT id, sku_id, estado FROM pedidos WHERE id = $1',
      [id]
    );
    if (!actual.rows.length) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    const pedido = actual.rows[0];
    if (pedido.estado !== 'cancelado') {
      await cliente.query('ROLLBACK');
      return res.status(400).json({ error: 'Solo se puede reactivar un pedido cancelado' });
    }

    // Estado previo: el último del historial que no sea 'cancelado'
    const { rows: previos } = await cliente.query(
      `SELECT estado FROM estados_pedido
        WHERE pedido_id = $1 AND estado <> 'cancelado'
        ORDER BY fecha DESC LIMIT 1`,
      [id]
    );
    const estadoPrevio = previos.length ? previos[0].estado : 'contactado';

    // La unidad necesita volver a salir del inventario
    const { rows: stock } = await cliente.query(
      'SELECT stock_actual FROM skus WHERE id = $1',
      [pedido.sku_id]
    );
    if (stock[0].stock_actual < 1) {
      await cliente.query('ROLLBACK');
      return res.status(409).json({
        error: 'No hay stock para reactivar: repón la talla antes de reactivar el pedido',
      });
    }

    // 1. Estado previo + limpia el motivo
    await cliente.query(
      'UPDATE pedidos SET estado = $1, motivo_cancelacion = $2 WHERE id = $3',
      [estadoPrevio, '', id]
    );
    // 2. Historial (vuelve a registrarse en el estado original)
    await cliente.query(
      `INSERT INTO estados_pedido (pedido_id, estado, fecha) VALUES ($1, $2, now())`,
      [id, estadoPrevio]
    );
    // 3. La unidad sale del inventario otra vez
    await cliente.query(
      'UPDATE skus SET stock_actual = stock_actual - 1 WHERE id = $1',
      [pedido.sku_id]
    );
    await cliente.query(
      `INSERT INTO movimientos_stock (sku_id, tipo, cantidad, motivo, pedido_id)
       VALUES ($1, 'salida', 1, $2, $3)`,
      [pedido.sku_id, `Reactivación del pedido #${id}`, id]
    );

    const { rows: nuevoStock } = await cliente.query(
      'SELECT stock_actual FROM skus WHERE id = $1',
      [pedido.sku_id]
    );
    await cliente.query('COMMIT');
    res.json({
      ok: true,
      estado: estadoPrevio,
      stock_actual: nuevoStock[0].stock_actual,
    });
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error('[pedidos/reactivar]', err.message);
    res.status(500).json({ error: 'Error al reactivar el pedido' });
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
