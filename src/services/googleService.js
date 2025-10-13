import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Inicialización de paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuración de Credenciales ---
let CREDENTIALS = null;
const credPath = path.join(__dirname, '..', '..', 'credentials.json');
if (fs.existsSync(credPath)) {
    CREDENTIALS = JSON.parse(fs.readFileSync(credPath, 'utf8'));
} else if (process.env.CLIENT_ID && process.env.CLIENT_SECRET) {
    CREDENTIALS = { web: { client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET, redirect_uris: [process.env.REDIRECT_URI || 'http://localhost:3000/auth/google/callback'] } };
}

let SERVICE_ACCOUNT = null;
const saPath = path.join(__dirname, '..', '..', 'service-account.json');
if (fs.existsSync(saPath)) {
    SERVICE_ACCOUNT = JSON.parse(fs.readFileSync(saPath, 'utf8'));
}

// Scopes necesarios para Drive y Sheets (lectura/escritura)
export const DRIVE_SCOPES = [
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/spreadsheets' 
];

// --- NUEVOS SCOPES Y ARREGLO COMBINADO (CAMBIOS AÑADIDOS) ---

// Scopes necesarios para leer el perfil del usuario (nombre, email, foto)
export const USER_PROFILE_SCOPES = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
];

// Arreglo combinado: Es el que se debe usar en handleGoogleAuth
export const ALL_SCOPES = [
    ...DRIVE_SCOPES,
    ...USER_PROFILE_SCOPES // ¡Ahora pedimos también el perfil!
];
// ------------------------------------------------------------


// --- Clientes de Autenticación ---

export function getOAuth2Client(req) {
    if (!CREDENTIALS) throw new Error('No se encontraron credenciales de Google (credentials.json o variables de entorno)');
    const { client_id, client_secret, redirect_uris } = CREDENTIALS.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    if (req.session.tokens) {
        oAuth2Client.setCredentials(req.session.tokens);
    }
    return oAuth2Client;
}

export async function getAuthClient(req) {
    // 1. Usar tokens de sesión OAuth2 si están disponibles
    try {
        if (req && req.session && req.session.tokens) {
            return getOAuth2Client(req);
        }
    } catch (e) {
        // ignore
    }

    // 2. Usar Cuenta de Servicio si está configurada
    if (SERVICE_ACCOUNT) {
        const auth = new google.auth.GoogleAuth({
            credentials: SERVICE_ACCOUNT,
            scopes: DRIVE_SCOPES,
        });
        const client = await auth.getClient();
        return client;
    }

    // 3. Fallback a OAuth2 (lanzará error si no hay credenciales)
    if (CREDENTIALS) {
        return getOAuth2Client(req || {});
    }

    throw new Error('No hay método de autenticación disponible (no session tokens ni service account)');
}

// --- NUEVA FUNCIÓN PARA OBTENER EL PERFIL (FUNCIÓN AÑADIDA) ---

/**
 * Obtiene la información básica del perfil del usuario (nombre, email, foto) 
 * usando el cliente OAuth2 autenticado.
 * @param {import('googleapis').Auth.OAuth2Client} oAuth2Client Cliente autenticado.
 */
export async function getGoogleProfile(oAuth2Client) {
    // Usamos la API de OAuth2 versión 2 que accede a la información de userinfo
    const oauth2 = google.oauth2({
        auth: oAuth2Client,
        version: 'v2',
    });
    
    const userInfoResponse = await oauth2.userinfo.get();
    const profile = userInfoResponse.data;

    // Devolvemos solo los datos que necesitamos para la navbar
    return {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        picture: profile.picture 
    };
}
// ------------------------------------------------------------------


// --- Lógica de la API de Drive ---

/**
 * Busca recursivamente archivos en Drive.
 */
async function searchFolderRecursive(drive, rootFolderId, q, pageSize) {
    const filesMap = new Map();
    const queue = [rootFolderId];
    const escaped = q ? q.replace(/'/g, "\\'") : null;

    while (queue.length > 0) {
        const currentFolder = queue.shift();

        // 1) Buscar archivos
        let pageToken = null;
        do {
            const fileQueryParts = ["trashed = false", `'${currentFolder}' in parents`];
            if (escaped) fileQueryParts.push(`(name contains '${escaped}' or fullText contains '${escaped}')`);

            const resp = await drive.files.list({
                q: fileQueryParts.join(' and '),
                fields: 'nextPageToken, files(id, name, mimeType, parents, webViewLink)',
                pageSize: pageSize || 100,
                pageToken,
                includeItemsFromAllDrives: true,
                supportsAllDrives: true,
            });

            (resp.data.files || []).forEach(f => {
                if (!filesMap.has(f.id)) filesMap.set(f.id, f);
            });

            pageToken = resp.data.nextPageToken;
        } while (pageToken);

        // 2) Listar subcarpetas (para seguir la BFS)
        pageToken = null;
        do {
            const folderResp = await drive.files.list({
                q: `trashed = false and '${currentFolder}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
                fields: 'nextPageToken, files(id, name)',
                pageSize: 100,
                pageToken,
                includeItemsFromAllDrives: true,
                supportsAllDrives: true,
            });

            (folderResp.data.files || []).forEach(f => queue.push(f.id));
            pageToken = folderResp.data.nextPageToken;
        } while (pageToken);
    }

    return Array.from(filesMap.values());
}

/**
 * Función principal de búsqueda en Drive.
 */
export async function searchDriveFiles(req) {
    const authClient = await getAuthClient(req);
    const drive = google.drive({ version: 'v3', auth: authClient });

    const { q, folderId, pageSize = 20 } = req.query;

    if (folderId) {
        return await searchFolderRecursive(drive, folderId, q, Number(pageSize));
    }

    // Búsqueda simple (no recursiva)
    let driveQuery = ["trashed = false"];
    if (q) {
        const escaped = q.replace(/'/g, "\\'");
        driveQuery.push(`(name contains '${escaped}' or fullText contains '${escaped}')`);
    }

    const response = await drive.files.list({
        q: driveQuery.join(' and '),
        fields: 'files(id, name, mimeType, parents, webViewLink)',
        pageSize: Number(pageSize),
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
    });
    
    return response.data.files || [];
}

// --- Lógica de la API de Sheets (Exportada para que el controlador la use) ---

export async function getSheetsMetadata(req, spreadsheetId) {
    const authClient = await getAuthClient(req);
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const response = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId,
        fields: 'spreadsheetId,properties.title,sheets(properties.title,properties.sheetId)',
    });
    return response.data;
}

export async function readSheetsData(req, spreadsheetId, range) {
    const authClient = await getAuthClient(req);
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: range,
    });
    return response.data.values || [];
}

export async function appendSheetsData(req, spreadsheetId, range, values) {
    const authClient = await getAuthClient(req);
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const requestBody = { values: values };

    const response = await sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: range,
        valueInputOption: 'USER_ENTERED',
        requestBody: requestBody,
    });
    return response.data.updates;
}

export default {
    getOAuth2Client,
    getAuthClient,
    DRIVE_SCOPES,
    // Exportamos los nuevos elementos
    ALL_SCOPES, 
    getGoogleProfile, 
    // Exportamos el resto de elementos
    searchDriveFiles,
    getSheetsMetadata,
    readSheetsData,
    appendSheetsData
};