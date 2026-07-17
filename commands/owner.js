// commands/owner.js
const botConfig = require('../lib/botConfig');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'owner',
  alias: ['ownercontact', 'contactowner'],
  run: async (sock, msg, args, { from, sender }) => {
    const config = await botConfig.getConfig();

    if (!config.owner) {
      return sock.sendMessage(
        from,
        { text: withWatermark('❌ No owner is linked to this bot yet.') },
        { quoted: msg }
      );
    }

    const ownerNumber = config.owner.split('@')[0].split(':')[0];

    // vCard format WhatsApp expects for a contact card message
    const vcard =
      'BEGIN:VCARD\n' +
      'VERSION:3.0\n' +
      'FN:CYBER X Army Owner\n' +
      `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}\n` +
      'END:VCARD';

    // Contact card — the user can tap "Save" or "Message" directly from this
    await sock.sendMessage(
      from,
      {
        contacts: {
          displayName: 'CYBER X Army Owner',
          contacts: [{ vcard }],
        },
      },
      { quoted: msg }
    );

    return sock.sendMessage(
      from,
      {
        text: withWatermark("📇 That's the bot owner's contact — tap it to save or message them directly."),
        mentions: [sender],
      },
      { quoted: msg }
    );
  },
};
