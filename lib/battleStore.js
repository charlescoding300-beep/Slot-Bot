// lib/battleStore.js
// Tracks pending .battle challenges so .accept/.forfeit know what they're
// responding to. Stored in Redis (short-lived, 10 min expiry) since a
// challenge is a temporary state, not permanent game data.

const { redis } = require('./gameStore');

const EXPIRY_SECONDS = 600; // 10 minutes to respond

function battleKey(battleId) {
  return `battle:${battleId}`;
}

/**
 * Creates a new pending battle challenge.
 */
async function createBattle(chatId, challengerJid, challengedJid) {
  const battleId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const data = {
    chatId,
    challenger: challengerJid,
    challenged: challengedJid,
    status: 'pending',
  };
  await redis.set(battleKey(battleId), JSON.stringify(data), { ex: EXPIRY_SECONDS });
  return battleId;
}

/**
 * Find the most recent pending battle in a chat where `jid` is the challenged party.
 * Used for the plain-text `.accept` / `.forfeit` fallback (no battle ID needed).
 */
async function findPendingBattleForUser(chatId, jid) {
  const keys = await redis.keys('battle:*');
  let latest = null;
  let latestId = null;
  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (data.chatId === chatId && data.challenged === jid && data.status === 'pending') {
      const id = key.split(':')[1];
      if (!latest || Number(id.split('_')[0]) > Number(latestId.split('_')[0])) {
        latest = data;
        latestId = id;
      }
    }
  }
  return latest ? { battleId: latestId, ...latest } : null;
}

async function getBattle(battleId) {
  const raw = await redis.get(battleKey(battleId));
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function resolveBattleStatus(battleId, status) {
  const data = await getBattle(battleId);
  if (!data) return null;
  data.status = status;
  await redis.set(battleKey(battleId), JSON.stringify(data), { ex: EXPIRY_SECONDS });
  return data;
}

module.exports = {
  createBattle,
  findPendingBattleForUser,
  getBattle,
  resolveBattleStatus,
};
