// Carga las variables de entorno ANTES que cualquier otro módulo.
// En ESM los import se evalúan en orden de declaración: este archivo debe
// importarse primero en index.js para que pool.js (que se importa desde
// las rutas) ya vea DATABASE_URL cuando se ejecute.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '..', '.env') }); // raíz del proyecto
dotenv.config({ path: path.join(__dirname, '.env') });       // alternativa: server/.env
