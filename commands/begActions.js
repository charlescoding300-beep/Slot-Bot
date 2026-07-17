// commands/begActions.js
const gameStore = require('../lib/gameStore');
const begStore = require('../lib/begStore');
const { withWatermark } = require('../lib/watermark');

async function handleYes(sock, msg, args, { from, sender }) {
  const beg = await begStore.findPendingBegForUser(from, sender);
  if (!beg || beg.status !== 'pending') {
    return sock.sendMessage(from, { text: withWatermark('❌ No pending request found for you.') }, { quoted: msg });
  }

  const targetUser = await gameStore.getUser(beg.target);
  const requesterTag = `@${beg.requester.split('@')[0]}`;
  const targetTag = `@${beg.target.split('@')[0]}`;

  if (targetUser.wallet < beg.amount) {
    await begStore.resolveBegStatus(beg.begId, 'declined');
    return sock.sendMessage(
      from,
      {
        text: withWatermark(`🫠 ${targetTag} don't have that exact amount to give`),
        mentions: [beg.target, beg.requester],
      },
      { quoted: msg }
    );
  }

  await gameStore.adjustWallet(beg.target, -beg.amount);
  await gameStore.adjustWallet(beg.requester, beg.amount);
  await begStore.resolveBegStatus(beg.begId, 'accepted');

  return sock.sendMessage(
    from,
    {
      text: withWatermark(`✅ ${targetTag} sent ${requesterTag} *${beg.amount.toLocaleString()} coins* 🪙`),
      mentions: [beg.target, beg.requester],
    },
    { quoted: msg }
  );
}

async function handleNo(sock, msg, args, { from, sender }) {
  const beg = await begStore.findPendingBegForUser(from, sender);
  if (!beg || beg.status !== 'pending') {
    return sock.sendMessage(from, { text: withWatermark('❌ No pending request found for you.') }, { quoted: msg });
  }

  await begStore.resolveBegStatus(beg.begId, 'declined');
  const requesterTag = `@${beg.requester.split('@')[0]}`;
  const targetTag = `@${beg.target.split('@')[0]}`;

  return sock.sendMessage(
    from,
    {
      text: withWatermark(`❌ ${targetTag} declined ${requesterTag}'s request.`),
      mentions: [beg.target, beg.requester],
    },
    { quoted: msg }
  );
}

module.exports = [
  { pattern: 'begyes', alias: [], run: handleYes },
  { pattern: 'begno', alias: [], run: handleNo },
];
