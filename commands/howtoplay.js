// commands/howtoplay.js
const { withWatermark } = require('../lib/watermark');

// Note: WhatsApp commands split on spaces, so a literal ".how to play" can't
// be matched as one trigger — "to" and "play" would be read as arguments.
// Using .howtoplay as the real trigger, with single-word aliases below.

module.exports = {
  pattern: 'howtoplay',
  alias: ['how', 'guide', 'help'],
  run: async (sock, msg, args, { from, sender }) => {
    const text = withWatermark(
`🎮 *CYBER X ARMY — HOW TO PLAY* 🎮

Welcome! Here's everything this bot can do:

*💰 COINS & ECONOMY*
Every new player starts with *1,000 coins*.
• *.bal* — check your wallet, bank, XP, wins/losses
• *.daily* — claim *100 free coins*, once every 24 hours (private per person)

*🎰 SLOTS*
• *.slots <amount>* (or *.slot/.bet/.bets*) — bet coins, spin 3 reels
• Minimum bet: *50 coins*
• 2 matching symbols = win • 3 matching = jackpot
• Sends a board image + tags you in the result

*⚔️ BUILD YOUR ARMY*
Spend coins on units to fight other players:
• *.buysoldier <qty>* (⚔️ Swordsman) — 10 coins each, 10 damage
• *.buyarcher <qty>* (🏹 Archer) — 20 coins each, 5 damage
• *.buygiant <qty>* (🗿 Giant) — 5,000 coins each, 100 damage
• *.army* — view your troops and total attack power

*🥊 BATTLES*
• Reply to someone's message with *.battle* to challenge them
• They respond via the poll (✅ Accept / 🏳️ Forfeit), or type *.accept*/*.forfeit*
• Watch the battle play out live as troops are lost round by round
• Winner gets a trophy image, loser is tagged as defeated
• Real troop losses are saved — a beaten army stays weaker until you rebuild it

*⚙️ OWNER-ONLY SETTINGS* (bot owner only)
• *.setprefix <symbol>* — change the command prefix
• *.mode public/private* — restrict the bot to owner-only use

*🌐 PLAY ON THE WEB TOO*
Everything above also lives at *YOUR_SITE_URL_HERE* — log in with your WhatsApp number (we'll text you a code), see your army and coins, and grab a bonus coin spin every 5 minutes.

Everything you earn or lose is saved permanently — restarts, redeploys, nothing wipes your progress. Good luck out there! ⚔️`
    );

    return sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });
  },
};
