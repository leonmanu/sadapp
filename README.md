# SadApp - Buscador en Google Drive

Este proyecto demuestra cómo buscar archivos en una carpeta de Google Drive desde un servidor Node.js/Express.

Dos modos de autenticación soportados:

1. OAuth2 (usuario) — rutas: `/auth/google` y `/auth/google/callback`.
   - Útil para acceder a la cuenta de un usuario.

2. Cuenta de servicio (server-to-server) — `service-account.json`.
   - Recomendado para búsqueda automática sin interacción.
   - Debes compartir la carpeta de Drive con el email de la cuenta de servicio (client_email) para que pueda ver los archivos.

Cómo usar la cuenta de servicio (sin iniciar sesión):

1. Crea una cuenta de servicio en Google Cloud Console y descarga la clave JSON.
2. Coloca el archivo en el proyecto con el nombre `service-account.json` (está en `.gitignore`).
3. Comparte la carpeta de Drive que quieres buscar con el `client_email` que aparece en el JSON.
4. Ejecuta el servidor:

```powershell
node .\server.js
```

5. Llama al endpoint de búsqueda:

```powershell
# Buscar por nombre en la carpeta
curl "http://localhost:3000/drive/search?q=nombreDeArchivo&folderId=ID_DE_LA_CARPETA"
```

Si prefieres OAuth2, visita `http://localhost:3000/auth/google` y sigue el flujo.

Notas de seguridad
- No subir `service-account.json` ni `.env` a git.
- Rota claves si se filtran.

