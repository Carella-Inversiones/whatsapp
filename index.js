/**
 * ============================================================
 *  CARELLA INVERSIONES — Lector de WhatsApp (dispositivo vinculado)
 * ============================================================
 *  - Se conecta a WhatsApp como un dispositivo vinculado más (QR),
 *    así que el celular SIGUE funcionando normal.
 *  - Lee los mensajes entrantes (solo lectura, no envía nada).
 *  - Detecta los que vienen de Zonaprop / Argenprop / Mercado Libre.
 *  - Manda cada lead a la Web App de Apps Script, que lo escribe
 *    en el Google Sheet (CAMPAÑAS).
 *
 *  Corre en Railway 24/7. Necesita un volumen persistente para la
 *  sesión (AUTH_DIR), si no pide QR en cada reinicio.
 *
 *  ⚠️ Conexión no oficial (va contra los T&C de WhatsApp).
 *     Usalo SOLO en modo lectura para minimizar riesgo de baneo.
 * ============================================================
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const http = require('http');

/* ----------------- CONFIG (vía variables de entorno en Railway) ----------------- */
const CONFIG = {
  WEBHOOK_URL: process.env.SHEET_WEBHOOK_URL,
  SECRET: process.env.SECRET || '',
  AUTH_DIR: process.env.AUTH_DIR || './auth_info',
  PORTALES: {
    'Zonaprop': ['zonaprop'],
    'Argenprop': ['argenprop'],
    'Mercado Libre': ['mercado libre', 'mercadolibre', 'meli']
  }
};

/* ----------------- Helpers ----------------- */
function detectarPortal(texto) {
  const t = (texto || '').toLowerCase();
  for (const [nombre, claves] of Object.entries(CONFIG.PORTALES)) {
    if (claves.some(k => t.includes(k))) return nombre;
  }
  return null;
}

function extraerTexto(message) {
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ''
  );
}

async function enviarASheet(data) {
  if (!CONFIG.WEBHOOK_URL) {
    console.error('Falta SHEET_WEBHOOK_URL. No se envió.');
    return;
  }
  try {
    const res = await fetch(CONFIG.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, secret: CONFIG.SECRET })
    });
    console.log('-> Sheet:', res.status, await res.text());
  } catch (e) {
    console.error('Error enviando a Sheet:', e.message);
  }
}

/* ----------------- WhatsApp ----------------- */
// Freno de reconexion: garantiza UN solo reintento a la vez, con espera.
let reconnectTimer = null;

function programarReconexion() {
  if (reconnectTimer) return;               // ya hay uno agendado, no amontonar
  console.log('Reintentando conexion en 5 segundos...');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    start();
  }, 5000);
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(CONFIG.AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      console.log('\n[QR] Escanea este QR desde el celu:');
      console.log('   WhatsApp -> Dispositivos vinculados -> Vincular dispositivo\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('OK Conectado a WhatsApp. El celular sigue funcionando normal.');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;

      if (code === DisconnectReason.loggedOut) {
        console.log('Sesion cerrada (logout). Borra la carpeta de sesion y re-escanea el QR.');
        return;   // NO reconectar: la sesion murio, hay que re-vincular a mano
      }

      console.log('Conexion cerrada (codigo ' + code + ').');
      programarReconexion();   // un solo reintento, con freno
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key.fromMe) continue;
      const jid = msg.key.remoteJid || '';
      if (jid.endsWith('@g.us')) continue;
      if (jid === 'status@broadcast') continue;

      const texto = extraerTexto(msg.message);
      if (!texto) continue;

      const portal = detectarPortal(texto);
      if (!portal) continue;

      const telefono = jid.split('@')[0];
      const nombre = msg.pushName || '';
      const fecha = new Date().toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires'
      });

      console.log('Lead ' + portal + ' - ' + nombre + ' (' + telefono + ')');
      await enviarASheet({ fecha, telefono, nombre, portal, mensaje: texto });
    }
  });
}

/* ----------------- Servidor minimo (Railway necesita un puerto abierto) ----------------- */
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Carella WA reader OK');
  })
  .listen(process.env.PORT || 3000);

start();
