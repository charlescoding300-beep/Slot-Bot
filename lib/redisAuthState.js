// lib/redisAuthState.js
// Drop-in replacement for Baileys' useMultiFileAuthState, backed by Upstash
// Redis instead of local disk. This is the critical piece: Render's free
// tier wipes local files on every restart/redeploy, which is why a
// file-based session always dies. Redis is external, so the session
// survives no matter what happens to the container.

const { Redis } = require('@upstash/redis');
const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function dataKey(sessionId, name) {
  return `session:${sessionId}:${name}`;
}

async function readData(sessionId, name) {
  const raw = await redis.get(dataKey(sessionId, name));
  if (!raw) return null;
  // Upstash may already return a parsed object — normalize to string first
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return JSON.parse(str, BufferJSON.reviver);
}

async function writeData(sessionId, name, data) {
  const str = JSON.stringify(data, BufferJSON.replacer);
  await redis.set(dataKey(sessionId, name), str);
}

async function removeData(sessionId, name) {
  try {
    await redis.del(dataKey(sessionId, name));
  } catch (_) {
    // ignore — key may not exist
  }
}

/**
 * Deletes every Redis key belonging to one phone number's session
 * (session:<sessionId>:creds, session:<sessionId>:keys-*, etc). Used when:
 *   - WhatsApp confirms this device was logged out (session is dead)
 *   - BOT_PHONE_NUMBER changed to a different number (old session is orphaned)
 * Never touches game:*, lb:*, or cooldown:* keys — those belong to
 * lib/gameStore.js and are a completely separate namespace.
 */
async function clearSession(sessionId) {
  let cursor = 0;
  let deleted = 0;
  do {
    const result = await redis.scan(cursor, { match: `session:${sessionId}:*`, count: 100 });
    cursor = Number(result[0]);
    const keys = result[1];
    if (keys.length) {
      await Promise.all(keys.map((k) => redis.del(k)));
      deleted += keys.length;
    }
  } while (cursor !== 0);
  return deleted;
}

// A single fixed key that remembers which phone number was last used, so
// index.js can detect a BOT_PHONE_NUMBER change and clear ONLY that old
// number's session — never touching a still-valid session for the current
// number, and never touching any other data.
const LAST_NUMBER_KEY = 'meta:lastPhoneNumber';

async function getLastPhoneNumber() {
  const raw = await redis.get(LAST_NUMBER_KEY);
  return raw ? String(raw) : null;
}

async function setLastPhoneNumber(number) {
  await redis.set(LAST_NUMBER_KEY, number);
}

/**
 * useRedisAuthState(sessionId) -> { state, saveCreds }
 * Same shape as Baileys' built-in useMultiFileAuthState, so it's a drop-in swap:
 *
 *   const { state, saveCreds } = await useRedisAuthState(phoneNumber);
 *   const sock = makeWASocket({ auth: state });
 *   sock.ev.on('creds.update', saveCreds);
 */
async function useRedisAuthState(sessionId) {
  const creds = (await readData(sessionId, 'creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(sessionId, `keys-${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `keys-${category}-${id}`;
              tasks.push(value ? writeData(sessionId, key, value) : removeData(sessionId, key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeData(sessionId, 'creds', creds);
    },
  };
}

module.exports = {
  useRedisAuthState,
  clearSession,
  getLastPhoneNumber,
  setLastPhoneNumber,
};
