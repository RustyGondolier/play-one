// ============================================================
// Middleware de autenticación
//
// Toda la API de negocio exige un JWT válido emitido por
// POST /api/auth/login. Sin él, la petición se rechaza con 401
// antes de tocar la base de datos (los datos de clientes
// contienen PII: DNI, celular y dirección).
//
// Rutas públicas (se montan ANTES de este middleware):
//   - GET  /api/health  → sondeo de Render (no expone datos)
//   - POST /api/auth/login → obtiene el token
//
// En local el secreto sale de .env; en Render, del entorno.
// ============================================================
import jwt from 'jsonwebtoken';

export const autenticar = (req, res, next) => {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Falta el token de sesión' });
  }

  try {
    // jwt.verify lanza si la firma no coincide o si expiró
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};
