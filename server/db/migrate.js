// Aplica migracion-v2.sql SIN borrar datos (idempotente).
// Uso: npm run db:migrate   (desde la carpeta server/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carga .env de la raíz del proyecto (y, como alternativa, de server/)
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { default: pool } = await import('./pool.js');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL: crea el archivo .env en la raíz del proyecto.');
  process.exit(1);
}

const archivo = 'migracion-v2.sql';

try {
  const sql = fs.readFileSync(path.join(__dirname, archivo), 'utf8');
  console.log(`▶ Ejecutando ${archivo}…`);
  await pool.query(sql);

  const { rows } = await pool.query(`
    SELECT (SELECT count(*) FROM clientes WHERE direccion <> '') AS clientes_con_direccion,
           (SELECT count(*) FROM pedidos)    AS pedidos,
           (SELECT count(*) FROM pedidos WHERE direccion <> '') AS pedidos_con_direccion,
           (SELECT count(*) FROM modelos)    AS modelos
  `);
  console.log('✔ Migración aplicada:', rows[0]);
} catch (err) {
  console.error('✘ Error en la migración:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
