// Ejecuta schema.sql y seed.sql contra la base de datos configurada en .env
// Uso: npm run db:setup   (desde la carpeta server/)
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

async function correr(archivo) {
  const sql = fs.readFileSync(path.join(__dirname, archivo), 'utf8');
  console.log(`▶ Ejecutando ${archivo}…`);
  await pool.query(sql);
}

try {
  await correr('schema.sql');
  await correr('seed.sql');

  const { rows } = await pool.query(`
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
           (SELECT count(*) FROM envios)     AS envios
  `);
  console.log('✔ Base de datos lista:', rows[0]);
} catch (err) {
  console.error('✘ Error:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
