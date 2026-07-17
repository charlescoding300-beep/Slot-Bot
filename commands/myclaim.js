// commands/myclaim.js
const gameStore = require('../lib/gameStore');
const shieldStore = require('../lib/shieldStore');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'myclaim',
  alias: ['myclaims', 'myshield', 'shields'],
  run: async (sock, msg, args, { from, sender }) => {
    const displayName = msg.pushName || sender.split('@')[0];
    const shieldState = await shieldStore.getShieldState(sender);

    const thunderKey = `thunder:${sender.split('@')[0].split(':')[0]}`;
    const thunderOwned = Number((await gameStore.redis.get(thunderKey)) || 0);

    const text = withWatermark(
      `🎒 *${displayName}'s Arsenal*\n\n` +
      `🛡️ Shields: *${shieldState.shields}* (${shieldState.charges} charges left)\n` +
      `⛈️ Thunder Strikes: *${thunderOwned}*\n\n` +
      `_${shieldState.charges > 0 ? 'Any incoming .strike will auto-block using a charge.' : "No shields — you're exposed to Thunder Strike right now. Buy one with .shield"}_`
    );

    return sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });
  },
};
