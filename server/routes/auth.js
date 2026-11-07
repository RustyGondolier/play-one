import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';

const router = Router();

const SECRET = process.env.JWT_SECRET || 'dev-secret';
if (!process.env.JWT_SECRET) {
  console.warn('[auth] Falta JWT_SECRET en .env; se usa un secreto de desarrollo.');
}

/**
 * Verifica una contraseña contra el hash guardado (scrypt con formato
 * "scrypt$saltHex$hashHex", generado con node:crypto — sin dependencias).
 */
function verificarPassword(password, almacenado) {
  const [algoritmo, salt, hash] = (almacenado || '').split('$');
  if (algoritmo !== 'scrypt' || !salt || !hash) return false;
  const intento = crypto.scryptSync(password, salt, 64);
  const esperado = Buffer.from(hash, 'hex');
  return intento.length === esperado.length && crypto.timingSafeEqual(intento, esperado);
}

// POST /api/auth/login  { email, password } -> { token, nombre, rol }
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, email, password_hash, rol FROM usuarios WHERE email = $1',
      [email]
    );
    const usuario = rows[0];

    if (!usuario || !verificarPassword(password, usuario.password_hash)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
      SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
    });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

export default router;
