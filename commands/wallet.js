// commands/wallet.js
const gameStore = require('../lib/gameStore');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'wallet',
  alias: ['savings'],
  run: async (sock, msg, args, { from, sender }) => {
    const user = await gameStore.getUser(sender);
    const displayName = msg.pushName || sender.split('@')[0];

    return sock.sendMessage(
      from,
      {
        text: withWatermark(`👛 *${displayName}'s Wallet*\n\n💰 *${user.wallet.toLocaleString()} coins*`),
        mentions: [sender],
      },
      { quoted: msg }
    );
  },
};
