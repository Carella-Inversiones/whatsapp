# Carella — Lector de WhatsApp → Google Sheets

Captura leads de WhatsApp de Zonaprop / Argenprop / Mercado Libre y los
escribe en la hoja CAMPAÑAS, sin usar la API oficial y dejando el celular
funcionando normal (se conecta como dispositivo vinculado).

## Arquitectura
WhatsApp → Baileys (Railway, 24/7) → POST → Web App de Apps Script → Sheet (CAMPAÑAS)

---

## 1) Apps Script (el receptor)
1. Abrí el Sheet del CRM → Extensiones → Apps Script.
2. Pegá `Receptor.gs` en un archivo.
3. Editá el bloque `SHEET`: `ID` del spreadsheet y un `SECRET` largo.
4. Implementar → Nueva implementación → **Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
5. Copiá la URL que termina en `/exec`. Esa es la `SHEET_WEBHOOK_URL`.

## 2) Railway (el lector)
1. Subí esta carpeta a un repo de GitHub (o usá el que ya tenés).
2. En Railway: New Project → Deploy from GitHub repo.
3. Variables de entorno:
   - `SHEET_WEBHOOK_URL` = la URL `/exec` del paso anterior
   - `SECRET` = el MISMO valor que pusiste en `Receptor.gs`
   - `AUTH_DIR` = `/data/auth_info`
4. Agregá un **Volume** montado en `/data` (para que la sesión sobreviva a los reinicios).
5. Deploy. Abrí los **Logs**: va a aparecer un QR en ASCII.
6. En el celu: WhatsApp → Dispositivos vinculados → Vincular dispositivo → escaneá el QR.
7. Cuando diga `✅ Conectado`, mandate un mensaje de prueba con la palabra
   "Zonaprop" desde otro número y fijate que aparezca la fila en CAMPAÑAS.

---

## Notas
- **Solo lectura.** No usar para enviar mensajes (sube mucho el riesgo de baneo).
- Conexión NO oficial (va contra los T&C de WhatsApp). Riesgo bajo en modo lectura, pero existe.
- Si la sesión se cae (logout), borrá `auth_info` del volumen y re-escaneá el QR.
- Solo registra mensajes que contienen el nombre de un portal. Para capturar
  TODO o cambiar el mapeo de columnas, editá `index.js` / `Receptor.gs`.
- Dedup por teléfono: un número que ya está en la columna C no genera fila nueva.
