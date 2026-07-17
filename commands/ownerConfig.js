// commands/ownerConfig.js
const botConfig = require('../lib/botConfig');
const { withWatermark } = require('../lib/watermark');

module.exports = [
  {
    pattern: 'setprefix',
    alias: [],
    run: async (sock, msg, args, { from, sender }) => {
      const isOwner = await botConfig.isOwner(sender);
      if (!isOwner) {
        return sock.sendMessage(from, { text: withWatermark('❌ Only the bot owner can change the prefix.') }, { quoted: msg });
      }
      const newPrefix = args[0];
      if (!newPrefix || newPrefix.length > 3) {
        return sock.sendMessage(from, { text: withWatermark('🙄 Usage: .setprefix <symbol> (e.g. .setprefix !)') }, { quoted: msg });
      }
      await botConfig.setPrefix(newPrefix);
      return sock.sendMessage(from, { text: withWatermark(`✅ Prefix changed to: *${newPrefix}*`) }, { quoted: msg });
    },
  },
  {
    pattern: 'mode',
    alias: [],
    run: async (sock, msg, args, { from, sender }) => {
      const isOwner = await botConfig.isOwner(sender);
      if (!isOwner) {
        return sock.sendMessage(from, { text: withWatermark('❌ Only the bot owner can change the mode.') }, { quoted: msg });
      }
      const newMode = (args[0] || '').toLowerCase();
      if (newMode !== 'public' && newMode !== 'private') {
        return sock.sendMessage(from, { text: withWatermark('🙄 Usage: .mode public  OR  .mode private') }, { quoted: msg });
      }
      await botConfig.setMode(newMode);
      return sock.sendMessage(
        from,
        { text: withWatermark(`✅ Bot mode set to: *${newMode.toUpperCase()}*${newMode === 'private' ? '\n\nOnly the owner can use commands now.' : ''}`) },
        { quoted: msg }
      );
    },
  },
];
