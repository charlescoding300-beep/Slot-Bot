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
 * useRedisAuthState(sessionId) -> { state, saveCreds }
 * Same shape as Baileys' built-in useMultiFileAuthState, so it's a drop-in swap:
 *
 *   const { state, saveCreds } = await useRedisAuthState(phoneNumber);
 *   const sock = makeWASocket({ auth: state });
 *   sock.ev.on('creds.update', saveCreds);
 */
async function useRedisAuthState(sessionId) {
  const creds = (await readData(sessionId, 'creds')) || initAuthCreds();

  const keys = {};

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

module.exports = { useRedisAuthState };
