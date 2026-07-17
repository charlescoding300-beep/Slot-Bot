// lib/shieldStore.js
// Unlimited-stacking shields: each shield = 5 charges, no cap on how many
// you can own. Charges are consumed one at a time when struck by Thunder.

const { redis } = require('./gameStore');

const SHIELD_COST = 1500;
const CHARGES_PER_SHIELD = 5;
const THUNDER_COST = 1000;
const THUNDER_DAMAGE = 50;

function shieldKey(jid) {
  const id = jid.split('@')[0].split(':')[0];
  return `shield:${id}`;
}

async function getShieldState(jid) {
  const raw = await redis.get(shieldKey(jid));
  const charges = raw ? Number(raw) : 0;
  return { charges, shields: Math.ceil(charges / CHARGES_PER_SHIELD) };
}

async function addShield(jid) {
  const newCharges = await redis.incrby(shieldKey(jid), CHARGES_PER_SHIELD);
  return newCharges;
}

/**
 * Consumes one shield charge if available.
 * Returns true if a charge was used (attack blocked), false if no charges left.
 */
async function useShieldCharge(jid) {
  const key = shieldKey(jid);
  const current = Number((await redis.get(key)) || 0);
  if (current <= 0) return false;
  await redis.decrby(key, 1);
  return true;
}

module.exports = {
  SHIELD_COST,
  CHARGES_PER_SHIELD,
  THUNDER_COST,
  THUNDER_DAMAGE,
  getShieldState,
  addShield,
  useShieldCharge,
};
