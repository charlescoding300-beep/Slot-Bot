require('dotenv').config({ path: require('path').join(__dirname, '.env') });
// index.js — CYBER X Army Bot main entry point

let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion;

async function loadBaileys() {
  const baileys = await import('@whiskeysockets/baileys');
  makeWASocket = baileys.default;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  fetchLatestWaWebVersion = baileys.fetchLatestWaWebVersion;
}

const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');

const { restoreSessionFromMega, backupSessionToMega, SESSIONS_DIR } = require('./lib/megaSession');
const botConfig = require('./lib/botConfig');
const { withWatermark } = require('./lib/watermark');
const { startWebServer } = require('./web/server');
const systemGuard = require('./lib/systemGuard');
const dropStore = require('./lib/dropStore');

const commands = new Map();

function loadCommands() {
  commands.clear();
  const dir = path.join(__dirname, 'commands');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    delete require.cache[require.resolve(path.join(dir, file))];
    const mod = require(path.join(dir, file));
    const entries = Array.isArray(mod) ? mod : [mod];
    for (const cmd of entries) {
      if (!cmd || !cmd.pattern || !cmd.run) continue;
      commands.set(cmd.pattern, cmd);
      for (const a of cmd.alias || []) commands.set(a, cmd);
    }
  }
  console.log(`✅ Loaded ${files.length} command files (${commands.size} triggers)`);
}

function clearSessionFolder() {
  try {
    if (fs.existsSync(SESSIONS_DIR)) {
      fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
      console.log('[session] Cleared stale session folder.');
    }
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  } catch (err) {
    console.error('[session] Failed to clear session folder:', err.message);
  }
}

let currentSock = null;

async function startBot() {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

  if (process.env.SESSION_ID && !fs.existsSync(path.join(SESSIONS_DIR, 'creds.json'))) {
    await restoreSessionFromMega(process.env.SESSION_ID);
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);

  let version = [2, 3000, 1042466098];
  try {
    const versionInfo = await fetchLatestWaWebVersion();
    version = versionInfo.version;
    console.log(`[version] WA Web version: ${version.join('.')}`);
  } catch (err) {
    console.log(`[version] Using hardcoded fallback: ${version.join('.')}`);
  }

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '22.04.4'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    retryRequestDelayMs: 1000,
  });

  // Request pairing code immediately after socket creation with a small
  // delay — this is the standard Baileys pattern that works reliably.
  // The 'connecting' state fires before the socket transport is ready,
  // causing requestPairingCode to fail with "Connection Closed" if called
  // there. A 3s delay gives the socket time to initialize properly.
  let pairingRequested = false;
  if (!sock.authState.creds.registered) {
    const number = (process.env.BOT_PHONE_NUMBER || '').replace(/[^0-9]/g, '');
    if (!number) {
      console.error('❌ Set BOT_PHONE_NUMBER in your environment variables and redeploy.');
      process.exit(1);
    }
    setTimeout(async () => {
      if (pairingRequested || sock.authState.creds.registered) return;
      pairingRequested = true;
      try {
        const code = await sock.requestPairingCode(number);
        console.log(`\n🔗 Pairing code for ${number}: ${code}\n`);
        console.log('Enter this in WhatsApp: Linked Devices > Link with phone number\n');
      } catch (err) {
        console.error('[pairing] Failed to request pairing code:', err.message);
        pairingRequested = false;
      }
    }, 3000);
  }

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    await backupSessionToMega();
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      console.log('========== CONNECTION CLOSED ==========');
      console.log('Status Code:', statusCode);
      console.log('Reason:', lastDisconnect?.error?.message);
      console.log('Logged out:', loggedOut);
      console.log('=======================================');

      if (loggedOut) {
        // Session is dead — clear the folder so the next attempt starts
        // fresh and requests a brand new pairing code automatically.
        console.log('[session] Logged out — clearing stale session and restarting fresh...');
        clearSessionFolder();
        currentSock = await startBot();
      } else {
        console.log('[reconnect] Reconnecting...');
        try { sock.end(undefined); } catch (_) {}
        currentSock = await startBot();
      }
    } else if (connection === 'open') {
      systemGuard.markActivity();
      console.log(`✅ Connected successfully`);

      const config = await botConfig.getConfig();
      if (!config.owner) {
        await botConfig.setOwner(sock.user.id);
        console.log(`👑 Owner set to ${sock.user.id}`);
      }

      if (!global.__cyberXWebStarted) {
        startWebServer(sock);
        global.__cyberXWebStarted = true;
        startKeepAlivePing();
      }
    }
  });

  loadCommands();

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    systemGuard.markActivity();
    if (!msg.message) return;

    const from = msg.key.remoteJid;
    const sender = msg.key.fromMe ? sock.user.id : (msg.key.participant || msg.key.remoteJid);

    if (from.endsWith('@g.us')) {
      try {
        const hasActive = await dropStore.hasActiveDrop(from);
        if (!hasActive && (await dropStore.canSpawnDrop(from)) && Math.random() < 0.15) {
          const tier = await dropStore.createDrop(from);
          await dropStore.markDropSpawned(from);
          await sock.sendMessage(from, {
            text: withWatermark(
              `${tier.tag} *${tier.label}!* ${tier.tag}\n\nA ${tier.type} is wandering!\nType *.claim* to recruit ${tier.type === 'giant' ? 'it' : 'him'}!\n\n*Value:* ${tier.value.toLocaleString()}g | *Time:* ${tier.time}s`
            ),
          });
        }
      } catch (err) {
        console.error('[drops] Error rolling drop:', err.message);
      }
    }

    const config = await botConfig.getConfig();

    if (config.mode === 'private') {
      const isOwnerMsg = await botConfig.isOwner(sender);
      if (!isOwnerMsg) return;
    }

    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      '';

    if (!body.startsWith(config.prefix)) return;

    const [cmdName, ...args] = body.slice(config.prefix.length).trim().split(/\s+/);
    if (!cmdName) return;

    const command = commands.get(cmdName.toLowerCase());
    if (!command) return;

    try {
      await command.run(sock, msg, args, { from, sender });
    } catch (err) {
      console.error(`Error running command "${cmdName}":`, err);
      await sock.sendMessage(from, { text: withWatermark('❌ Something went wrong running that command.') });
    }
  });

  return sock;
}

function startKeepAlivePing() {
  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  if (!selfUrl) {
    console.log('[keepalive] RENDER_EXTERNAL_URL not set — skipping self-ping.');
    return;
  }
  setInterval(async () => {
    try {
      const res = await fetch(selfUrl);
      console.log(`[keepalive] pinged self — status ${res.status}`);
    } catch (err) {
      console.error('[keepalive] ping failed:', err.message);
    }
  }, 4 * 60 * 1000);
}

(async () => {
  systemGuard.startCrashHandlers();
  systemGuard.startMemoryGuard();
  systemGuard.startStaleConnectionWatchdog(() => {
    if (currentSock) currentSock.end(new Error('stale connection watchdog restart'));
  });

  await loadBaileys();
  currentSock = await startBot();
})();

module.exports = { startBot, loadCommands, commands };
