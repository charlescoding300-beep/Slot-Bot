// commands/claim.js
const dropStore = require('../lib/dropStore');
const barracksStore = require('../lib/barracksStore');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'claim',
  alias: [],
  run: async (sock, msg, args, { from, sender }) => {
    const claimed = await dropStore.claimDrop(from);

    if (!claimed) {
      return sock.sendMessage(
        from,
        { text: withWatermark('❌ TOO LATE!\n\nThe unit wandered away... (or there was nothing to claim)') },
        { quoted: msg }
      );
    }

    const barracks = await barracksStore.getBarracks(sender);
    const capacity = barracksStore.levelInfo(barracks.level).capacity;
    const used = barracksStore.usedCapacity(barracks);

    if (used + 1 > capacity) {
      return sock.sendMessage(
        from,
        {
          text: withWatermark(`🏚️ @${sender.split('@')[0]} claimed it, but your barracks is full! Upgrade with .fortress to claim drops like this.`),
          mentions: [sender],
        },
        { quoted: msg }
      );
    }

    await barracksStore.buyUnit(sender, claimed.type, 1);
    const unit = barracksStore.UNITS[claimed.type];

    return sock.sendMessage(
      from,
      {
        text: withWatermark(
          `✅ CLAIMED!\n\n@${sender.split('@')[0]} recruited the ${unit.label}!\nAdded to barracks for free. (worth ${claimed.value}g)`
        ),
        mentions: [sender],
      },
      { quoted: msg }
    );
  },
};
