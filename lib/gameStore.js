// lib/gameStore.js
// Persistent game/economy storage using Upstash Redis.
// Every write hits Redis immediately (no in-memory cache, no batching) so a
// Render restart/redeploy never loses a user's coins, XP, items, etc.

const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ---- key helpers -----------------------------------------------------

function userKey(jid) {
  // bare-digit form, same normalization style you use for admin checks
  const id = jid.split('@')[0].split(':')[0];
  return `game:user:${id}`;
}

function cooldownKey(cmd, jid) {
  const id = jid.split('@')[0].split(':')[0];
  return `cooldown:${cmd}:${id}`;
}

const LB_COINS = 'lb:coins'; // sorted set: member=userId, score=wallet+bank
const LB_XP = 'lb:xp';
const LB_LEVEL = 'lb:level';

// ---- defaults ----------------------------------------------------------

const DEFAULT_USER = {
  wallet: 1000, // new users start with 1000 coins, per your spec
  bank: 0,
  xp: 0,
  level: 0,
  wins: 0,
  losses: 0,
  bankLevel: 0,
  pet: '',
  frame: '',
  gun: '',
  heistkit: 0,
  car: 0,
  house: 0,
  club: '',
};

// ---- core read/write -----------------------------------------------------

/**
 * Get a user's full game state. Creates the hash with defaults if missing.
 */
async function getUser(jid) {
  const key = userKey(jid);
  const data = await redis.hgetall(key);

  if (!data || Object.keys(data).length === 0) {
    await redis.hset(key, DEFAULT_USER);
    await redis.zadd(LB_COINS, { score: DEFAULT_USER.wallet, member: key.split(':').pop() });
    return { ...DEFAULT_USER };
  }

  // Upstash returns strings/numbers mixed depending on client version — normalize numerics
  const numeric = ['wallet', 'bank', 'xp', 'level', 'wins', 'losses', 'bankLevel', 'heistkit', 'car', 'house'];
  for (const field of numeric) {
    if (data[field] !== undefined) data[field] = Number(data[field]);
  }
  return { ...DEFAULT_USER, ...data };
}

/**
 * Atomically adjust wallet coins by delta (positive to add, negative to subtract).
 * Returns the new wallet balance. Also keeps the coins leaderboard in sync.
 */
async function adjustWallet(jid, delta) {
  const key = userKey(jid);
  await ensureExists(jid);
  const newBalance = await redis.hincrby(key, 'wallet', delta);
  await syncCoinsLeaderboard(jid);
  return newBalance;
}

/**
 * Atomically adjust bank balance by delta.
 */
async function adjustBank(jid, delta) {
  const key = userKey(jid);
  await ensureExists(jid);
  const newBalance = await redis.hincrby(key, 'bank', delta);
  await syncCoinsLeaderboard(jid);
  return newBalance;
}

/**
 * Move coins between wallet and bank atomically-ish (two incrbys; fine for this use case).
 * direction: 'deposit' (wallet -> bank) or 'withdraw' (bank -> wallet)
 */
async function transferBankWallet(jid, direction, amount) {
  if (direction === 'deposit') {
    await adjustWallet(jid, -amount);
    await adjustBank(jid, amount);
  } else {
    await adjustBank(jid, -amount);
    await adjustWallet(jid, amount);
  }
}

/**
 * Atomically adjust XP. Handles level-up rollover (every 100 XP = 1 level, tweak as needed).
 */
async function adjustXP(jid, delta) {
  const key = userKey(jid);
  await ensureExists(jid);
  const newXP = await redis.hincrby(key, 'xp', delta);
  const user = await getUser(jid);
  const newLevel = Math.floor(newXP / 100);
  if (newLevel !== user.level) {
    await redis.hset(key, { level: newLevel });
    await redis.zadd(LB_LEVEL, { score: newLevel, member: key.split(':').pop() });
  }
  await redis.zadd(LB_XP, { score: newXP, member: key.split(':').pop() });
  return newXP;
}

/**
 * Record a win or loss (for !stats).
 */
async function recordResult(jid, won) {
  const key = userKey(jid);
  await ensureExists(jid);
  await redis.hincrby(key, won ? 'wins' : 'losses', 1);
}

/**
 * Set arbitrary field(s) directly — e.g. buying a pet, gun, house.
 * fields: { pet: 'Dragon', gun: 1 }
 */
async function setFields(jid, fields) {
  const key = userKey(jid);
  await ensureExists(jid);
  await redis.hset(key, fields);
}

async function ensureExists(jid) {
  const key = userKey(jid);
  const exists = await redis.exists(key);
  if (!exists) {
    await redis.hset(key, DEFAULT_USER);
    await redis.zadd(LB_COINS, { score: DEFAULT_USER.wallet, member: key.split(':').pop() });
  }
}

async function syncCoinsLeaderboard(jid) {
  const user = await getUser(jid);
  const key = userKey(jid);
  const total = Number(user.wallet) + Number(user.bank);
  await redis.zadd(LB_COINS, { score: total, member: key.split(':').pop() });
}

// ---- leaderboards -----------------------------------------------------

/**
 * type: 'coins' | 'xp' | 'level'
 */
async function getLeaderboard(type = 'coins', limit = 10) {
  const key = type === 'xp' ? LB_XP : type === 'level' ? LB_LEVEL : LB_COINS;
  // withScores, descending
  const raw = await redis.zrange(key, 0, limit - 1, { rev: true, withScores: true });
  const result = [];
  for (let i = 0; i < raw.length; i += 2) {
    result.push({ userId: raw[i], score: Number(raw[i + 1]) });
  }
  return result;
}

// ---- cooldowns ----------------------------------------------------------

/**
 * Returns remaining seconds on cooldown, or 0 if the command is free to use.
 * On call, if free, immediately sets the cooldown (atomic via SET NX EX).
 */
async function checkAndSetCooldown(cmd, jid, seconds) {
  const key = cooldownKey(cmd, jid);
  const set = await redis.set(key, '1', { nx: true, ex: seconds });
  if (set) return 0; // wasn't on cooldown, now is
  const ttl = await redis.ttl(key);
  return ttl > 0 ? ttl : 0;
}

module.exports = {
  redis,
  getUser,
  adjustWallet,
  adjustBank,
  transferBankWallet,
  adjustXP,
  recordResult,
  setFields,
  getLeaderboard,
  checkAndSetCooldown,
};
