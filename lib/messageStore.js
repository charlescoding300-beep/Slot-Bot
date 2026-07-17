// lib/messageStore.js
// Baileys needs to re-fetch a message's original content to decrypt poll
// votes later (via the `getMessage` socket config). Local memory would be
// lost on restart, so this stores it in Redis instead — same persistence
// guarantee as everything else in this project.

const { redis } = require('./gameStore');
const { BufferJSON } = require('@whiskeysockets/baileys');

const EXPIRY_SECONDS = 3600; // 1 hour is plenty for a battle challenge to be answered

function msgKey(id) {
  return `msg:${id}`;
}

async function saveMessage(key, message) {
  const str = JSON.stringify(message, BufferJSON.replacer);
  await redis.set(msgKey(key.id), str, { ex: EXPIRY_SECONDS });
}

async function getMessage(key) {
  const raw = await redis.get(msgKey(key.id));
  if (!raw) return undefined;
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return JSON.parse(str, BufferJSON.reviver);
}

module.exports = { saveMessage, getMessage };
