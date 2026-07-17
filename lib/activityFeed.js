// lib/activityFeed.js
// A shared, global log of everyone's wins/losses across the whole bot —
// this is what powers the "live activity" ticker on the website, similar
// to a transaction history feed but showing every player's game results.

const { redis } = require('./gameStore');

const FEED_KEY = 'activity:feed';
const MAX_ENTRIES = 50;

/**
 * @param {object} entry
 *   entry.userId - bare phone number (no @s.whatsapp.net)
 *   entry.type - 'win' | 'loss'
 *   entry.amount - number
 *   entry.game - short label, e.g. 'Slots', 'Dig', 'Battle'
 */
async function logActivity(entry) {
  const record = JSON.stringify({ ...entry, ts: Date.now() });
  await redis.lpush(FEED_KEY, record);
  await redis.ltrim(FEED_KEY, 0, MAX_ENTRIES - 1);
}

async function getRecentActivity(limit = 20) {
  const raw = await redis.lrange(FEED_KEY, 0, limit - 1);
  return raw.map((item) => (typeof item === 'string' ? JSON.parse(item) : item));
}

module.exports = { logActivity, getRecentActivity };
