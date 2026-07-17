// lib/begStore.js
const { redis } = require('./gameStore');

const EXPIRY_SECONDS = 600; // 10 minutes to respond

function begKey(begId) {
  return `beg:${begId}`;
}

async function createBeg(chatId, requester, target, amount) {
  const begId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const data = { chatId, requester, target, amount, status: 'pending' };
  await redis.set(begKey(begId), JSON.stringify(data), { ex: EXPIRY_SECONDS });
  return begId;
}

async function findPendingBegForUser(chatId, jid) {
  const keys = await redis.keys('beg:*');
  let latest = null;
  let latestId = null;
  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (data.chatId === chatId && data.target === jid && data.status === 'pending') {
      const id = key.split(':')[1];
      if (!latest || Number(id.split('_')[0]) > Number(latestId.split('_')[0])) {
        latest = data;
        latestId = id;
      }
    }
  }
  return latest ? { begId: latestId, ...latest } : null;
}

async function resolveBegStatus(begId, status) {
  const raw = await redis.get(begKey(begId));
  if (!raw) return null;
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  data.status = status;
  await redis.set(begKey(begId), JSON.stringify(data), { ex: EXPIRY_SECONDS });
  return data;
}

module.exports = { createBeg, findPendingBegForUser, resolveBegStatus };
