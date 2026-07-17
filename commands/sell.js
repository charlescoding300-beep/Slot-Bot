// commands/sell.js
const gameStore = require('../lib/gameStore');
const barracksStore = require('../lib/barracksStore');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'sell',
  alias: [],
  run: async (sock, msg, args, { from, sender }) => {
    const typeInput = (args[0] || '').toLowerCase();
    const qty = parseInt(args[1]) || 1;

    // Accept both singular unit names and a couple of common aliases
    const aliasMap = { soldier: 'swordman', sword: 'swordman', archers: 'archer', knights: 'knight', giants: 'giant' };
    const type = aliasMap[typeInput] || typeInput;

    if (!barracksStore.UNITS[type]) {
      return sock.sendMessage(
        from,
        { text: withWatermark('🙄 Usage: .sell <archer/swordman/knight/giant> <qty>') },
        { quoted: msg }
      );
    }

    const result = await barracksStore.sellUnit(sender, type, qty);
    if (!result.ok) {
      return sock.sendMessage(
        from,
        { text: withWatermark(`🙄 You only have *${result.have}* ${type}(s) — can't sell ${qty}.`) },
        { quoted: msg }
      );
    }

    const unit = barracksStore.UNITS[type];
    const refund = unit.cost * qty;
    await gameStore.adjustWallet(sender, refund);

    const barracks = await barracksStore.getBarracks(sender);
    const used = barracksStore.usedCapacity(barracks);
    const capacity = barracksStore.levelInfo(barracks.level).capacity;
    const capacityText = capacity === Infinity ? `${used}/♾️` : `${used}/${capacity}`;
    const user = await gameStore.getUser(sender);

    return sock.sendMessage(
      from,
      {
        text: withWatermark(
          `💰 *SOLD* 💰\n\n-${qty} ${unit.label}\n+${refund.toLocaleString()}g\n\n*NEW CAPACITY:* ${capacityText} units\n*BALANCE:* ${user.wallet.toLocaleString()}g`
        ),
        mentions: [sender],
      },
      { quoted: msg }
    );
  },
};
