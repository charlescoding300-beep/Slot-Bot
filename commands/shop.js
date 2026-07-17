// commands/shop.js
const barracksStore = require('../lib/barracksStore');
const { withWatermark } = require('../lib/watermark');

module.exports = {
  pattern: 'shop',
  alias: [],
  run: async (sock, msg, args, { from, sender }) => {
    const u = barracksStore.UNITS;
    const text = withWatermark(
`💰 *SHOP* 💰

1. ${u.archer.emoji} *Archer* - ${u.archer.cost}g | ${u.archer.hp} HP | ${u.archer.dmg} DMG
2. ${u.swordman.emoji} *Swordman* - ${u.swordman.cost}g | ${u.swordman.hp} HP | ${u.swordman.dmg} DMG
3. ${u.knight.emoji} *Knight* - ${u.knight.cost}g | ${u.knight.hp} HP | ${u.knight.dmg} DMG
4. ${u.giant.emoji} *Giant* - ${u.giant.cost}g | ${u.giant.hp} HP | ${u.giant.dmg} DMG | +15% at Fortress

*Buy:* .buyarcher / .buyswordman / .buyknight / .buygiant <qty>
*Sell:* .sell <unit> <qty>
*Repair barracks:* .buyhp — 1000g, full HP restore
*Upgrade barracks:* .fortress`
    );

    return sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });
  },
};
