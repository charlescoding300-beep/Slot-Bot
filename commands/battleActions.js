// commands/battleActions.js
const battleStore = require('../lib/battleStore');
const barracksStore = require('../lib/barracksStore');
const gameStore = require('../lib/gameStore');
const { redis } = require('../lib/gameStore');
const { renderTrophyCard } = require('../lib/trophyCard');
const { withWatermark } = require('../lib/watermark');
const activityFeed = require('../lib/activityFeed');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs the full battle: snapshots both barracks' units, simulates
 * round-by-round, edits one message live as casualties happen, then sends
 * a fresh trophy image announcing the winner. The winner is paid gold equal
 * to the value of the units the loser lost (war spoils).
 */
async function runBattle(sock, chatId, battle) {
  const { challenger, challenged } = battle;

  const barracksA = await barracksStore.getBarracks(challenger); // snapshot at battle start
  const barracksB = await barracksStore.getBarracks(challenged);

  const sim = barracksStore.simulateBattle(barracksA, barracksB);
  const nameA = challenger.split('@')[0];
  const nameB = challenged.split('@')[0];

  const sent = await sock.sendMessage(chatId, {
    text: withWatermark(`⚔️ *Battle in progress...*\n\n@${nameA} vs @${nameB}`),
    mentions: [challenger, challenged],
  });

  let log = '';
  for (const r of sim.rounds) {
    if (r.lostA > 0) log += `💥 @${nameA} has lost ${r.lostA} man${r.lostA > 1 ? 'men' : ''}\n`;
    if (r.lostB > 0) log += `💥 @${nameB} has lost ${r.lostB} man${r.lostB > 1 ? 'men' : ''}\n`;

    await sleep(1400);
    try {
      await sock.sendMessage(chatId, {
        text: withWatermark(`⚔️ *Battle in progress...*\n\n@${nameA} vs @${nameB}\n\n${log}`),
        mentions: [challenger, challenged],
        edit: sent.key,
      });
    } catch (err) {
      // Editing can fail — safe to ignore, the final result message is what matters.
    }
  }

  // Persist real casualties back to Redis
  const keyA = `barracks:${challenger.split('@')[0].split(':')[0]}`;
  const keyB = `barracks:${challenged.split('@')[0].split(':')[0]}`;
  await barracksStore.getBarracks(challenger); // ensure keys exist
  await redis.hset(keyA, sim.finalUnitsA);
  await redis.hset(keyB, sim.finalUnitsB);

  const winnerJid = sim.winner === 'A' ? challenger : sim.winner === 'B' ? challenged : null;
  const loserJid = sim.winner === 'A' ? challenged : sim.winner === 'B' ? challenger : null;
  const winnerName = winnerJid ? winnerJid.split('@')[0] : null;
  const loserName = loserJid ? loserJid.split('@')[0] : null;

  if (!winnerJid) {
    return sock.sendMessage(chatId, {
      text: withWatermark(`🤝 *Battle ended in a draw!* Both armies were wiped out.`),
      mentions: [challenger, challenged],
    });
  }

  // War spoils: winner recovers gold equal to the value of what the loser lost
  const spoils = sim.winner === 'A' ? sim.goldValueLostB : sim.goldValueLostA;
  if (spoils > 0) {
    await gameStore.adjustWallet(winnerJid, spoils);
  }

  const trophyImage = await renderTrophyCard({ winnerName, loserName });
  await activityFeed.logActivity({ userId: winnerName, type: 'win', amount: spoils, game: 'Battle' });
  await activityFeed.logActivity({ userId: loserName, type: 'loss', amount: 0, game: 'Battle' });

  const caption = withWatermark(
    `🏆 *@${winnerName} WON THE BATTLE!*\n\n@${loserName} has been defeated.` +
    (spoils > 0 ? `\n💰 War spoils: +${spoils.toLocaleString()}g` : '')
  );

  return sock.sendMessage(chatId, {
    image: trophyImage,
    caption,
    mentions: [winnerJid, loserJid],
  });
}

async function forfeitBattle(sock, chatId, battle) {
  const winnerName = battle.challenger.split('@')[0];
  const loserName = battle.challenged.split('@')[0];
  const trophyImage = await renderTrophyCard({ winnerName, loserName: `${loserName} (forfeited)` });

  return sock.sendMessage(chatId, {
    image: trophyImage,
    caption: withWatermark(`🏆 *@${winnerName} WON THE BATTLE!*\n\n@${loserName} forfeited the fight.`),
    mentions: [battle.challenger, battle.challenged],
  });
}

async function handleAccept(sock, msg, args, { from, sender }) {
  let battle;
  if (args[0]) {
    battle = await battleStore.getBattle(args[0]);
  } else {
    battle = await battleStore.findPendingBattleForUser(from, sender);
  }

  if (!battle || battle.status !== 'pending') {
    return sock.sendMessage(from, { text: withWatermark('❌ No pending battle challenge found for you.') }, { quoted: msg });
  }
  if (battle.challenged !== sender) {
    return sock.sendMessage(from, { text: withWatermark('❌ This challenge is not addressed to you.') }, { quoted: msg });
  }

  const battleId = args[0] || battle.battleId;
  await battleStore.resolveBattleStatus(battleId, 'accepted');

  await sock.sendMessage(from, { text: withWatermark('✅ Challenge accepted! Battle starting...') }, { quoted: msg });
  await runBattle(sock, from, battle);
}

async function handleForfeit(sock, msg, args, { from, sender }) {
  let battle;
  let battleId = args[0];
  if (battleId) {
    battle = await battleStore.getBattle(battleId);
  } else {
    const found = await battleStore.findPendingBattleForUser(from, sender);
    battle = found;
    battleId = found?.battleId;
  }

  if (!battle || battle.status !== 'pending') {
    return sock.sendMessage(from, { text: withWatermark('❌ No pending battle challenge found for you.') }, { quoted: msg });
  }
  if (battle.challenged !== sender) {
    return sock.sendMessage(from, { text: withWatermark('❌ This challenge is not addressed to you.') }, { quoted: msg });
  }

  await battleStore.resolveBattleStatus(battleId, 'forfeited');
  await forfeitBattle(sock, from, battle);
}

module.exports = [
  { pattern: 'acceptbattle', alias: ['accept'], run: handleAccept },
  { pattern: 'forfeitbattle', alias: ['forfeit'], run: handleForfeit },
];
module.exports.runBattle = runBattle;
module.exports.forfeitBattle = forfeitBattle;
