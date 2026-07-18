require('dotenv').config({ path: require('path').join(__dirname, '.env') });
// index.js — CYBER X Army Bot main entry point
//
// Connection approach: copied directly from how Knightbot-MD and its whole
// fork family (SubZero-MD, LiltenBot, etc.) actually do it — official
// @whiskeysockets/baileys, local file auth (useMultiFileAuthState), backed
// up to Mega.nz via a SESSION_ID so it survives Render wiping local disk
// on restart. No Redis anywhere in the connection/session layer.
//
// (Game data — coins, army, everything players do — still saves to Upstash
// Redis instantly via lib/gameStore.js / lib/barracksStore.js. That's a
// completely separate system from the WhatsApp login session and is
// untouched by this change.)
//
// @whiskeysockets/baileys (7.x) is ESM-only — it CANNOT be loaded with a
// plain top-level require(), which crashes immediately with
// ERR_REQUIRE_ESM. It's loaded below via a dynamic import() inside an
// async loader instead, called once at startup before anything else needs
// it, with the pieces we use stashed into module-level variables.

let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion;

async function loadBaileys() {
  const baileys = await import('@whiskeysockets/baileys');
  makeWASocket = baileys.default;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
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

let currentSock = null;

async function startBot() {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

  // If we have a SESSION_ID saved from a previous run, pull the real
  // creds.json down from Mega BEFORE Baileys ever looks for it locally.
  if (process.env.SESSION_ID && !fs.existsSync(path.join(SESSIONS_DIR, 'creds.json'))) {
    await restoreSessionFromMega(process.env.SESSION_ID);
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);
  const { version } = await fetchLatestBaileysVersion();

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

  if (!sock.authState.creds.registered) {
    const number = (process.env.BOT_PHONE_NUMBER || '').replace(/[^0-9]/g, '');
    if (!number) {
      console.error('❌ Set BOT_PHONE_NUMBER in your environment variables and redeploy.');
      process.exit(1);
    }
    try {
      const code = await sock.requestPairingCode(number);
      console.log(`\n🔗 Pairing code for ${number}: ${code}\n`);
      console.log('Enter this in WhatsApp: Linked Devices > Link with phone number\n');
    } catch (err) {
      console.error('[pairing] Failed to request pairing code:', err.message);
    }
  }

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    // Keep the Mega backup fresh every time creds change (e.g. right after
    // linking) so the SESSION_ID always reflects the latest working session.
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
        console.log('[session] Logged out — delete sessions/creds.json and unset SESSION_ID to re-pair.');
      } else {
        console.log('[reconnect] Reconnecting...');
        try {
          sock.end(undefined);
        } catch (_) {}
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
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

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
    console.log('[keepalive] RENDER_EXTERNAL_URL not set — skipping self-ping (fine for local dev).');
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
