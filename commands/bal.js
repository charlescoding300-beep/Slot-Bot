// commands/bal.js
const gameStore = require('../lib/gameStore');

module.exports = {
  pattern: 'bal',
  alias: ['balance', 'wallet'],
  run: async (sock, msg, args, { from, sender }) => {
    const user = await gameStore.getUser(sender);
    const displayName = msg.pushName || sender.split('@')[0];

    return sock.sendMessage(
      from,
      {
        text: `💳 *${displayName}'s Balance*\n\n💰 Wallet: *${user.wallet.toLocaleString()} coins*\n🏦 Bank: *${user.bank.toLocaleString()} coins*\n✨ XP: *${user.xp}* (Lvl ${user.level})\n🏆 Wins: ${user.wins} • Losses: ${user.losses}`,
        mentions: [sender],
      },
      { quoted: msg }
    );
  },
};
