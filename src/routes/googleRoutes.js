import { Router } from 'express';
import { 
    handleGoogleAuth, 
    handleGoogleCallback, 
    searchDrive, 
    getSheetsInfo, 
    readSheetsData, 
    appendSheetsData,
    reindexFile,
    renderAdvancedSearchPage // <-- ¡NUEVA FUNCIÓN REQUERIDA!
} from '../controllers/googleController.js';

const router = Router();

// --- Rutas de Autenticación (OAuth2) ---
router.get('/auth/google', handleGoogleAuth);
router.get('/auth/google/callback', handleGoogleCallback);


// --- Rutas de Google Drive ---
// Búsqueda básica de archivos en Drive
router.get('/drive/search', searchDrive);

// Búsqueda Avanzada - Carga la vista del formulario avanzado
router.get('/drive/advanced-search', renderAdvancedSearchPage); 

// Para forzar la re-indexación de un archivo (acción de OCR)
router.post('/drive/reindex/:fileId', reindexFile);


// --- Rutas de Google Sheets ---
router.get('/sheets/info', getSheetsInfo);
router.get('/sheets/read', readSheetsData);
router.post('/sheets/append', appendSheetsData);


export default router;
