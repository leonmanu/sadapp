import { Router } from 'express';
import { 
    handleGoogleAuth, 
    handleGoogleCallback, 
    searchDrive, 
    getSheetsInfo, 
    readSheetsData, 
    appendSheetsData 
} from '../controllers/googleController.js';

const router = Router();

// --- Rutas de Autenticación (OAuth2) ---
// 1. Inicia el flujo de autenticación de Google (redirige al login de Google)
router.get('/auth/google', handleGoogleAuth);

// 2. Recibe el código de Google y establece la sesión
router.get('/auth/google/callback', handleGoogleCallback);


// --- Rutas de Google Drive ---
// Búsqueda de archivos en Drive (requiere autenticación)
router.get('/drive/search', searchDrive);


// --- Rutas de Google Sheets ---
// Leer metadatos de una Hoja de Cálculo
router.get('/sheets/info', getSheetsInfo);

// Leer datos de un rango específico
router.get('/sheets/read', readSheetsData);

// Añadir datos a una Hoja de Cálculo
router.post('/sheets/append', appendSheetsData);


export default router;
