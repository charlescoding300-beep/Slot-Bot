// commands/leaderboard.js
const gameStore = require('../lib/gameStore');
const barracksStore = require('../lib/barracksStore');
const { renderLeaderboardCard } = require('../lib/leaderboardCard');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'leaderboard',
  alias: ['leader', 'richest'],
  run: async (sock, msg, args, { from, sender }) => {
    const richest = await gameStore.getLeaderboard('coins', 10);
    const generals = await barracksStore.getGeneralsLeaderboard(10);

    let card = null;
    try {
      card = await renderLeaderboardCard({ richest, generals });
    } catch (err) {
      console.error('leaderboard card render failed:', err.message);
    }

    const myId = sender.split('@')[0];
    const myRankIndex = richest.findIndex((e) => e.userId === myId);
    const myUser = await gameStore.getUser(sender);

    const richLines = richest.length
      ? richest.map((e, i) => `${i + 1}. @${e.userId} — ${e.score.toLocaleString()}g`).join('\n')
      : '_No players yet_';

    const genLines = generals.length
      ? generals.map((e, i) => `${i + 1}. @${e.userId} — ${e.power.toLocaleString()} power`).join('\n')
      : '_No armies yet_';

    const rankLine =
      myRankIndex >= 0
        ? `\n\n_Your Rank:_ #${myRankIndex + 1} with ${myUser.wallet.toLocaleString()}g`
        : `\n\n_Your Rank:_ Unranked with ${myUser.wallet.toLocaleString()}g — grind to make the Elite list!`;

    const caption = withWatermark(
      `🏆 *SERVER ELITE* 🏆\n*TOP 10 RICHEST*\n\n${richLines}\n\n⚔️ *TOP 10 GENERALS (Army Power)*\n\n${genLines}${rankLine}`
    );

    const mentionList = [
      sender,
      ...richest.map((e) => `${e.userId}@s.whatsapp.net`),
      ...generals.map((e) => `${e.userId}@s.whatsapp.net`),
    ];

    const payload = card
      ? { image: card, caption, mentions: mentionList }
      : { text: caption, mentions: mentionList };

    return sock.sendMessage(from, payload, { quoted: msg });
  },
};
