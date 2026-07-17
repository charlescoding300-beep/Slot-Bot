// commands/beg.js
const begStore = require('../lib/begStore');
const { renderBegCard } = require('../lib/begCard');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'beg',
  alias: [],
  run: async (sock, msg, args, { from, sender }) => {
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

    if (!quotedParticipant) {
      return sock.sendMessage(
        from,
        { text: withWatermark('🙄 Reply to the message of the person you want to beg from, then .beg <amount>') },
        { quoted: msg }
      );
    }
    if (quotedParticipant === sender) {
      return sock.sendMessage(
        from,
        { text: withWatermark("🙄 You can't beg from yourself.") },
        { quoted: msg }
      );
    }

    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) {
      return sock.sendMessage(
        from,
        { text: withWatermark('🙄 Enter a valid amount. Usage: .beg <amount>') },
        { quoted: msg }
      );
    }

    await begStore.createBeg(from, sender, quotedParticipant, amount);

    const requesterTag = `@${sender.split('@')[0]}`;
    const targetTag = `@${quotedParticipant.split('@')[0]}`;

    let card = null;
    try {
      card = await renderBegCard({ requesterName: requesterTag, targetName: targetTag, amount });
    } catch (err) {
      console.error('beg card render failed:', err.message);
    }

    const caption = withWatermark(
      `${targetTag} ${requesterTag} has requested to borrow *${amount.toLocaleString()} gold coins* 🪙 👛`
    );

    const payload = card
      ? { image: card, caption, mentions: [sender, quotedParticipant] }
      : { text: caption, mentions: [sender, quotedParticipant] };

    return sock.sendMessage(
      from,
      {
        ...payload,
        footer: '𝕮𝖄𝕭𝙀𝙍 𝖃 Army',
        buttons: [
          { text: '✅ Yes', id: '.begyes' },
          { text: '❌ No', id: '.begno' },
        ],
      },
      { quoted: msg }
    );
  },
};
