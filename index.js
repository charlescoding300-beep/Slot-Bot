require('dotenv').config({ path: require('path').join(__dirname, '.env') });
// index.js — CYBER X Army Bot main entry point
//
// Connection logic is modeled directly on a minimal test file that was
// PROVEN to actually connect on this device — same Boom-based disconnect
// handling, same single pairing request, no unnecessary moving parts.
// The only thing swapped in is Redis for session storage instead of local
// files, since Render's free tier wipes local files on every restart.
//
// Wires together:
//   - Baileys connection via pairing code (no QR), official @whiskeysockets/baileys
//   - Redis-backed session persistence (survives Render restarts)
//   - Dynamic prefix (owner-configurable via .setprefix, default ".")
//   - Owner detection (auto-set to whichever account links the bot)
//   - Public/private mode toggle (.mode public / .mode private)
//   - Command auto-loading from /commands
//   - 4-minute keepalive self-ping
//   - Memory guard + crash handlers + stale-connection watchdog

const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const baileysLib = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');

const { useRedisAuthState } = require('./lib/redisAuthState');
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

async function startBot(phoneNumber) {
  // Same shape as useMultiFileAuthState('auth') from the proven test file —
  // just backed by Redis instead of a local folder.
  const { state, saveCreds } = await useRedisAuthState(phoneNumber, baileysLib);
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

  // Single pairing request — no duplicate/racing attempt anywhere else.
  if (!sock.authState.creds.registered) {
    const number = phoneNumber.replace(/[^0-9]/g, '');
    try {
      const code = await sock.requestPairingCode(number);
      console.log(`\n🔗 Pairing code for ${number}: ${code}\n`);
      console.log('Enter this in WhatsApp: Linked Devices > Link with phone number\n');
    } catch (err) {
      console.error('[pairing] Failed to request pairing code:', err.message);
    }
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      // Boom-based status extraction — same as the proven test file.
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      console.log('========== CONNECTION CLOSED ==========');
      console.log('Status Code:', statusCode);
      console.log('Reason:', lastDisconnect?.error?.message);
      console.log('Logged out:', loggedOut);
      console.log('=======================================');

      if (loggedOut) {
        console.log('[session] Logged out — a fresh pairing code will be needed on next start.');
      } else {
        console.log('[reconnect] Reconnecting...');
        try {
          sock.end(undefined); // close cleanly before creating a new socket
        } catch (_) {
          // already closed — fine
        }
        currentSock = await startBot(phoneNumber);
      }
    } else if (connection === 'open') {
      systemGuard.markActivity();
      console.log(`✅ ${phoneNumber} connected successfully`);

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

    // Random unit drops — only in group chats, lazily rolled on activity
    // rather than a true timer across every group (see lib/dropStore.js).
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
  const number = process.env.BOT_PHONE_NUMBER;
  if (!number) {
    console.error('❌ Set BOT_PHONE_NUMBER in your environment variables (e.g. 2348012345678) and redeploy.');
    process.exit(1);
  }

  systemGuard.startCrashHandlers();
  systemGuard.startMemoryGuard();
  systemGuard.startStaleConnectionWatchdog(() => {
    if (currentSock) currentSock.end(new Error('stale connection watchdog restart'));
  });

  currentSock = await startBot(number.trim());
})();

module.exports = { startBot, loadCommands, commands };
