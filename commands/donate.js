// commands/donate.js
const gameStore = require('../lib/gameStore');
const { renderDonateCard } = require('../lib/donateCard');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'donate',
  alias: ['donote', 'give' , 'take'], // covering the typo in case it's typed that way out of habit
  run: async (sock, msg, args, { from, sender }) => {
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

    if (!quotedParticipant) {
      return sock.sendMessage(
        from,
        { text: withWatermark('🙄 Reply to the message of the person you want to donate to, then .donate <amount>') },
        { quoted: msg }
      );
    }
    if (quotedParticipant === sender) {
      return sock.sendMessage(
        from,
        { text: withWatermark("🙄 You can't donate to yourself.") },
        { quoted: msg }
      );
    }

    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) {
      return sock.sendMessage(
        from,
        { text: withWatermark('🙄 Enter a valid amount to donate. Usage: .donate <amount>') },
        { quoted: msg }
      );
    }
    if (amount < 50) {
      return sock.sendMessage(
        from,
        { text: withWatermark('🙄 Minimum donation is *50 coins*.') },
        { quoted: msg }
      );
    }

    const senderUser = await gameStore.getUser(sender);
    if (senderUser.wallet < amount) {
      return sock.sendMessage(
        from,
        {
          text: withWatermark(`🫠 @${sender.split('@')[0]} don't have that exact amount to give`),
          mentions: [sender],
        },
        { quoted: msg }
      );
    }

    // Sender loses it, receiver gains it — both writes atomic via Redis HINCRBY
    await gameStore.adjustWallet(sender, -amount);
    await gameStore.adjustWallet(quotedParticipant, amount);

    const senderTag = `@${sender.split('@')[0]}`;
    const receiverTag = `@${quotedParticipant.split('@')[0]}`;
    const caption = withWatermark(`${senderTag} you Funded ${receiverTag}\n💸 +${amount.toLocaleString()} coins`);

    let card = null;
    try {
      card = await renderDonateCard({ senderName: senderTag, receiverName: receiverTag, amount });
    } catch (err) {
      // Background photo fetch failed (e.g. no outbound internet on this host,
      // or the photo URL changed) — fall back to text so the command still works.
      console.error('donate card render failed, falling back to text:', err.message);
    }

    if (card) {
      return sock.sendMessage(
        from,
        { image: card, caption, mentions: [sender, quotedParticipant] },
        { quoted: msg }
      );
    }

    return sock.sendMessage(
      from,
      { text: caption, mentions: [sender, quotedParticipant] },
      { quoted: msg }
    );
  },
};
