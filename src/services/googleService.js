import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';

// 1. Define la carpeta fija (ID proporcionado por el usuario)
const FIXED_PDF_FOLDER_ID = '1CvG23jMIqb-aXDQ16JtMoqH0XSqw0ma7';

// Scopes usados por la aplicación
export const ALL_SCOPES = [
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
];

// 2. Definición del cliente de autenticación de SERVICE ACCOUNT o Credenciales Fijas
// El cliente se inicializa solo una vez al inicio.
let authClientInstance = null;

/**
 * Obtiene un cliente autenticado usando la Service Account (si existe) o
 * con GOOGLE_APPLICATION_CREDENTIALS configurada en el entorno.
 */
export async function getAuthClient(req) {
    if (authClientInstance) return authClientInstance;

    try {
        const scopes = ['https://www.googleapis.com/auth/drive.readonly'];

        // Preferir archivo service-account.json en la raíz del proyecto si existe
        const saPath = path.join(process.cwd(), 'service-account.json');
        let auth;
        if (fs.existsSync(saPath)) {
            // Usar keyFilename para que GoogleAuth cargue la clave directamente
            auth = new GoogleAuth({ keyFilename: saPath, scopes });
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            // Si el usuario configuró la variable de entorno, dejar que GoogleAuth la use
            auth = new GoogleAuth({ scopes });
        } else {
            // Fallback: intentar cargar credenciales predeterminadas (por ejemplo en GCE)
            auth = new GoogleAuth({ scopes });
        }

        authClientInstance = await auth.getClient();
        console.log('Cliente de Cuenta de Servicio inicializado con éxito.');
        return authClientInstance;
    } catch (error) {
        console.error('ERROR: No se pudo inicializar la autenticación de Service Account.', error.message);
        throw new Error('Autenticación de Service Account fallida. Verifica las credenciales JSON.');
    }
}

/**
 * Construye la cadena de consulta (q) para la API de Google Drive basada en los parámetros.
 */
export function buildDriveQuery(params) {
    const queryParts = ["trashed = false"];

    if (params.folderId) {
        queryParts.push(`'${params.folderId}' in parents`);
    }

    if (params.q && params.q.trim()) {
        const safeQ = params.q.trim().replace(/'/g, "\\'");
        // Buscar por nombre o por texto interno indexado
        queryParts.push(`(name contains '${safeQ}' or fullText contains '${safeQ}')`);
    }

    // Si no hay término de búsqueda pero hay tipo de archivo, filtrar por tipo
    if (params.fileType === 'pdf' || !params.q) {
        queryParts.push(`mimeType = 'application/pdf'`);
    }

    const finalQuery = queryParts.join(' and ');
    console.log('Query final:', finalQuery);
    return finalQuery;
}

/**
 * Crea un cliente OAuth2 para el flujo de usuario (credentials.json necesario).
 */
export function getOAuth2Client(req) {
    const credsPath = path.join(process.cwd(), 'credentials.json');
    if (!fs.existsSync(credsPath)) throw new Error('credentials.json no encontrado');
    const CREDENTIALS = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const conf = CREDENTIALS.web || CREDENTIALS.installed;
    const redirect = (conf.redirect_uris && conf.redirect_uris[0]) || 'http://localhost:3000/auth/google/callback';
    const oAuth2Client = new google.auth.OAuth2(conf.client_id, conf.client_secret, redirect);
    return oAuth2Client;
}

/**
 * Obtiene perfil de usuario usando OAuth2 client (para mostrar nombre/foto).
 */
export async function getGoogleProfile(oAuth2Client) {
    const oauth2 = google.oauth2({ auth: oAuth2Client, version: 'v2' });
    const resp = await oauth2.userinfo.get();
    return resp.data;
}

/**
 * Stub: fuerza reindex (OCR) para un archivo. Implementación básica que intenta
 * actualizar metadatos para forzar reindex, pero por ahora es un no-op que
 * devuelve true si el archivoId está presente.
 */
export async function forceReindex(fileId, req) {
    if (!fileId) throw new Error('fileId requerido para reindexar');
    // Implementación real podría descargar el archivo, enviar a Vision OCR, y luego actualizar.
    console.log(`Solicitado reindex para archivo: ${fileId}`);
    return true;
}

// Stubs para funciones relacionadas con Google Sheets (puedes implementar luego)
export async function getSheetsMetadata(req, spreadsheetId) {
    return { spreadsheetId };
}

export async function readSheetsData(req, spreadsheetId, range) {
    return [];
}

export async function appendSheetsData(req, spreadsheetId, range, values) {
    return { updated: true };
}

export async function searchDriveFiles(req) {
    const authClient = await getAuthClient(req);
    const drive = google.drive({ version: 'v3', auth: authClient });

    const { pageSize = 20, fileType } = req.query;
    let queryParams = { ...req.query };

    // Si no se proporciona folderId en la petición, por defecto usar la carpeta fija configurada
    if (!req.query.folderId && !queryParams.folderId) {
        queryParams.folderId = FIXED_PDF_FOLDER_ID;
    }

    if (fileType === 'pdf') {
        queryParams.fileType = 'pdf';
    }

    const driveQuery = buildDriveQuery(queryParams);

    console.log('Ejecutando búsqueda con parámetros:', queryParams);
    
    // Preparar los parámetros de búsqueda
    const searchParams = {
        q: driveQuery,
        fields: 'files(id, name, mimeType, parents, webViewLink, description, capabilities, hasThumbnail, thumbnailLink)',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
    };

    // Solo ordenar por nombre si no estamos buscando por contenido
    if (!(queryParams.q && queryParams.q.trim())) {
        searchParams.orderBy = 'name';
    }

    const response = await drive.files.list(searchParams);

    const files = response.data.files || [];
    
    // Para cada PDF, verificaremos si tiene contenido buscable
    const filesWithOCRInfo = await Promise.all(files.map(async file => {
        let hasReadableText = true;

        if (file.mimeType === 'application/pdf') {
            if (queryParams.q && queryParams.q.trim()) {
                // Si estamos buscando por contenido y el archivo aparece, tiene texto
                hasReadableText = true;
            } else {
                try {
                    // Cuando no hay término de búsqueda, verificamos si el archivo tiene vocales
                    console.log(`Verificando texto en archivo "${file.name}" (${file.id})`);
                    
                    // Intentamos buscar el archivo por su ID primero
                    const fileInfo = await drive.files.get({
                        fileId: file.id,
                        supportsAllDrives: true,
                        fields: 'id, name, fullFileExtension, size, capabilities(canAddChildren)'
                    });

                    if (fileInfo.data.size && parseInt(fileInfo.data.size) > 1024) {
                        // Si el archivo tiene un tamaño razonable, intentamos buscar texto en él
                        try {
                            const searchResult = await drive.files.list({
                                q: `name = '${file.name.replace(/'/g, "\\'")}' and fullText contains 'a'`,
                                supportsAllDrives: true,
                                includeItemsFromAllDrives: true,
                                pageSize: 1,
                                fields: 'files(id)'
                            });

                            hasReadableText = searchResult.data.files && searchResult.data.files.length > 0;
                            console.log(`✓ "${file.name}": ${hasReadableText ? 'tiene texto legible' : 'sin texto indexado'}`);
                        } catch (searchErr) {
                            console.log(`Error en búsqueda de texto para "${file.name}":`, searchErr.message);
                            // Si hay error en la búsqueda, nos basamos en el tamaño del archivo
                            hasReadableText = parseInt(fileInfo.data.size) > 5120; // más de 5KB
                        }
                    } else {
                        hasReadableText = false;
                        console.log(`✗ "${file.name}" es demasiado pequeño para contener texto`);
                    }

                } catch (err) {
                    console.error(`Error verificando texto en ${file.name}:`, err.message);
                    hasReadableText = false;
                }
            }
        }

        return {
            ...file,
            hasReadableText,
            isScanned: !hasReadableText,
            searchQuery: queryParams.q || ''
        };
    }));

    return filesWithOCRInfo;
}
