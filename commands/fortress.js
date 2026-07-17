// commands/fortress.js
const gameStore = require('../lib/gameStore');
const barracksStore = require('../lib/barracksStore');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'fortress',
  alias: ['upgrade' , 'up barrack'],
  run: async (sock, msg, args, { from, sender }) => {
    const barracks = await barracksStore.getBarracks(sender);

    if (barracks.level >= 5) {
      return sock.sendMessage(
        from,
        { text: withWatermark('👑 Your barracks is already a *MASTER FORTRESS* — max level!') },
        { quoted: msg }
      );
    }

    const cost = barracksStore.levelInfo(barracks.level).upgradeCost;
    const user = await gameStore.getUser(sender);

    if (user.wallet < cost) {
      return sock.sendMessage(
        from,
        { text: withWatermark(`🫠 You need *${cost.toLocaleString()}g* to upgrade, but only have *${user.wallet.toLocaleString()}g*.`) },
        { quoted: msg }
      );
    }

    await gameStore.adjustWallet(sender, -cost);
    const result = await barracksStore.upgradeBarracks(sender);
    const newInfo = barracksStore.levelInfo(result.newLevel);

    return sock.sendMessage(
      from,
      {
        text: withWatermark(
          `${newInfo.emoji} *UPGRADED TO ${newInfo.name}!* ${newInfo.emoji}\n\n💰 Cost: ${cost.toLocaleString()}g\n📦 New capacity: ${newInfo.capacity === Infinity ? 'UNLIMITED' : newInfo.capacity}\n❤️ New HP: ${newInfo.hp}\n\n"_${newInfo.vibe}_"`
        ),
        mentions: [sender],
      },
      { quoted: msg }
    );
  },
};
