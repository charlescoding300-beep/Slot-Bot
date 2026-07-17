// lib/digStore.js
// Each player gets their own private counter of 10 digs. Once it hits 0,
// a 24h cooldown starts, then it automatically resets to 10 again.
// Everything lives in Redis — same persistence guarantee as gameStore.js.

const { redis } = require('./gameStore');

const MAX_DIGS = 10;
const RESET_MS = 24 * 60 * 60 * 1000;

function digKey(jid) {
  const id = jid.split('@')[0].split(':')[0];
  return `dig:${id}`;
}

async function getState(jid) {
  const key = digKey(jid);
  const data = await redis.hgetall(key);
  if (!data || Object.keys(data).length === 0) {
    const fresh = { remaining: MAX_DIGS, resetAt: 0 };
    await redis.hset(key, fresh);
    return fresh;
  }
  return {
    remaining: Number(data.remaining),
    resetAt: Number(data.resetAt || 0),
  };
}

/**
 * Attempts to consume one dig.
 * Returns:
 *   { status: 'oncooldown', remainingMs }        — all 10 used, still waiting
 *   { status: 'ok', remainingAfter }              — dig consumed successfully
 */
async function attemptDig(jid) {
  const key = digKey(jid);
  let state = await getState(jid);
  const now = Date.now();

  if (state.remaining <= 0) {
    if (now < state.resetAt) {
      return { status: 'oncooldown', remainingMs: state.resetAt - now };
    }
    // 24h passed — reset back to full
    state = { remaining: MAX_DIGS, resetAt: 0 };
    await redis.hset(key, state);
  }

  const remainingAfter = state.remaining - 1;
  const update = { remaining: remainingAfter };
  if (remainingAfter <= 0) {
    update.resetAt = now + RESET_MS;
  }
  await redis.hset(key, update);

  return { status: 'ok', remainingAfter };
}

module.exports = { MAX_DIGS, getState, attemptDig };
