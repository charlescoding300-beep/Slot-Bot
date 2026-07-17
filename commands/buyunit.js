// commands/buyunit.js
const gameStore = require('../lib/gameStore');
const barracksStore = require('../lib/barracksStore');
const { withWatermark } = require('../lib/watermark');

async function buyUnit(sock, msg, args, { from, sender }, type) {
  const unit = barracksStore.UNITS[type];
  const qty = parseInt(args[0]) || 1;

  if (qty <= 0) {
    return sock.sendMessage(from, { text: withWatermark('🙄 Enter a valid amount to buy.') }, { quoted: msg });
  }

  const totalCost = unit.cost * qty;
  const user = await gameStore.getUser(sender);
  if (user.wallet < totalCost) {
    return sock.sendMessage(
      from,
      { text: withWatermark(`🫠 You need *${totalCost.toLocaleString()}g* for ${qty}x ${unit.label}, but only have *${user.wallet.toLocaleString()}g*.`) },
      { quoted: msg }
    );
  }

  const result = await barracksStore.buyUnit(sender, type, qty);
  if (!result.ok) {
    const spaceLeft = result.spaceLeft === Infinity ? '∞' : result.spaceLeft;
    return sock.sendMessage(
      from,
      { text: withWatermark(`🏚️ Not enough barracks capacity! Only *${spaceLeft}* space left. Upgrade with .fortress first.`) },
      { quoted: msg }
    );
  }

  await gameStore.adjustWallet(sender, -totalCost);
  const barracks = await barracksStore.getBarracks(sender);
  const used = barracksStore.usedCapacity(barracks);
  const capacity = barracksStore.levelInfo(barracks.level).capacity;
  const capacityText = capacity === Infinity ? `${used}/♾️` : `${used}/${capacity}`;

  return sock.sendMessage(
    from,
    {
      text: withWatermark(
        `${unit.emoji} @${sender.split('@')[0]} bought *${qty}x ${unit.label}*!\n💰 Cost: *${totalCost.toLocaleString()}g*\n\n*NEW CAPACITY:* ${capacityText} units`
      ),
      mentions: [sender],
    },
    { quoted: msg }
  );
}

module.exports = [
  { pattern: 'buyarcher', alias: ['archer'], run: (sock, msg, args, ctx) => buyUnit(sock, msg, args, ctx, 'archer') },
  { pattern: 'buyswordman', alias: ['swordman'], run: (sock, msg, args, ctx) => buyUnit(sock, msg, args, ctx, 'swordman') },
  { pattern: 'buyknight', alias: ['knight'], run: (sock, msg, args, ctx) => buyUnit(sock, msg, args, ctx, 'knight') },
  { pattern: 'buygiant', alias: ['giant'], run: (sock, msg, args, ctx) => buyUnit(sock, msg, args, ctx, 'giant') },
];
