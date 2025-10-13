import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import fs from 'fs'; 
import dotenv from 'dotenv'; // Aseguramos el import de dotenv

// Cargar variables de entorno desde .env (esencial para desarrollo local)
dotenv.config();

// Importar el Router que contiene todas las rutas de Google
import googleRouter from './routes/googleRoutes.js'; 

const app = express();

// Determinar __dirname para paths relativos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware básico
// ----------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de Archivos Estáticos (sirve toda la carpeta raíz del proyecto)
app.use(express.static(path.join(__dirname, '..')));
app.use(express.static(path.join(__dirname, 'public'))); // Opcional: servir una carpeta 'public' dentro de 'src'

// Configuración del Motor de Plantillas EJS
// ----------------------------------------------------
// SOLUCIÓN AL ERROR EN RENDER: Usamos process.cwd() para encontrar la ruta absoluta 'src/views'
app.set('views', path.join(process.cwd(), 'src', 'views')); 
app.set('view engine', 'ejs');

// Session
// ----------------------------------------------------
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // true en producción (HTTPS)
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 24 horas
    }
}));


// Rutas de Demo de Login Básico (NO DE GOOGLE)
// ----------------------------------------------------
// Estas rutas estáticas que no usan el Router de Google se mantienen
app.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    const DEMO_USER = 'admin';
    const DEMO_PASS = 'password123';

    if (username === DEMO_USER && password === DEMO_PASS) {
        // En una app real, aquí se establecería la sesión del usuario.
        return res.send(`<!doctype html><html><body><h1>Bienvenido, ${username}!</h1><p>Inicio de sesión exitoso.</p><p><a href="/drive/search">Ir a Drive Search</a></p></body></html>`);
    }

    return res.status(401).send('<h1>Acceso denegado</h1><p>Credenciales inválidas</p>');
});

app.get('/', (req, res) => {
    // Servir la página de inicio (asumiendo que index_dark.html o similar está en la raíz)
    res.sendFile(path.join(__dirname, '..', 'index_dark.html'));
});


// MONTAJE DEL ROUTER DE GOOGLE
// ----------------------------------------------------
// Todas las rutas de Google (/auth/google, /drive/search, etc.) son manejadas aquí.
app.use('/', googleRouter);


// Manejo centralizado de errores (MUY IMPORTANTE)
app.use((err, req, res, next) => {
    console.error('ERROR DEL SERVIDOR:', err.stack);

    const errorMessage = err.message || 'Error interno del servidor.';
    const errorTitle = err.message.includes('No se encontraron credenciales') 
        ? 'Error de Configuración de Credenciales' 
        : 'Error';

    // Ahora debería encontrar la vista 'error.ejs'
    res.status(err.status || 500).render('error', { 
        title: errorTitle, 
        error: errorMessage 
    });
});


// Rutas de prueba (opcional)
app.get('/status', (req, res) => {
    res.json({ status: 'ok', router_mounted: true });
});

// La exportación para que pueda ser iniciado externamente si se desea
export default app; 

const PORT = process.env.PORT || 3000;
const hostUrl = process.env.HOST_URL || `http://localhost:${PORT}`;

// Solo iniciamos el servidor si este módulo es el principal
if (import.meta.url === `file://${process.argv[1]}`) {
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en ${hostUrl}`); 
        // Verificamos si la clave de Google está disponible
        console.log(`CLIENT_ID disponible: ${!!process.env.GOOGLE_CLIENT_ID}`); 
    });
}
