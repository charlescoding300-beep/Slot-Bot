// lib/dropStore.js
// Random unit drops posted into a chat — first person to .claim it gets the
// unit free. Only one drop active per chat at a time.

const { redis } = require('./gameStore');

const RARITY_TABLE = [
  { type: 'swordman', chance: 0.60, value: 50, time: 60, label: 'UNIT DROP', tag: '⚔️' },
  { type: 'archer', chance: 0.25, value: 100, time: 45, label: 'RARE UNIT DROP', tag: '🏹' },
  { type: 'knight', chance: 0.10, value: 500, time: 30, label: 'EPIC UNIT DROP', tag: '🛡️' },
  { type: 'giant', chance: 0.05, value: 2000, time: 15, label: 'LEGENDARY DROP', tag: '👑' },
];

function dropKey(chatId) {
  return `drop:${chatId}`;
}

function cooldownKey(chatId) {
  return `dropcooldown:${chatId}`;
}

/**
 * True if enough time has passed since the last drop in this chat
 * (randomized 30-90 min gap between drops).
 */
async function canSpawnDrop(chatId) {
  const onCooldown = await redis.get(cooldownKey(chatId));
  return !onCooldown;
}

async function markDropSpawned(chatId) {
  const gapMinutes = 30 + Math.random() * 60; // 30-90 min
  await redis.set(cooldownKey(chatId), '1', { ex: Math.round(gapMinutes * 60) });
}

function rollRarity() {
  const roll = Math.random();
  let cumulative = 0;
  for (const tier of RARITY_TABLE) {
    cumulative += tier.chance;
    if (roll <= cumulative) return tier;
  }
  return RARITY_TABLE[0];
}

async function hasActiveDrop(chatId) {
  const raw = await redis.get(dropKey(chatId));
  return !!raw;
}

async function createDrop(chatId) {
  const tier = rollRarity();
  const data = { type: tier.type, value: tier.value, claimed: false };
  await redis.set(dropKey(chatId), JSON.stringify(data), { ex: tier.time });
  return { ...tier };
}

/**
 * Attempts to claim the active drop. Atomic-ish: reads then immediately
 * marks claimed, first caller wins in practice for a single-bot process.
 */
async function claimDrop(chatId) {
  const raw = await redis.get(dropKey(chatId));
  if (!raw) return null;
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (data.claimed) return null;

  data.claimed = true;
  await redis.set(dropKey(chatId), JSON.stringify(data), { ex: 5 });
  return data;
}

module.exports = { RARITY_TABLE, hasActiveDrop, createDrop, claimDrop, canSpawnDrop, markDropSpawned };
