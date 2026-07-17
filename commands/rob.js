// commands/rob.js
const gameStore = require('../lib/gameStore');
const { withWatermark } = require('../lib/watermark');

const SUCCESS_CHANCE = 0.4; // 40% success, 60% fail
const COOLDOWN_SECONDS = 5 * 60;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

module.exports = {
  pattern: 'rob',
  alias: [],
  run: async (sock, msg, args, { from, sender }) => {
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

    if (!quotedParticipant) {
      return sock.sendMessage(
        from,
        { text: withWatermark('🙄 Reply to the message of the person you want to rob, then .rob <amount>') },
        { quoted: msg }
      );
    }
    if (quotedParticipant === sender) {
      return sock.sendMessage(from, { text: withWatermark("🙄 You can't rob yourself.") }, { quoted: msg });
    }

    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) {
      return sock.sendMessage(from, { text: withWatermark('🙄 Usage: .rob <amount>') }, { quoted: msg });
    }

    const remaining = await gameStore.checkAndSetCooldown('rob', sender, COOLDOWN_SECONDS);
    if (remaining > 0) {
      return sock.sendMessage(
        from,
        { text: withWatermark(`⏰ *CHILL BRO* ⏰\n\nNext rob available in: *${formatDuration(remaining)}*`) },
        { quoted: msg }
      );
    }

    const targetUser = await gameStore.getUser(quotedParticipant);
    if (targetUser.wallet < amount) {
      return sock.sendMessage(
        from,
        {
          text: withWatermark(`@${quotedParticipant.split('@')[0]} you too poor to rob, 🌚 *it's the truth Thief 😂*`),
          mentions: [quotedParticipant],
        },
        { quoted: msg }
      );
    }

    const attackerTag = `@${sender.split('@')[0]}`;
    const targetTag = `@${quotedParticipant.split('@')[0]}`;

    const sent = await sock.sendMessage(
      from,
      {
        text: withWatermark(`🔫 *ROBBERY ATTEMPT* 🔫\n\nAttacker: ${attackerTag}\nTarget: ${targetTag}\n\n*Rolling...* 🎲`),
        mentions: [sender, quotedParticipant],
      },
      { quoted: msg }
    );

    await sleep(1800); // rolling suspense before the reveal

    const success = Math.random() < SUCCESS_CHANCE;
    let resultText;

    if (success) {
      await gameStore.adjustWallet(sender, amount);
      await gameStore.adjustWallet(quotedParticipant, -amount);
      resultText =
        `🔫 *ROBBERY ATTEMPT* 🔫\n\nAttacker: ${attackerTag}\nTarget: ${targetTag}\n\n` +
        `*SUCCESS!* 💰\n*STOLEN:* ${amount.toLocaleString()}g\n*Your Balance:* +${amount.toLocaleString()}g\n*Victim Balance:* -${amount.toLocaleString()}g\n\n` +
        `*Next rob:* 5 minutes`;
    } else {
      await gameStore.adjustWallet(sender, -amount);
      await gameStore.adjustWallet(quotedParticipant, amount);
      resultText =
        `🔫 *ROBBERY ATTEMPT* 🔫\n\nAttacker: ${attackerTag}\nTarget: ${targetTag}\n\n` +
        `*FAILED!* Police caught you 🚨\n*FINE:* -${amount.toLocaleString()}g paid to ${targetTag}\n*Victim Balance:* +${amount.toLocaleString()}g\n\n` +
        `*Next rob:* 5 minutes`;
    }

    try {
      await sock.sendMessage(from, {
        text: withWatermark(resultText),
        mentions: [sender, quotedParticipant],
        edit: sent.key,
      });
    } catch (err) {
      // Edit failed — send as a fresh message so the result still reaches them
      await sock.sendMessage(from, { text: withWatermark(resultText), mentions: [sender, quotedParticipant] });
    }
  },
};
