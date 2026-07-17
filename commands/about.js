// commands/about.js
const path = require('path');
const botConfig = require('../lib/botConfig');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'about',
  alias: [],
  run: async (sock, msg, args, { from, sender }) => {
    const config = await botConfig.getConfig();
    const ownerTag = config.owner ? `@${config.owner.split('@')[0].split(':')[0]}` : '*𝕸𝖗 𝖅𝖆𝖈𝖐*';
    const mentionList = config.owner ? [sender, config.owner] : [sender];

    const text = withWatermark(
`🎰 *ABOUT SLOT CASINO* 🎰

*📜 Our Story*
Slot Casino began as a simple idea — bring the thrill of a real casino floor straight into WhatsApp, without anyone ever needing to leave the chat. What started as a handful of commands grew into a full economy, an army system, live battles, and a companion website — all running on the same wallet, wherever you play.

*👑 Founder*
Slot Casino was originally founded by *𝕸𝖗 𝖅𝖆𝖈𝖐* (${ownerTag}), who built the very first version of this platform from the ground up — the economy, the games, the systems you use every day all trace back to that original vision.

*🏢 Sponsor & Developer*
This project is proudly sponsored and developed by *𝕮𝖄𝕭𝙀𝙍 𝖃* (${ownerTag}) — providing the infrastructure, resources, and continued development that keep Slot Casino running smoothly and growing.

*🎯 Our Mission*
To give every player a fair, fun, and persistent casino experience — your coins, your army, your progress, all safely saved no matter what. Whether you're spinning the slots, digging for gold, battling another player, or building your army, Slot Casino is built to make sure nothing you've earned is ever lost.

*🕹️ What You Can Do Here*
▸ Spin the slots and test your luck
▸ Build an army of swordsmen, archers, and giants
▸ Challenge other players to battle
▸ Dig for gold, beg, donate, and grow your wallet
▸ Track your stats and compete on the leaderboard
▸ Manage it all from the companion website too

*🙏 A Note of Thanks*
To every player who has spun, battled, donated, or dug their way through this project — thank you for being part of Slot Casino's story. This is just the beginning.

_Type .menu anytime to see everything you can do._`
    );

    try {
      return await sock.sendMessage(
        from,
        { image: { url: path.join(__dirname, '..', 'mrzack-logo.png') }, caption: text, mentions: mentionList },
        { quoted: msg }
      );
    } catch (err) {
      // Logo not present on this deploy — falls back to plain text
      return sock.sendMessage(from, { text, mentions: mentionList }, { quoted: msg });
    }
  },
};
