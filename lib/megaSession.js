// lib/megaSession.js
// This is the actual pattern used by Knightbot-MD and its whole family of
// forks (SubZero-MD, LiltenBot, etc.): local file auth (useMultiFileAuthState)
// for the real connection, backed up to Mega.nz so it survives a host that
// wipes local disk on restart (like Render's free tier).
//
// Flow:
//   1. First run: no SESSION_ID yet -> pair normally -> creds.json gets
//      written locally by Baileys -> we upload it to Mega -> print the
//      SESSION_ID for you to save as an env var.
//   2. Every future boot: SESSION_ID env var is set -> download that file
//      from Mega BEFORE Baileys starts -> creds.json is back on disk ->
//      useMultiFileAuthState just reads it like any normal local session.

const fs = require('fs');
const path = require('path');
const { Storage, File } = require('megajs');

const SESSION_PREFIX = 'CYBERX~';
const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
const CREDS_PATH = path.join(SESSIONS_DIR, 'creds.json');

/**
 * Downloads the saved session from Mega (using the SESSION_ID env var)
 * and writes it to sessions/creds.json — call this BEFORE
 * useMultiFileAuthState so the file already exists when Baileys reads it.
 */
async function restoreSessionFromMega(sessionId) {
  if (!sessionId) return false;

  const megaFileRef = sessionId.replace(SESSION_PREFIX, '');
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

  return new Promise((resolve) => {
    try {
      const file = File.fromURL(`https://mega.nz/file/${megaFileRef}`);
      file.download((err, data) => {
        if (err) {
          console.error('[mega] Failed to download saved session:', err.message);
          return resolve(false); // fall through to a fresh pairing instead of crashing
        }
        fs.writeFileSync(CREDS_PATH, data);
        console.log('[mega] Session restored from Mega — no new pairing needed.');
        resolve(true);
      });
    } catch (err) {
      console.error('[mega] Error restoring session:', err.message);
      resolve(false);
    }
  });
}

/**
 * Uploads the current creds.json to Mega and returns a SESSION_ID string
 * to save as an env var. Requires MEGA_EMAIL and MEGA_PASSWORD.
 */
async function backupSessionToMega() {
  const email = process.env.MEGA_EMAIL;
  const password = process.env.MEGA_PASSWORD;

  if (!email || !password) {
    console.log('[mega] MEGA_EMAIL / MEGA_PASSWORD not set — skipping backup (session will NOT survive a restart without this).');
    return null;
  }

  if (!fs.existsSync(CREDS_PATH)) {
    console.log('[mega] No creds.json found yet — nothing to back up.');
    return null;
  }

  try {
    const storage = await new Storage({ email, password }).ready;
    const fileBuffer = fs.readFileSync(CREDS_PATH);
    const uploadedFile = await storage.upload({ name: `creds-${Date.now()}.json` }, fileBuffer).complete;
    const link = await uploadedFile.link();

    // link looks like https://mega.nz/file/<id>#<key> — we only need the part after /file/
    const fileRef = link.split('/file/')[1];
    const sessionId = `${SESSION_PREFIX}${fileRef}`;

    console.log('\n💾 Session backed up to Mega!');
    console.log(`🔑 Your SESSION_ID: ${sessionId}`);
    console.log('Save this as a SESSION_ID environment variable on Render so future restarts skip re-pairing.\n');

    return sessionId;
  } catch (err) {
    console.error('[mega] Backup failed:', err.message);
    return null;
  }
}

module.exports = { restoreSessionFromMega, backupSessionToMega, SESSIONS_DIR };

