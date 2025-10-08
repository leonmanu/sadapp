import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

// Middleware básico para parsear JSON
app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('¡SadApp está funcionando!');
});

export default app;
// Obtener el directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Servir index.html en la ruta raíz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});