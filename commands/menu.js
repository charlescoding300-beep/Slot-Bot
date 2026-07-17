// commands/menu.js
const botConfig = require('../lib/botConfig');
const { withWatermark } = require('../lib/watermark');
const path = require('path');

module.exports = {
  pattern: 'menu',
  alias: ['commands', 'list'],
  run: async (sock, msg, args, { from, sender }) => {
    const config = await botConfig.getConfig();
    const p = config.prefix;
    const displayName = msg.pushName || sender.split('@')[0];

    const text = withWatermark(
`🎰 *CYBER X ARMY* — Full Menu
Hey ${displayName} 👋

*📜 MENU & INFO*
▸ ${p}menu — this list
▸ ${p}howtoplay (${p}how / ${p}guide) — full game explainer
▸ ${p}about — project history & credits
▸ ${p}owner — get the bot owner's contact card

*💰 COINS & ECONOMY*
▸ ${p}bal (${p}balance) — wallet, bank, XP, record
▸ ${p}wallet (${p}savings) — quick wallet check
▸ ${p}daily (${p}dailyslot) — 100 free coins (24h cooldown)
▸ ${p}deposit <amount> — move coins from wallet into bank
▸ ${p}donate <amount> (${p}give) — reply to someone, send them coins (min 50)
▸ ${p}beg <amount> — reply to someone, ask them for coins (Yes/No)
▸ ${p}rob <amount> — reply to someone, try to steal coins (40/60 odds, 5min cooldown)

*🎰 GAMES*
▸ ${p}slots <amount> (${p}slot / ${p}bet / ${p}bets) — spin, min bet 50, 50/50 odds
▸ ${p}dig — dig for gold, 10 free digs/day, 40% win chance

*🏰 BARRACKS & ARMY*
▸ ${p}shop — see all units and prices
▸ ${p}buyarcher / ${p}buyswordman / ${p}buyknight / ${p}buygiant <qty> — recruit units
▸ ${p}sell <unit> <qty> — sell units back at full price
▸ ${p}barrack (${p}barracks) — view your garrison, level, and power
▸ ${p}fortress (${p}upgrade) — upgrade your barracks level
▸ ${p}buyhp (${p}buy hp) — repair barracks HP fully, 1000g

*🥊 BATTLES*
▸ ${p}battle (${p}challenge) — reply to someone to challenge them
▸ ${p}accept / ${p}forfeit — respond to a challenge
_Winner collects war spoils from the loser's lost units._

*🏆 LEADERBOARDS*
▸ ${p}leaderboard (${p}leader / ${p}richest) — top 10 richest + top 10 generals

*⚙️ OWNER ONLY*
▸ ${p}setprefix <symbol> — change command prefix
▸ ${p}mode public/private — restrict bot to owner only

*🌐 WEBSITE*
Everything above also lives on the companion site — log in with your WhatsApp number, see your army and coins, and grab a bonus spin every 5 minutes.

_Current prefix: "${p}" • Mode: ${config.mode}_`
    );

    try {
      return await sock.sendMessage(
        from,
        { image: { url: path.join(__dirname, '..', 'mrzack-logo.png') }, caption: text, mentions: [sender] },
        { quoted: msg }
      );
    } catch (err) {
      return sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });
    }
  },
};
