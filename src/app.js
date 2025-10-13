import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import fs from 'fs'; // Mantenemos fs y path por ahora para la carga de credenciales
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


// Configuración del Motor de Plantillas EJS
// ----------------------------------------------------
// Apunta a la carpeta 'views' en la raíz del proyecto
app    
    .use(express.static(__dirname + '/public'))
    .set("views", path.join(__dirname, "/views"))
    .set("view engine", "ejs")

// Session
// ----------------------------------------------------
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
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
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});


// MONTAJE DEL ROUTER DE GOOGLE
// ----------------------------------------------------
// Todas las rutas de Google (/auth/google, /drive/search, etc.) son manejadas aquí.
app.use('/', googleRouter);


// Rutas de prueba (opcional)
app.get('/status', (req, res) => {
    res.json({ status: 'ok', router_mounted: true });
});

export default app;
