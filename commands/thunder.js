// commands/thunder.js
const gameStore = require('../lib/gameStore');
const shieldStore = require('../lib/shieldStore');
const barracksStore = require('../lib/barracksStore');
const { withWatermark } = require('../lib/watermark');

const buyThunder = {
  pattern: 'thunder',
  alias: [],
  run: async (sock, msg, args, { from, sender }) => {
    const user = await gameStore.getUser(sender);
    if (user.wallet < shieldStore.THUNDER_COST) {
      return sock.sendMessage(
        from,
        { text: withWatermark(`🫠 You need *${shieldStore.THUNDER_COST.toLocaleString()}g* for a Thunder Strike, but only have *${user.wallet.toLocaleString()}g*.`) },
        { quoted: msg }
      );
    }
    await gameStore.adjustWallet(sender, -shieldStore.THUNDER_COST);
    const key = `thunder:${sender.split('@')[0].split(':')[0]}`;
    await gameStore.redis.incrby(key, 1);

    return sock.sendMessage(
      from,
      { text: withWatermark(`⛈️ *Thunder Strike purchased!*\n\n💰 Cost: ${shieldStore.THUNDER_COST.toLocaleString()}g\n\nUse *.strike* (reply to your target) to launch it.`) },
      { quoted: msg }
    );
  },
};

const buyShield = {
  pattern: 'shield',
  alias: [],
  run: async (sock, msg, args, { from, sender }) => {
    const user = await gameStore.getUser(sender);
    if (user.wallet < shieldStore.SHIELD_COST) {
      return sock.sendMessage(
        from,
        { text: withWatermark(`🫠 You need *${shieldStore.SHIELD_COST.toLocaleString()}g* for a Shield, but only have *${user.wallet.toLocaleString()}g*.`) },
        { quoted: msg }
      );
    }
    await gameStore.adjustWallet(sender, -shieldStore.SHIELD_COST);
    const newCharges = await shieldStore.addShield(sender);
    const totalShields = Math.ceil(newCharges / shieldStore.CHARGES_PER_SHIELD);

    return sock.sendMessage(
      from,
      {
        text: withWatermark(
          `🛡️ *SHIELD PURCHASED!* 🛡️\n+1 Shield Added [${shieldStore.CHARGES_PER_SHIELD} Charges]\n\n*TOTAL SHIELDS:* ${totalShields}\n*TOTAL CHARGES:* ${newCharges}/${newCharges}\n*GOLD:* -${shieldStore.SHIELD_COST.toLocaleString()}g`
        ),
        mentions: [sender],
      },
      { quoted: msg }
    );
  },
};

const strike = {
  pattern: 'strike',
  alias: [],
  run: async (sock, msg, args, { from, sender }) => {
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (!quotedParticipant) {
      return sock.sendMessage(
        from,
        { text: withWatermark('🙄 Reply to the message of the person you want to strike, then .strike') },
        { quoted: msg }
      );
    }
    if (quotedParticipant === sender) {
      return sock.sendMessage(from, { text: withWatermark("🙄 You can't strike yourself.") }, { quoted: msg });
    }

    const thunderKey = `thunder:${sender.split('@')[0].split(':')[0]}`;
    const owned = Number((await gameStore.redis.get(thunderKey)) || 0);
    if (owned <= 0) {
      return sock.sendMessage(
        from,
        { text: withWatermark('🙄 You have no Thunder Strikes. Buy one with .thunder first.') },
        { quoted: msg }
      );
    }
    await gameStore.redis.decrby(thunderKey, 1);

    const attackerTag = `@${sender.split('@')[0]}`;
    const targetTag = `@${quotedParticipant.split('@')[0]}`;

    const blocked = await shieldStore.useShieldCharge(quotedParticipant);

    if (blocked) {
      const shieldState = await shieldStore.getShieldState(quotedParticipant);
      return sock.sendMessage(
        from,
        {
          text: withWatermark(
            `⚡ *THUNDER STRIKE LAUNCHED!* ⚡\n${attackerTag} struck ${targetTag}'s barracks!\n\n` +
            `🛡️ *BLOCKED!* 🛡️\n${targetTag}'s Shield absorbed the Thunder Strike!\n*Shield charge used*\n${targetTag}'s barracks are SAFE\n\n` +
            `*SHIELDS:* ${shieldState.shields} | *CHARGES:* ${shieldState.charges} left`
          ),
          mentions: [sender, quotedParticipant],
        },
        { quoted: msg }
      );
    }

    const result = await barracksStore.damageBarracks(quotedParticipant, shieldStore.THUNDER_DAMAGE);
    const barracks = await barracksStore.getBarracks(quotedParticipant);
    const info = barracksStore.levelInfo(barracks.level);

    let text = `⚡ *THUNDER STRIKE LAUNCHED!* ⚡\n${attackerTag} struck ${targetTag}'s barracks!\n\n💥 *DIRECT HIT!* 💥\n${targetTag}'s barracks took ${shieldStore.THUNDER_DAMAGE} damage!\n\n*${info.name}* → ${barracks.hp}/${info.hp} HP`;

    if (result.destroyed) {
      if (result.wiped) {
        text += `\n\n💀 *BARRACKS SHATTERED!* 💀\n${targetTag}'s LVL 1 barracks was destroyed!\n\n*ARMY DISBANDED* — all units lost, no refund.\n*Rebuild instantly with .barrack*`;
      } else {
        text += `\n\n💀 *BARRACKS BREACHED* 💀\n*DOWNGRADED TO:* LVL ${result.newLevel}\n*REFUND:* ${result.refund.toLocaleString()}g for lost capacity`;
        if (result.refund > 0) await gameStore.adjustWallet(quotedParticipant, result.refund);
      }
    } else {
      text += `\n\n*WARNING:* At 0 HP barracks downgrades! Buy .shield to protect yourself!`;
    }

    return sock.sendMessage(from, { text: withWatermark(text), mentions: [sender, quotedParticipant] }, { quoted: msg });
  },
};

module.exports = [buyThunder, buyShield, strike];
