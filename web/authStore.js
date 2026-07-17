// web/authStore.js
// Login works by sending a one-time code to the player's WhatsApp — no
// separate password system to manage. Codes and sessions both live in
// Redis so a Render restart doesn't log anyone out or break a pending login.

const { redis } = require('../lib/gameStore');
const crypto = require('crypto');

function normalizePhone(phone) {
  return phone.replace(/[^0-9]/g, '');
}

function otpKey(phone) {
  return `webotp:${normalizePhone(phone)}`;
}

function sessionKey(token) {
  return `websession:${token}`;
}

/**
 * Generates a 6-digit code, stores it for 5 minutes, returns it so the
 * caller can send it via WhatsApp.
 */
async function createOTP(phone) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  await redis.set(otpKey(phone), code, { ex: 300 });
  return code;
}

async function verifyOTP(phone, code) {
  const stored = await redis.get(otpKey(phone));
  if (!stored || String(stored) !== String(code)) return false;
  await redis.del(otpKey(phone));
  return true;
}

/**
 * Creates a 7-day web session for a phone number, returns the session token
 * to be set as a cookie.
 */
async function createSession(phone) {
  const token = crypto.randomBytes(24).toString('hex');
  await redis.set(sessionKey(token), normalizePhone(phone), { ex: 7 * 24 * 60 * 60 });
  return token;
}

async function getSessionPhone(token) {
  if (!token) return null;
  const phone = await redis.get(sessionKey(token));
  return phone || null;
}

async function destroySession(token) {
  await redis.del(sessionKey(token));
}

module.exports = { normalizePhone, createOTP, verifyOTP, createSession, getSessionPhone, destroySession };
