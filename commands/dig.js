// commands/dig.js
const gameStore = require('../lib/gameStore');
const digStore = require('../lib/digStore');
const activityFeed = require('../lib/activityFeed');
const { renderDigCard } = require('../lib/digCard');
const { withWatermark } = require('../lib/watermark');

const WIN_CHANCE = 0.4; // 40% win, 60% lose — explicitly different from .slots' 50/50
const DIG_REWARD = 500;

function formatDuration(ms) {
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

module.exports = {
  pattern: 'dig',
  alias: [],
  run: async (sock, msg, args, { from, sender }) => {
    const attempt = await digStore.attemptDig(sender);

    if (attempt.status === 'oncooldown') {
      return sock.sendMessage(
        from,
        {
          text: withWatermark(`⛏️ You've used all your digs. Come back in *${formatDuration(attempt.remainingMs)}*.`),
          mentions: [sender],
        },
        { quoted: msg }
      );
    }

    const won = Math.random() < WIN_CHANCE;
    const displayName = msg.pushName || sender.split('@')[0];

    if (won) {
      await gameStore.adjustWallet(sender, DIG_REWARD);
    }
    await activityFeed.logActivity({
      userId: sender.split('@')[0],
      type: won ? 'win' : 'loss',
      amount: won ? DIG_REWARD : 0,
      game: 'Dig',
    });

    let card = null;
    try {
      card = await renderDigCard({ won, amount: DIG_REWARD, displayName });
    } catch (err) {
      console.error('dig card render failed:', err.message);
    }

    const initialText = won
      ? `💰 *You found ${DIG_REWARD} gold coins!* 🪙`
      : `👀 *No gold* 🪙 *was Found under the ground*`;

    const sendPayload = card
      ? { image: card, caption: withWatermark(initialText), mentions: [sender] }
      : { text: withWatermark(initialText), mentions: [sender] };

    const sent = await sock.sendMessage(from, sendPayload, { quoted: msg });

    // After 2 seconds, edit the same message to show the updated dig count
    // (or the "all done, come back in 24h" message if this was the last one).
    setTimeout(async () => {
      const finished = attempt.remainingAfter <= 0;
      const followUpText = finished
        ? withWatermark(`@${sender.split('@')[0]} you have Successfully finished your dig 🪏 please try again in 24 hours`)
        : withWatermark(`*You have ${attempt.remainingAfter} dig left use wisely 🙂*`);

      try {
        if (card) {
          await sock.sendMessage(from, { caption: followUpText, edit: sent.key, mentions: [sender] });
        } else {
          await sock.sendMessage(from, { text: followUpText, edit: sent.key, mentions: [sender] });
        }
      } catch (err) {
        // Editing failed (host/version quirk) — send as a fresh message so the
        // player still gets the update either way.
        await sock.sendMessage(from, { text: followUpText, mentions: [sender] });
      }
    }, 2000);
  },
};
