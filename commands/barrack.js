// commands/barrack.js
const barracksStore = require('../lib/barracksStore');
const { renderBarracksCard } = require('../lib/barracksCard');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'barrack',
  alias: ['barracks'],
  run: async (sock, msg, args, { from, sender }) => {
    const barracks = await barracksStore.getBarracks(sender);
    const info = barracksStore.levelInfo(barracks.level);
    const power = barracksStore.calculatePower(barracks);
    const used = barracksStore.usedCapacity(barracks);
    const displayName = msg.pushName || sender.split('@')[0];

    let card = null;
    try {
      card = await renderBarracksCard({
        level: barracks.level,
        levelName: info.name,
        stars: info.stars,
        vibe: info.vibe,
        used,
        capacity: info.capacity,
        units: barracks,
        hp: power.hp,
        dmg: power.dmg,
        displayName,
      });
    } catch (err) {
      console.error('barracks card render failed:', err.message);
    }

    const capacityText = info.capacity === Infinity ? `${used}/♾️ UNLIMITED` : `${used}/${info.capacity}`;
    const unitLines = ['archer', 'swordman', 'knight', 'giant']
      .filter((t) => barracks[t] > 0)
      .map((t) => `${barracksStore.UNITS[t].emoji} ${t.charAt(0).toUpperCase() + t.slice(1)}: *${barracks[t]}*`)
      .join('\n') || '_No units yet — try .shop to buy some._';

    const upgradeLine =
      barracks.level < 5
        ? `\n*UPGRADE:* .fortress\n*COST TO LVL ${barracks.level + 1}:* ${barracksStore.levelInfo(barracks.level).upgradeCost.toLocaleString()}g`
        : '';

    const caption = withWatermark(
      `${info.emoji} *${info.name}* ${info.emoji} [${info.stars}]\n\n` +
      `*CAPACITY:* ${capacityText} units\n\n` +
      `*--- GARRISON ---*\n${unitLines}\n\n` +
      `*TOTAL POWER:* ${power.hp.toLocaleString()} HP | ${power.dmg.toLocaleString()} DMG` +
      upgradeLine +
      `\n\n"_${info.vibe}_"`
    );

    const payload = card
      ? { image: card, caption, mentions: [sender] }
      : { text: caption, mentions: [sender] };

    return sock.sendMessage(from, payload, { quoted: msg });
  },
};
