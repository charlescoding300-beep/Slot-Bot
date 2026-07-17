// commands/deposit.js
const gameStore = require('../lib/gameStore');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'deposit',
  alias: [],
  run: async (sock, msg, args, { from, sender }) => {
    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) {
      return sock.sendMessage(
        from,
        { text: withWatermark('🙄 Enter a valid amount. Usage: .deposit <amount>') },
        { quoted: msg }
      );
    }

    const user = await gameStore.getUser(sender);
    if (user.wallet < amount) {
      return sock.sendMessage(
        from,
        { text: withWatermark(`🫠 You only have *${user.wallet.toLocaleString()} coins* in your wallet.`) },
        { quoted: msg }
      );
    }

    await gameStore.transferBankWallet(sender, 'deposit', amount);
    const updated = await gameStore.getUser(sender);

    return sock.sendMessage(
      from,
      {
        text: withWatermark(
          `🏦 *Deposited ${amount.toLocaleString()} coins into your bank*\n\n💰 Wallet: ${updated.wallet.toLocaleString()}\n🏦 Bank: ${updated.bank.toLocaleString()}`
        ),
        mentions: [sender],
      },
      { quoted: msg }
    );
  },
};
