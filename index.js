require('dotenv').config({ path: require('path').join(__dirname, '.env') });
// index.js — CYBER X Army Bot main entry point
//
// Connection logic follows the CYBER X SLOT BOT UPDATE spec exactly:
//   - Pairing code is requested ONCE, only when connection === 'open' and
//     creds aren't registered yet — never immediately after makeWASocket().
//   - On confirmed logout (or 401), the stale Redis session is cleared
//     automatically and a fresh pairing code gets requested on the next
//     attempt — the bot never keeps retrying with dead credentials.
//   - If BOT_PHONE_NUMBER changes, ONLY the old number's session is
//     cleared — a still-valid session for the current number is never
//     touched or deleted.
//   - Simple fixed reconnect delay (not exponential backoff) — kept
//     intentionally simple per spec, to avoid overcomplicating the retry
//     logic while systemGuard's watchdog handles genuinely stuck cases.
//   - Player game data (lib/dropStore.js, gameStore.js, etc.) lives under
//     entirely separate Redis keys and is never touched by any session
//     clearing here.
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
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');

const {
  useRedisAuthState,
  clearSession,
  getLastPhoneNumber,
  setLastPhoneNumber,
} = require('./lib/redisAuthState');
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
  // Reuses a valid session automatically if one exists in Redis for this
  // exact phone number. Never deletes a valid session on its own — clearing
  // only ever happens explicitly, from the logout/number-change logic below.
  const { state, saveCreds } = await useRedisAuthState(phoneNumber);
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

  // Guards against requesting more than one pairing code at the same time
  // for this socket instance.
  let pairingRequested = false;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'connecting') {
      console.log('Connecting to WhatsApp...');
    } else if (connection === 'open') {
      // Request the pairing code ONLY once the connection is actually
      // open — never immediately after makeWASocket(), which fires before
      // the transport is ready and fails instantly.
      if (!sock.authState.creds.registered && !pairingRequested) {
        pairingRequested = true;
        try {
          const number = phoneNumber.replace(/[^0-9]/g, '');
          const code = await sock.requestPairingCode(number);
          console.log(`\n🔗 Pairing code generated for ${number}: ${code}\n`);
          console.log('Enter this in WhatsApp: Linked Devices > Link with phone number\n');
        } catch (err) {
          console.error('[pairing] Failed to request pairing code:', err.message);
          pairingRequested = false; // allow a retry on the next 'open'
        }
      }

      systemGuard.markActivity();
      console.log(`✅ Connected: ${phoneNumber}`);
      console.log('Credentials saved.');

      const config = await botConfig.getConfig();
      if (!config.owner) {
        await botConfig.setOwner(sock.user.id);
        console.log(`👑 Owner set to ${sock.user.id}`);
      }

      if (!global.__cyberXKeepAliveStarted) {
        global.__cyberXKeepAliveStarted = true;
        startKeepAlivePing();
        console.log('Keepalive started.');
      }
    } else if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

      console.log('========== CONNECTION CLOSED ==========');
      console.log('Status Code:', statusCode);
      console.log('Reason:', lastDisconnect?.error?.message);
      console.log('Logged out:', loggedOut);
      console.log('=======================================');

      if (loggedOut) {
        console.log('Logged out — clearing stale session, a fresh pairing code will be requested.');
        try {
          await clearSession(phoneNumber);
          console.log('Session cleared.');
        } catch (err) {
          console.error('[session] Failed to clear session after logout:', err.message);
        }
      }

      console.log('Reconnecting...');
      // Simple fixed delay — kept deliberately simple rather than
      // exponential backoff, per spec. systemGuard's watchdog independently
      // handles a socket that's genuinely stuck.
      await new Promise((r) => setTimeout(r, 3000));
      currentSock = await startBot(phoneNumber);
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
  const trimmedNumber = number.trim();

  // Start the real web server immediately — before WhatsApp even begins
  // connecting — so Render's port scan always finds an open port right
  // away, regardless of how long pairing/reconnect takes. It's handed a
  // lazy accessor (not a live sock, which doesn't exist yet) so routes can
  // check "is the bot connected right now?" at request time instead.
  startWebServer(() => currentSock);
  console.log('Web server started.');

  systemGuard.startCrashHandlers();
  systemGuard.startMemoryGuard();
  systemGuard.startStaleConnectionWatchdog(() => {
    if (currentSock) currentSock.end(new Error('stale connection watchdog restart'));
  });

  // If BOT_PHONE_NUMBER changed since the last run, clear ONLY the old
  // number's session — a still-valid session for the current number is
  // never touched.
  try {
    const lastNumber = await getLastPhoneNumber();
    if (lastNumber && lastNumber !== trimmedNumber) {
      console.log(`[session] BOT_PHONE_NUMBER changed (${lastNumber} -> ${trimmedNumber}) — clearing old session only.`);
      await clearSession(lastNumber);
      console.log('Session cleared.');
    } else if (lastNumber === trimmedNumber) {
      console.log('Session restored.');
    }
    await setLastPhoneNumber(trimmedNumber);
  } catch (err) {
    console.error('[session] Failed to check/update last phone number marker:', err.message);
  }

  currentSock = await startBot(trimmedNumber);
})();

module.exports = { startBot, loadCommands, commands };
