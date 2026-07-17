const MAX_HP = 100;

async function getArmy(jid) {
  return { jid, units: [], hp: MAX_HP };
}

function calculateDamage(army) {
  if (!army || !army.units) return 0;
  return army.units.reduce((sum, unit) => sum + (unit.damage || 0), 0);
}

module.exports = { MAX_HP, getArmy, calculateDamage };
