import { 
    getOAuth2Client, ALL_SCOPES, getGoogleProfile, 
    searchDriveFiles, forceReindex, 
    getSheetsMetadata as serviceGetSheetsMetadata, 
    readSheetsData as serviceReadSheetsData, 
    appendSheetsData as serviceAppendSheetsData 
} from '../services/googleService.js';

// Asegúrate de que todas las funciones y constantes anteriores estén definidas y exportadas en googleService.js

// ----------------------------------------------------
// MIDDLEWARE DE AUTENTICACIÓN
// ----------------------------------------------------

// Verifica si existe un token de sesión antes de continuar
// (Se mantiene para rutas de Sheets y el flujo de autenticación de usuario)
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.tokens) {
        return next();
    }
    // Si no está autenticado, lo redirige al inicio para loguearse.
    return res.redirect('/'); 
};


// --- Controladores de Autenticación ---

export const handleGoogleAuth = (req, res) => {
    try {
        const oAuth2Client = getOAuth2Client(req);
        
        // CORRECCIÓN: Usar ALL_SCOPES directamente ya que ahora es una importación nombrada.
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ALL_SCOPES 
        });
        res.redirect(authUrl);
    } catch (err) {
        // Asumo que tienes una vista 'pages/error'
        res.status(500).render('pages/error', { error: err.message, title: 'Error de Autenticación' });
    }
};

export const handleGoogleCallback = async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('Código de autorización faltante');
    
    try {
        const oAuth2Client = getOAuth2Client(req);
        const { tokens } = await oAuth2Client.getToken(code);
        
        oAuth2Client.setCredentials(tokens); 
        req.session.tokens = tokens;
        
        // OBTENER y GUARDAR datos del perfil en la sesión (req.session.googleUser)
        const userProfile = await getGoogleProfile(oAuth2Client);
        req.session.googleUser = userProfile; 
        
        // Redirigir a la página principal de búsqueda
        res.redirect('/drive/search'); 
    } catch (err) {
        // En caso de error, limpia el token y muestra el error.
        req.session.tokens = null;
        res.status(500).render('pages/error', { error: `Error al intercambiar token o cargar perfil: ${err.message}`, title: 'Error de Token' });
    }
};


// --- Controladores de Drive ---

/** * Renderiza la vista de Búsqueda Avanzada.
 * NOTA: Esta función es simple; asume que el enrutador protege la vista.
 */
export const renderAdvancedSearchPage = (req, res) => {
    // ... (tu código para obtener q, files, error) ...

    // Asegúrate de que todas las variables utilizadas en el EJS se pasan.
    res.render('pages/drive/deepSearch', { 
        // Si no tienes una búsqueda inicial, establece valores seguros
        error: req.query.error || null, // O tu valor de error predeterminado
        q: req.query.q || '',
        files: [], // O el resultado de la búsqueda
        // ... otras variables que puedas usar ...
    });
};


// RUTA DE BÚSQUEDA: Sin autenticación de usuario (usa Service Account)
export const searchDrive = async (req, res) => { // Removido [isAuthenticated,
    try {
        // 1. Obtiene la lista completa de archivos (incluyendo la propiedad isScanned para PDFs sin texto)
        let files = await searchDriveFiles(req);
        
        const isIllegibleFilterActive = req.query.illegibleOnly === 'true';

        // 2. Si el filtro de ilegibles está activo, filtra los resultados.
        // Los archivos que el servicio marcó con isScanned: true son los que no tienen texto legible.
        if (isIllegibleFilterActive) {
            files = files.filter(file => file.isScanned);
        }
        
        // El usuario de Google será null ya que no hay sesión activa en esta ruta.
        res.render('pages/drive/driveSearch', {
            title: 'Resultados de Búsqueda en Drive',
            query: req.query.q || '',
            folderId: '1CvG23jMIqb-aXDQ16JtMoqH0XSqw0ma7',
            files: files, // Lista potencialmente filtrada
            // Pasa el indicador de filtro al front-end
            isIllegibleFilter: isIllegibleFilterActive, 
            googleUser: req.session.googleUser || null 
        });

    } catch (err) {
        // Manejo de error general (no se intenta redirigir por token expirado)
        console.error('Error en búsqueda:', err.message);
        res.status(500).render('pages/error', { 
            error: `Error en búsqueda: ${err.message}. Verifica las credenciales de Service Account.`, 
            title: 'Error de Drive' 
        });
    }
};


// RUTA DE RE-INDEXACIÓN: Sin autenticación de usuario (usa Service Account)
export const reindexFile = async (req, res) => { // Removido [isAuthenticated,
    const { fileId } = req.params;
    const { searchTerm, illegibleOnly } = req.body; 

    if (!fileId) {
        return res.status(400).send('Falta el ID del archivo para re-indexar.');
    }

    try {
        await forceReindex(fileId, req);
        
        // Redirige de nuevo a la búsqueda original.
        let redirectUrl = '/drive/search';
        
        // Mantener el término de búsqueda 'q' si existe
        if (searchTerm) {
            // Aseguramos que el parámetro sea el primero si no hay nada más
            redirectUrl += `?q=${encodeURIComponent(searchTerm)}`;
        }
        
        // Mantener el filtro de ilegibles si fue el origen de la acción
        if (illegibleOnly === 'true') {
            // Si ya hay 'q', usamos '&', si no, usamos '?'
            redirectUrl += searchTerm ? `&illegibleOnly=true` : `?illegibleOnly=true`;
        }


        res.redirect(redirectUrl);

    } catch (err) {
        console.error('Error al forzar re-indexación:', err.message);
        // Manejo de error general
        res.status(500).render('pages/error', { error: `Error al re-indexar: ${err.message}. Verifica los permisos de Service Account.`, title: 'Error de Re-indexación' });
    }
};

// --- Controladores de Sheets (Mantienen la protección por seguridad) ---

// Se definen las funciones y se exportan después para evitar el conflicto de doble declaración.

const getSheetsInfoController = async (req, res) => {
    const { spreadsheetId } = req.query;
    if (!spreadsheetId) return res.status(400).json({ error: 'Falta el parámetro: spreadsheetId' });

    try {
        // USANDO el alias: serviceGetSheetsMetadata
        const info = await serviceGetSheetsMetadata(req, spreadsheetId);
        res.json({ message: 'Metadatos obtenidos correctamente', info });
    } catch (err) {
        console.error('Error al obtener info de Sheets:', err.message);
        res.status(500).json({ error: `Error al obtener info de Sheets: ${err.message}. Verifica el ID y permisos.` });
    }
};
export const getSheetsInfo = [isAuthenticated, getSheetsInfoController];


const readSheetsDataController = async (req, res) => {
    const { spreadsheetId, range } = req.query;
    if (!spreadsheetId || !range) return res.status(400).json({ error: 'Faltan parámetros: spreadsheetId y range' });

    try {
        // USANDO el alias: serviceReadSheetsData
        const values = await serviceReadSheetsData(req, spreadsheetId, range);
        res.json({ message: `Datos leídos del rango: ${range}`, values });
    } catch (err) {
        console.error('Error al leer datos de Sheets:', err.message);
        res.status(500).json({ error: `Error al leer datos de Sheets: ${err.message}. Verifica el rango y permisos.` });
    }
};
export const readSheetsData = [isAuthenticated, readSheetsDataController];


const appendSheetsDataController = async (req, res) => {
    const { spreadsheetId, range, values } = req.body;
    if (!spreadsheetId || !range || !values || !Array.isArray(values)) {
        return res.status(400).json({ error: 'Faltan parámetros: spreadsheetId, range, o values (debe ser un array de arrays)' });
    }

    try {
        // USANDO el alias: serviceAppendSheetsData
        const updates = await serviceAppendSheetsData(req, spreadsheetId, range, values);
        res.json({ message: 'Datos añadidos correctamente', updates });
    } catch (err) {
        console.error('Error al escribir en Sheets:', err.message);
        res.status(500).json({ error: `Error al escribir en Sheets: ${err.message}. Verifica el ID, rango y permisos de escritura.` });
    }
};
export const appendSheetsData = [isAuthenticated, appendSheetsDataController];
