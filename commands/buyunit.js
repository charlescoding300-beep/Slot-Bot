// commands/buyunit.js
const gameStore = require('../lib/gameStore');
const barracksStore = require('../lib/barracksStore');
const { renderUnitPhotoCard } = require('../lib/unitPhotoCard');
const { withWatermark } = require('../lib/watermark');
const { buyHP } = require('./buyhp');

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
  const displayName = msg.pushName || sender.split('@')[0];

  let card = null;
  try {
    card = await renderUnitPhotoCard(type, {
      label: unit.label,
      qty,
      cost: unit.cost,
      dmg: unit.dmg,
      hp: unit.hp,
      displayName,
    });
  } catch (err) {
    console.error(`unit photo card render failed for ${type}:`, err.message);
  }

  const caption = withWatermark(
    `${unit.emoji} @${sender.split('@')[0]} bought *${qty}x ${unit.label}*!\n💰 Cost: *${totalCost.toLocaleString()}g*\n\n*NEW CAPACITY:* ${capacityText} units`
  );

  if (card) {
    return sock.sendMessage(from, { image: card, caption, mentions: [sender] }, { quoted: msg });
  }
  return sock.sendMessage(from, { text: caption, mentions: [sender] }, { quoted: msg });
}

// Recognized unit-type words, including common typo/shorthand variants —
// so ".buy sword", ".but swordman", ".buy knights" etc. all resolve correctly.
const TYPE_ALIASES = {
  archer: 'archer', archers: 'archer', arch: 'archer',
  swordman: 'swordman', swordsman: 'swordman', sword: 'swordman', soldier: 'swordman',
  knight: 'knight', knights: 'knight',
  giant: 'giant', giants: 'giant',
};

async function genericBuyDispatch(sock, msg, args, ctx) {
  const typeWord = (args[0] || '').toLowerCase();

  if (typeWord === 'hp') {
    return buyHP(sock, msg, args.slice(1), ctx);
  }

  const resolvedType = TYPE_ALIASES[typeWord];
  if (!resolvedType) {
    return sock.sendMessage(
      ctx.from,
      { text: withWatermark('🙄 Usage: .buy <archer/swordman/knight/giant/hp> <qty>  (or .buyarcher, .buyswordman, .buyhp, etc.)') },
      { quoted: msg }
    );
  }

  // Shift args so qty lines up correctly (args[0] was the type word)
  return buyUnit(sock, msg, args.slice(1), ctx, resolvedType);
}

module.exports = [
  { pattern: 'buyarcher', alias: ['archer'], run: (sock, msg, args, ctx) => buyUnit(sock, msg, args, ctx, 'archer') },
  { pattern: 'buyswordman', alias: ['swordman'], run: (sock, msg, args, ctx) => buyUnit(sock, msg, args, ctx, 'swordman') },
  { pattern: 'buyknight', alias: ['knight'], run: (sock, msg, args, ctx) => buyUnit(sock, msg, args, ctx, 'knight') },
  { pattern: 'buygiant', alias: ['giant'], run: (sock, msg, args, ctx) => buyUnit(sock, msg, args, ctx, 'giant') },
  // Typo-tolerant generic dispatchers: ".buy swordman 2" / ".but swordman 2"
  { pattern: 'buy', alias: ['but'], run: genericBuyDispatch },
];
