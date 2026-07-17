// lib/botConfig.js
// Bot-wide settings (prefix, public/private mode, owner) — persisted in
// Redis so `.setprefix` and `.mode` changes survive restarts too.

const { redis } = require('./gameStore');

const CONFIG_KEY = 'config:bot';

const DEFAULTS = {
  prefix: '.',
  mode: 'public', // 'public' | 'private'
  owner: '', // set on first connection to the linked account's own JID
};

async function getConfig() {
  const data = await redis.hgetall(CONFIG_KEY);
  if (!data || Object.keys(data).length === 0) {
    await redis.hset(CONFIG_KEY, DEFAULTS);
    return { ...DEFAULTS };
  }
  return { ...DEFAULTS, ...data };
}

async function setPrefix(newPrefix) {
  await redis.hset(CONFIG_KEY, { prefix: newPrefix });
}

async function setMode(mode) {
  if (mode !== 'public' && mode !== 'private') throw new Error("mode must be 'public' or 'private'");
  await redis.hset(CONFIG_KEY, { mode });
}

async function setOwner(ownerJid) {
  await redis.hset(CONFIG_KEY, { owner: ownerJid });
}

async function isOwner(jid) {
  const config = await getConfig();
  const bareId = jid.split('@')[0].split(':')[0];
  const ownerBareId = (config.owner || '').split('@')[0].split(':')[0];
  return bareId && ownerBareId && bareId === ownerBareId;
}

module.exports = { getConfig, setPrefix, setMode, setOwner, isOwner };
