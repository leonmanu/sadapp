// Contenido COMPLETO de server.js
import dotenv from 'dotenv';
// ⚠️ CARGA DE ENTORNO EN LA PRIMERA LÍNEA EJECUTABLE
dotenv.config(); 

import app from './src/app.js'; 

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    // Muestra si las credenciales están disponibles
    console.log(`CLIENT_ID disponible: ${!!process.env.CLIENT_ID}`); 
});

// Estas variables obtienen su valor de process.env, que debe estar cargado
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
