import googleService, { getOAuth2Client, ALL_SCOPES } from '../services/googleService.js';
// Asegúrate de que ALL_SCOPES y getGoogleProfile estén definidos y exportados en googleService.js

// --- Controladores de Autenticación ---

export const handleGoogleAuth = (req, res) => {
    try {
        const oAuth2Client = getOAuth2Client(req);
        
        // 1. Usar ALL_SCOPES para incluir permisos de Drive/Sheets Y de Perfil.
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: googleService.ALL_SCOPES // <--- CAMBIO CLAVE
        });
        res.redirect(authUrl);
    } catch (err) {
        res.status(500).render('pages/error', { error: err.message, title: 'Error de Autenticación' });
    }
};

export const handleGoogleCallback = async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('Código de autorización faltante');
    try {
        const oAuth2Client = getOAuth2Client(req);
        const { tokens } = await oAuth2Client.getToken(code);
        
        oAuth2Client.setCredentials(tokens); // Establecer credenciales para las siguientes llamadas
        req.session.tokens = tokens;
        
        // 2. OBTENER y GUARDAR datos del perfil en la sesión (req.session.googleUser)
        // ESTA FUNCIÓN DEBE EXISTIR EN googleService.js
        const userProfile = await googleService.getGoogleProfile(oAuth2Client);
        req.session.googleUser = userProfile; 
        
        // Redirigir a la página principal de búsqueda
        res.redirect('/drive/search'); 
    } catch (err) {
        res.status(500).render('pages/error', { error: `Error al intercambiar token o cargar perfil: ${err.message}`, title: 'Error de Token' });
    }
};

// --- Controladores de Drive ---

export const searchDrive = async (req, res) => {
    // Si no está autenticado, redirigir al login
    if (!req.session.tokens) {
        return res.redirect('/auth/google');
    }

    try {
        const files = await googleService.searchDriveFiles(req);
        
        // 3. PASAR el dato de la sesión (req.session.googleUser) a la vista EJS
        res.render('pages/drive/driveSearch', {
            title: 'Resultados de Búsqueda en Drive',
            query: req.query.q || '',
            folderId: req.query.folderId || '',
            files: files,
            googleUser: req.session.googleUser || null // <--- CAMBIO CLAVE
        });

    } catch (err) {
        // En caso de error, renderiza una vista de error (asumiendo que views/error.ejs existe)
        res.status(500).render('pages/, { 
            error: `Error en búsqueda: ${err.message}. ${!req.session.tokens ? 'Por favor, autentíquese de nuevo.' : ''}`, 
            title: 'Error de Drive' 
        });
    }
    console.log("Funcionó googleCo")
};


// --- Controladores de Sheets (Se mantienen sin cambios) ---

export const getSheetsInfo = async (req, res) => {
    const { spreadsheetId } = req.query;
    if (!spreadsheetId) return res.status(400).json({ error: 'Falta el parámetro: spreadsheetId' });

    try {
        const info = await googleService.getSheetsMetadata(req, spreadsheetId);
        res.json({ message: 'Metadatos obtenidos correctamente', info });
    } catch (err) {
        console.error('Error al obtener info de Sheets:', err.message);
        res.status(500).json({ error: `Error al obtener info de Sheets: ${err.message}. Verifica el ID y permisos.` });
    }
};

export const readSheetsData = async (req, res) => {
    const { spreadsheetId, range } = req.query;
    if (!spreadsheetId || !range) return res.status(400).json({ error: 'Faltan parámetros: spreadsheetId y range' });

    try {
        const values = await googleService.readSheetsData(req, spreadsheetId, range);
        res.json({ message: `Datos leídos del rango: ${range}`, values });
    } catch (err) {
        console.error('Error al leer datos de Sheets:', err.message);
        res.status(500).json({ error: `Error al leer datos de Sheets: ${err.message}. Verifica el rango y permisos.` });
    }
};

export const appendSheetsData = async (req, res) => {
    const { spreadsheetId, range, values } = req.body;
    if (!spreadsheetId || !range || !values || !Array.isArray(values)) {
        return res.status(400).json({ error: 'Faltan parámetros: spreadsheetId, range, o values (debe ser un array de arrays)' });
    }

    try {
        const updates = await googleService.appendSheetsData(req, spreadsheetId, range, values);
        res.json({ message: 'Datos añadidos correctamente', updates });
    } catch (err) {
        console.error('Error al escribir en Sheets:', err.message);
        res.status(500).json({ error: `Error al escribir en Sheets: ${err.message}. Verifica el ID, rango y permisos de escritura.` });
    }
};