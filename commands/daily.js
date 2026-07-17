// commands/daily.js
const gameStore = require('../lib/gameStore');

const DAILY_AMOUNT = 100;
const DAILY_SECONDS = 24 * 60 * 60; // 24 hours

module.exports = {
  pattern: 'daily',
  alias: ['dailyslot'],
  run: async (sock, msg, args, { from, sender }) => {
    // Cooldown key is per-user (built from `sender` inside gameStore), so
    // User A claiming their daily has zero effect on User B's daily —
    // each person gets their own private 24h timer, tracked in Redis.
    const remaining = await gameStore.checkAndSetCooldown('daily', sender, DAILY_SECONDS);

    if (remaining > 0) {
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      return sock.sendMessage(
        from,
        {
          text: `⏳ @${sender.split('@')[0]} you've already claimed your daily.\n*Come back in:* ${hours}h ${minutes}m`,
          mentions: [sender],
        },
        { quoted: msg }
      );
    }

    const newBalance = await gameStore.adjustWallet(sender, DAILY_AMOUNT);

    return sock.sendMessage(
      from,
      {
        text: `🎁 *Daily Reward Claimed!*\n\n💰 @${sender.split('@')[0]} received *+${DAILY_AMOUNT} coins*\n💵 Balance: *${newBalance.toLocaleString()} coins*\n\n_Next claim in 24 hours_`,
        mentions: [sender],
      },
      { quoted: msg }
    );
  },
};
