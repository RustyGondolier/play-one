// Cliente HTTP centralizado: adjunta el token JWT y maneja errores globales.
const API = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(API + path, { ...options, headers });
  } catch {
    throw new Error('No se pudo conectar con el servidor');
  }

  const data = await res.json().catch(() => ({}));

  // Token expirado o inválido (distinto del login): cerrar sesión
  if (res.status === 401 && token && path !== '/auth/login') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Sesión expirada, vuelve a iniciar sesión');
  }

  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
};

export default api;
