// commands/battle.js
// Plain text challenge — official Baileys has no button support, so the
// challenged person responds with .accept or .forfeit (handled by
// commands/battleActions.js).

const battleStore = require('../lib/battleStore');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'battle',
  alias: ['challenge'],
  run: async (sock, msg, args, { from, sender }) => {
    // Must be triggered as a REPLY to the target's message
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

    if (!quotedParticipant) {
      return sock.sendMessage(
        from,
        { text: withWatermark('🙄 Reply to the message of the person you want to battle, then send .battle') },
        { quoted: msg }
      );
    }
    if (quotedParticipant === sender) {
      return sock.sendMessage(
        from,
        { text: withWatermark("🙄 You can't battle yourself.") },
        { quoted: msg }
      );
    }

    await battleStore.createBattle(from, sender, quotedParticipant);
    const nameA = sender.split('@')[0];
    const nameB = quotedParticipant.split('@')[0];

    return sock.sendMessage(
      from,
      {
        text: withWatermark(
          `⚔️ *BATTLE CHALLENGE* ⚔️\n\n@${nameA} challenges @${nameB} to a battle!\n\n@${nameB}, reply *.accept* to fight or *.forfeit* to decline.`
        ),
        mentions: [sender, quotedParticipant],
      },
      { quoted: msg }
    );
  },
};
