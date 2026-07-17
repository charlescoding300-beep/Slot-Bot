// commands/slots.js
const gameStore = require('../lib/gameStore');
const activityFeed = require('../lib/activityFeed');
const { renderSlotsBoard } = require('../lib/slotsBoard');

const SYMBOLS = ['💎', '🍒', '🍋', '🍎', '🔔', '⭐', '7️⃣'];

// Guarantees a true 50/50 win/lose rate overall, instead of letting it emerge
// naturally from independent symbol draws (which was skewed). Win/lose is
// decided FIRST, then reels are built to match that outcome.
function spin() {
  const win = Math.random() < 0.5; // exactly 50/50

  if (!win) {
    // guarantee no two symbols match
    const shuffled = [...SYMBOLS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }

  // Within the 50% win side: 20% of wins are jackpots (all 3 match),
  // the rest are 2-symbol matches.
  const isJackpot = Math.random() < 0.4; // 40% of wins are jackpot (was 20%)
  const mainSymbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

  if (isJackpot) {
    return [mainSymbol, mainSymbol, mainSymbol];
  }

  let oddSymbol;
  do {
    oddSymbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  } while (oddSymbol === mainSymbol);

  const reels = [mainSymbol, mainSymbol, oddSymbol];
  // shuffle so the odd one isn't always in the same position
  for (let i = reels.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [reels[i], reels[j]] = [reels[j], reels[i]];
  }
  return reels;
}

module.exports = {
  pattern: 'slots',
  alias: ['slot', 'bet', 'bets' , 'spin'],
  run: async (sock, msg, args, { from, sender }) => {
    // `sender` is the real participant JID (e.g. 2348012345678@s.whatsapp.net)
    // even inside a group — `from` would be the group JID instead.
    // gameStore keys off `sender`, so the SAME wallet follows this person
    // whether they play in a DM or in any group. One global balance.

    // No amount given at all — friendly nudge, quoted + tagged.
    if (!args[0]) {
      return sock.sendMessage(
        from,
        {
          text: `🙄 Please place an amount you wish on betting.\n\n*Usage:* .slot <amount>\n*Minimum bet:* 50 coins`,
          mentions: [sender],
        },
        { quoted: msg }
      );
    }

    const bet = parseInt(args[0]);
    if (!bet || bet < 50 || bet > 32000000) {
      return sock.sendMessage(
        from,
        { text: `⚠️ Bet must be between *50* and *32,000,000* coins.` },
        { quoted: msg }
      );
    }

    const cooldown = await gameStore.checkAndSetCooldown('slots', sender, 10);
    if (cooldown > 0) {
      return sock.sendMessage(
        from,
        { text: `⏳ Wait ${cooldown}s before spinning again.` },
        { quoted: msg }
      );
    }

    const user = await gameStore.getUser(sender);
    if (user.wallet < bet) {
      return sock.sendMessage(
        from,
        { text: `❌ You only have ${user.wallet} coins.` },
        { quoted: msg }
      );
    }

    const reels = spin();
    const counts = {};
    reels.forEach((s) => (counts[s] = (counts[s] || 0) + 1));
    const maxMatch = Math.max(...Object.values(counts));

    let multiplier = 0;
    let resultLine = '';
    if (maxMatch === 3) {
      multiplier = 10;
      resultLine = '🎉 JACKPOT! All three match!';
    } else if (maxMatch === 2) {
      multiplier = 2;
      resultLine = '🎉 Two symbols match!';
    } else {
      multiplier = 0;
      resultLine = '💨 No match. Better luck next time.';
    }

    const won = multiplier > 0;
    const netGain = won ? bet * multiplier - bet : -bet;

    const newBalance = await gameStore.adjustWallet(sender, netGain);
    await activityFeed.logActivity({
      userId: sender.split('@')[0],
      type: won ? 'win' : 'loss',
      amount: Math.abs(netGain),
      game: 'Slots',
    });
    await gameStore.recordResult(sender, won);
    if (won) await gameStore.adjustXP(sender, Math.floor(bet / 1000));

    // Display name: pushName is the person's actual WhatsApp display name,
    // shown regardless of whether the trigger-sender has them saved as a contact.
    const displayName = msg.pushName || sender.split('@')[0];

    // Render the board as an actual image (Sharp/SVG), same style as .wasted
    const boardImage = await renderSlotsBoard(reels, {
      won,
      multiplier,
      betAmount: bet,
      netGain,
      balance: newBalance,
      displayName,
    });

    // Exact text format, kept in full — nothing shortened or cut.
    // WhatsApp renders *text* as bold — used on the result line and key numbers.
    const caption = won
      ? `🎰 [ ${reels.join(' | ')} ] 🎰\n\n*${resultLine}*\n💰 @${sender.split('@')[0]} You won *${(bet * multiplier).toLocaleString()} coins*! (${multiplier}x multiplier)\n💵 Net gain: *+${netGain.toLocaleString()} coins*`
      : `🎰 [ ${reels.join(' | ')} ] 🎰\n\n*${resultLine}*\n💵 @${sender.split('@')[0]} Net loss: *${netGain.toLocaleString()} coins*`;

    // Auto-reply reaction: bot reacts with 🎰 directly on the trigger message,
    // separately from the quoted image+text reply below.
    await sock.sendMessage(from, {
      react: { text: '🎰', key: msg.key },
    });

    // { quoted: msg } replies directly to the command that triggered it —
    // so in a busy group, it's unambiguous which !slots this result belongs to.
    // mentions: [sender] tags the player — WhatsApp renders it as their saved
    // contact name (or pushName/number if not saved) automatically.
    return sock.sendMessage(
      from,
      { image: boardImage, caption, mentions: [sender] },
      { quoted: msg }
    );
  },
};
