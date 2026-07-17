// lib/barracksStore.js
// Single source of truth for the army/barracks economy. Replaces the old
// armyStore.js roster (soldier/archer/giant) with the new one
// (archer/swordman/knight/giant), and is used by BOTH:
//   1. The siege system (.barrack, .shop, .sell, .fortress, Thunder Strike)
//      — barracks has its own level, capacity, and HP pool.
//   2. The .battle challenge system — troop-casualty simulation using each
//      unit's own HP/DMG, weakest dies first (same shape as before, new roster).
//
// Currency: same wallet as .slots/.dig/.donate (via gameStore.adjustWallet),
// just labeled "g"/"gold" in these commands for flavor — one currency, not two.

const { redis } = require('./gameStore');

const UNITS = {
  archer: { cost: 25, hp: 100, dmg: 50, emoji: '🏹', label: 'Archer' },
  swordman: { cost: 50, hp: 150, dmg: 30, emoji: '🗡️', label: 'Swordman' },
  knight: { cost: 450, hp: 400, dmg: 180, emoji: '🐎', label: 'Knight' },
  giant: { cost: 1500, hp: 800, dmg: 120, emoji: '🧌', label: 'Giant' },
};

// Weakest HP dies first in battle casualty simulation
const DEATH_ORDER = ['archer', 'swordman', 'knight', 'giant'];

const BARRACKS_LEVELS = [
  { level: 1, name: 'LOW BARRACK', emoji: '🪵', stars: '⭐☆☆☆☆', capacity: 5, hp: 100, upgradeCost: 1000, vibe: 'Start small. Build an empire.' },
  { level: 2, name: 'GOOD BARRACK', emoji: '🧱', stars: '⭐⭐☆☆☆', capacity: 50, hp: 250, upgradeCost: 3000, vibe: 'Good foundation. Giants coming soon.' },
  { level: 3, name: 'GUARANTEED BARRACK', emoji: '⛨', stars: '⭐⭐⭐☆☆', capacity: 500, hp: 500, upgradeCost: 5000, vibe: 'Your army can now field Giants!' },
  { level: 4, name: 'PRIME BARRACK', emoji: '🏛️', stars: '⭐⭐⭐⭐☆', capacity: 2000, hp: 1000, upgradeCost: 10000, vibe: 'Almost at Fortress. One more push!' },
  { level: 5, name: 'MASTER FORTRESS', emoji: '👑', stars: '⭐⭐⭐⭐⭐', capacity: Infinity, hp: 2500, upgradeCost: null, vibe: 'YOU ARE A WARLORD. FEAR THIS CASTLE.' },
];

function barracksKey(jid) {
  const id = jid.split('@')[0].split(':')[0];
  return `barracks:${id}`;
}

function levelInfo(level) {
  return BARRACKS_LEVELS[level - 1];
}

async function getBarracks(jid) {
  const key = barracksKey(jid);
  const data = await redis.hgetall(key);
  if (!data || Object.keys(data).length === 0) {
    const fresh = { level: 1, hp: BARRACKS_LEVELS[0].hp, archer: 0, swordman: 0, knight: 0, giant: 0 };
    await redis.hset(key, fresh);
    return fresh;
  }
  return {
    level: Number(data.level),
    hp: Number(data.hp),
    archer: Number(data.archer || 0),
    swordman: Number(data.swordman || 0),
    knight: Number(data.knight || 0),
    giant: Number(data.giant || 0),
  };
}

function usedCapacity(barracks) {
  return barracks.archer + barracks.swordman + barracks.knight + barracks.giant;
}

/**
 * Total HP/DMG of the current garrison for the siege card display.
 * Giants get +15% HP at Fortress (lvl 5).
 */
function calculatePower(barracks) {
  const isFortress = barracks.level === 5;
  let hp = 0;
  let dmg = 0;
  for (const type of DEATH_ORDER) {
    const count = barracks[type];
    const unit = UNITS[type];
    let unitHp = unit.hp;
    if (type === 'giant' && isFortress) unitHp = Math.round(unitHp * 1.15);
    hp += count * unitHp;
    dmg += count * unit.dmg;
  }
  return { hp, dmg };
}

async function buyUnit(jid, type, qty) {
  const barracks = await getBarracks(jid);
  const capacity = levelInfo(barracks.level).capacity;
  const used = usedCapacity(barracks);

  if (used + qty > capacity) {
    return { ok: false, reason: 'capacity', spaceLeft: capacity === Infinity ? Infinity : capacity - used };
  }

  const key = barracksKey(jid);
  const newCount = await redis.hincrby(key, type, qty);
  return { ok: true, newCount };
}

async function sellUnit(jid, type, qty) {
  const barracks = await getBarracks(jid);
  if (barracks[type] < qty) {
    return { ok: false, reason: 'insufficient', have: barracks[type] };
  }
  const key = barracksKey(jid);
  const newCount = await redis.hincrby(key, type, -qty);
  return { ok: true, newCount };
}

async function upgradeBarracks(jid) {
  const barracks = await getBarracks(jid);
  if (barracks.level >= 5) {
    return { ok: false, reason: 'maxlevel' };
  }
  const current = levelInfo(barracks.level);
  const key = barracksKey(jid);
  const nextLevel = barracks.level + 1;
  await redis.hset(key, { level: nextLevel, hp: levelInfo(nextLevel).hp });
  return { ok: true, newLevel: nextLevel, cost: current.upgradeCost };
}

/**
 * Fully restores barracks siege-HP to the current level's max. This is what
 * .buyhp / .buy hp charges 1000g for.
 */
async function healBarracksFull(jid) {
  const barracks = await getBarracks(jid);
  const key = barracksKey(jid);
  const maxHp = levelInfo(barracks.level).hp;
  await redis.hset(key, { hp: maxHp });
  return maxHp;
}

/**
 * Deals siege damage to a barracks (Thunder Strike system). Handles
 * downgrade (100% refund of excess-capacity units) and the level-1 total
 * wipe (no refund, instant free rebuild).
 */
async function damageBarracks(jid, amount) {
  const barracks = await getBarracks(jid);
  const key = barracksKey(jid);
  const newHp = barracks.hp - amount;

  if (newHp > 0) {
    await redis.hset(key, { hp: newHp });
    return { destroyed: false, newHp };
  }

  if (barracks.level === 1) {
    await redis.hset(key, { hp: levelInfo(1).hp, archer: 0, swordman: 0, knight: 0, giant: 0 });
    return { destroyed: true, wiped: true, newLevel: 1 };
  }

  const newLevel = barracks.level - 1;
  const newCapacity = levelInfo(newLevel).capacity;
  const used = usedCapacity(barracks);
  const units = { archer: barracks.archer, swordman: barracks.swordman, knight: barracks.knight, giant: barracks.giant };
  let refund = 0;
  let excess = used - newCapacity;

  for (const type of DEATH_ORDER) {
    if (excess <= 0) break;
    const remove = Math.min(units[type], excess);
    units[type] -= remove;
    refund += remove * UNITS[type].cost;
    excess -= remove;
  }

  await redis.hset(key, { level: newLevel, hp: levelInfo(newLevel).hp, ...units });
  return { destroyed: true, wiped: false, newLevel, refund };
}

// ---- battle casualty simulation (used by .battle / battleActions.js) -----

function cloneUnits(barracks) {
  return { archer: barracks.archer, swordman: barracks.swordman, knight: barracks.knight, giant: barracks.giant };
}

function totalUnits(units) {
  return units.archer + units.swordman + units.knight + units.giant;
}

function unitDamageOutput(units) {
  let dmg = 0;
  for (const type of DEATH_ORDER) dmg += units[type] * UNITS[type].dmg;
  return dmg;
}

/**
 * Applies incoming damage as casualties, weakest unit dies first.
 * Returns { lost, goldValue } — goldValue is the total cost of units lost
 * (used for the winner's war-spoils payout).
 */
function applyCasualties(units, incomingDamage, isFortress) {
  let remaining = incomingDamage;
  let lost = 0;
  let goldValue = 0;

  for (const type of DEATH_ORDER) {
    if (remaining <= 0) break;
    let unitHp = UNITS[type].hp;
    if (type === 'giant' && isFortress) unitHp = Math.round(unitHp * 1.15);
    const canKill = Math.min(units[type], Math.floor(remaining / unitHp));
    if (canKill > 0) {
      units[type] -= canKill;
      remaining -= canKill * unitHp;
      lost += canKill;
      goldValue += canKill * UNITS[type].cost;
    }
  }
  return { lost, goldValue };
}

/**
 * Full round-by-round battle simulation between two barracks snapshots.
 * Returns { rounds, winner: 'A'|'B'|'draw', finalUnitsA, finalUnitsB,
 *           goldValueLostA, goldValueLostB }
 */
function simulateBattle(barracksA, barracksB) {
  const unitsA = cloneUnits(barracksA);
  const unitsB = cloneUnits(barracksB);
  const isFortressA = barracksA.level === 5;
  const isFortressB = barracksB.level === 5;

  const rounds = [];
  let round = 0;
  let goldValueLostA = 0;
  let goldValueLostB = 0;

  while (totalUnits(unitsA) > 0 && totalUnits(unitsB) > 0 && round < 30) {
    round++;
    const dmgA = unitDamageOutput(unitsA);
    const dmgB = unitDamageOutput(unitsB);
    const resultB = applyCasualties(unitsB, dmgA, isFortressB);
    const resultA = applyCasualties(unitsA, dmgB, isFortressA);
    goldValueLostA += resultA.goldValue;
    goldValueLostB += resultB.goldValue;
    rounds.push({ round, lostA: resultA.lost, lostB: resultB.lost });
    if (resultA.lost === 0 && resultB.lost === 0) break;
  }

  const powerA = totalUnits(unitsA);
  const powerB = totalUnits(unitsB);
  let winner = 'draw';
  if (powerA > powerB) winner = 'A';
  else if (powerB > powerA) winner = 'B';

  return { rounds, winner, finalUnitsA: unitsA, finalUnitsB: unitsB, goldValueLostA, goldValueLostB };
}

/**
 * Top 10 players by total army power (HP+DMG combined), for .leaderboard.
 * Scans all barracks:* keys — fine at this scale, same pattern used
 * elsewhere in this project (battleStore, begStore).
 */
async function getGeneralsLeaderboard(limit = 10) {
  const keys = await redis.keys('barracks:*');
  const results = [];
  for (const key of keys) {
    const data = await redis.hgetall(key);
    if (!data || Object.keys(data).length === 0) continue;
    const barracks = {
      level: Number(data.level),
      archer: Number(data.archer || 0),
      swordman: Number(data.swordman || 0),
      knight: Number(data.knight || 0),
      giant: Number(data.giant || 0),
    };
    const power = calculatePower(barracks);
    const totalPower = power.hp + power.dmg;
    if (totalPower > 0) {
      results.push({ userId: key.split(':')[1], power: totalPower });
    }
  }
  results.sort((a, b) => b.power - a.power);
  return results.slice(0, limit);
}

module.exports = {
  UNITS,
  DEATH_ORDER,
  BARRACKS_LEVELS,
  levelInfo,
  getBarracks,
  usedCapacity,
  calculatePower,
  buyUnit,
  sellUnit,
  upgradeBarracks,
  healBarracksFull,
  damageBarracks,
  simulateBattle,
  totalUnits,
  getGeneralsLeaderboard,
};
