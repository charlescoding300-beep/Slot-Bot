// commands/buyhp.js
const gameStore = require('../lib/gameStore');
const barracksStore = require('../lib/barracksStore');
const { withWatermark } = require('../lib/watermark');

const HP_COST = 1000;

async function buyHP(sock, msg, args, { from, sender }) {
  const user = await gameStore.getUser(sender);
  if (user.wallet < HP_COST) {
    return sock.sendMessage(
      from,
      { text: withWatermark(`🫠 You need *${HP_COST.toLocaleString()}g* to repair your barracks, but only have *${user.wallet.toLocaleString()}g*.`) },
      { quoted: msg }
    );
  }

  await gameStore.adjustWallet(sender, -HP_COST);
  const newHp = await barracksStore.healBarracksFull(sender);
  const barracks = await barracksStore.getBarracks(sender);
  const maxHp = barracksStore.levelInfo(barracks.level).hp;

  return sock.sendMessage(
    from,
    {
      text: withWatermark(`❤️ *Barracks fully repaired!*\n\n🏰 HP restored to *${newHp}/${maxHp}*\n💰 Cost: ${HP_COST.toLocaleString()}g`),
      mentions: [sender],
    },
    { quoted: msg }
  );
}

// Note: the ".buy"/".but" generic dispatcher (handles both "hp" and unit
// types like "swordman") lives in commands/buyunit.js, which imports
// buyHP from here — keeps ONE single source of truth for the "buy"
// pattern instead of two files fighting over the same command name.
module.exports = [{ pattern: 'buyhp', alias: [], run: buyHP }];
module.exports.buyHP = buyHP;
