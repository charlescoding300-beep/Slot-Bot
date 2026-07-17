// web/server.js
// Public companion site for CYBER X Army. Login is via WhatsApp OTP (the bot
// DMs you a code — no separate password to manage). Once logged in you can
// see your coins/army, and play a quick mini-game for a few extra coins.
//
// This does NOT run standalone — call startWebServer(sock) from index.js
// once the bot is connected, so OTP codes can actually be sent.

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const authStore = require('./authStore');
const gameStore = require('../lib/gameStore');
const armyStore = require('../lib/armyStore');
const activityFeed = require('../lib/activityFeed');

const SPIN_COOLDOWN_SECONDS = 5 * 60; // 5 minutes between free web mini-game spins
const SPIN_MIN_WIN = 20;
const SPIN_MAX_WIN = 150;

function startWebServer(sock, port = process.env.PORT || 4000) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));

  function phoneToJid(phone) {
    return `${authStore.normalizePhone(phone)}@s.whatsapp.net`;
  }

  // ---- auth ----------------------------------------------------------

  app.post('/api/request-code', async (req, res) => {
    const { phone } = req.body;
    if (!phone || authStore.normalizePhone(phone).length < 8) {
      return res.status(400).json({ error: 'Enter a valid WhatsApp number with country code.' });
    }
    const code = await authStore.createOTP(phone);
    try {
      await sock.sendMessage(phoneToJid(phone), {
        text: `🔐 Your CYBER X Army login code is: *${code}*\n\nThis code expires in 5 minutes. Didn't request this? Ignore this message.`,
      });
    } catch (err) {
      return res.status(500).json({ error: "Couldn't send the code. Make sure this number has messaged the bot at least once." });
    }
    return res.json({ ok: true });
  });

  app.post('/api/verify-code', async (req, res) => {
    const { phone, code } = req.body;
    const valid = await authStore.verifyOTP(phone, code);
    if (!valid) return res.status(400).json({ error: 'Incorrect or expired code.' });

    const token = await authStore.createSession(phone);
    res.cookie('session', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    return res.json({ ok: true });
  });

  app.post('/api/logout', async (req, res) => {
    await authStore.destroySession(req.cookies.session);
    res.clearCookie('session');
    return res.json({ ok: true });
  });

  // ---- middleware: require login for everything under /api/me* --------

  async function requireAuth(req, res, next) {
    const phone = await authStore.getSessionPhone(req.cookies.session);
    if (!phone) return res.status(401).json({ error: 'Not logged in.' });
    req.phone = phone;
    req.jid = phoneToJid(phone);
    next();
  }

  // ---- player data -----------------------------------------------------

  app.get('/api/me', requireAuth, async (req, res) => {
    const user = await gameStore.getUser(req.jid);
    const army = await armyStore.getArmy(req.jid);
    res.json({
      phone: req.phone,
      wallet: user.wallet,
      bank: user.bank,
      xp: user.xp,
      level: user.level,
      wins: user.wins,
      losses: user.losses,
      army: {
        soldier: army.soldier,
        archer: army.archer,
        giant: army.giant,
        hp: army.hp,
        maxHp: armyStore.MAX_HP,
        totalDamage: armyStore.calculateDamage(army),
      },
    });
  });

  app.get('/api/leaderboard', async (req, res) => {
    const board = await gameStore.getLeaderboard('coins', 10);
    res.json(board);
  });

  // Global live activity feed — every player's recent wins/losses across
  // Slots, Dig, and Battle. Powers the scrolling ticker on the site.
  app.get('/api/activity', async (req, res) => {
    const feed = await activityFeed.getRecentActivity(20);
    res.json(feed);
  });

  // ---- mini-game: quick coin spin, separate from the WhatsApp .slots ---

  app.post('/api/play-spin', requireAuth, async (req, res) => {
    const remaining = await gameStore.checkAndSetCooldown('webspin', req.jid, SPIN_COOLDOWN_SECONDS);
    if (remaining > 0) {
      return res.status(429).json({ error: 'On cooldown', remainingSeconds: remaining });
    }
    const win = Math.floor(Math.random() * (SPIN_MAX_WIN - SPIN_MIN_WIN + 1)) + SPIN_MIN_WIN;
    const newBalance = await gameStore.adjustWallet(req.jid, win);
    res.json({ won: win, balance: newBalance });
  });

  app.listen(port, () => console.log(`🎰 CYBER X Army web site running on port ${port}`));
  return app;
}

module.exports = { startWebServer };
