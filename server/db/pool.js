import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    '[db] Falta DATABASE_URL. Copia .env.example como .env en la raíz del proyecto y pega tu connection string de Neon.'
  );
}

// Neon agrega sslmode=require a la connection string; pg lo aplica automáticamente.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] Error inesperado en el pool:', err.message);
});

export default pool;
