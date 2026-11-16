// ============================================================
// Play One — Exporta el dataset del modelo a JSON
//
// Genera ml/dataset.json, el archivo que consume ml/entrenar.py
// (en Colab o en local). Así el entrenamiento NO necesita acceso a
// la base de datos: el notebook trabaja sobre un archivo plano y
// el resultado (ml/modelo.json) vuelve al repositorio.
//
// Uso (desde server/):
//   node ml/exportar-dataset.js            → ml/dataset.json
//   node ml/exportar-dataset.js otra.json  → otra.json
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { construirDataset, comoJsonEntrenamiento, DIAS, MIN_DIAS } = await import('./dataset.js');
const { default: pool } = await import('../db/pool.js');

const salida = process.argv[2] || path.join(__dirname, '..', '..', 'ml', 'dataset.json');

try {
  const { inicio, skus, filas, caracteristicas } = await construirDataset();

  const archivo = {
    descripcion:
      'Dataset diario de demanda de Play One (ventas por talla). ' +
      'Generado por server/ml/exportar-dataset.js; entrenarlo con ml/entrenar.py.',
    generado_en: new Date().toISOString(),
    inicio_ventana: new Date(inicio).toISOString(),
    dias: DIAS,
    dias_minimos_historial: MIN_DIAS,
    sku: skus.length,
    filas: filas.length,
    ...comoJsonEntrenamiento(filas, skus),
  };

  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify(archivo));
  const kb = Math.round(fs.statSync(salida).size / 1024);
  console.log(
    `✔ ${path.relative(process.cwd(), salida)}: ${archivo.filas} filas × ` +
      `${caracteristicas.length} características (${archivo.sku} SKU, ${kb} KB)`
  );
} catch (err) {
  console.error('✘ Error:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
