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

module.exports = [
  { pattern: 'buyhp', alias: [], run: buyHP },
  {
    // Covers ".buy hp" (two words) since the command router splits on spaces
    pattern: 'buy',
    alias: [],
    run: async (sock, msg, args, ctx) => {
      if ((args[0] || '').toLowerCase() === 'hp') {
        return buyHP(sock, msg, args, ctx);
      }
      return sock.sendMessage(
        ctx.from,
        { text: withWatermark('🙄 Usage: .buyhp (or .buy hp) to repair your barracks for 1000g.') },
        { quoted: msg }
      );
    },
  },
];
