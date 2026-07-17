// lib/systemGuard.js
// Three protections, all aimed at free-tier hosting reliability:
//
// 1. RAM guard — checks memory every 60s. Over the limit, tries garbage
//    collection first; if still over, exits cleanly so Render's own
//    supervisor restarts the process with a fresh memory slate. (A clean
//    restart is safer than trying to fix memory in a process that's already
//    in a bad state.)
// 2. Crash handlers — an uncaught error or unhandled promise rejection would
//    otherwise leave the bot in a silently broken state. These log it and
//    exit so the host restarts it properly instead.
// 3. Stale-connection watchdog — if no message/connection activity happens
//    for too long, the socket may have died without firing a proper 'close'
//    event. This forces a restart to recover.

const RAM_LIMIT_MB = Number(process.env.RAM_LIMIT_MB) || 450;
const MEMORY_CHECK_INTERVAL_MS = 60 * 1000; // every 60s
const STALE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
const STALE_THRESHOLD_MS = 15 * 60 * 1000; // no activity for 15 min = stale

let lastActivity = Date.now();

function markActivity() {
  lastActivity = Date.now();
}

function startMemoryGuard() {
  setInterval(() => {
    const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
    console.log(`[memory] RSS: ${rssMB}MB / ${RAM_LIMIT_MB}MB limit`);

    if (rssMB > RAM_LIMIT_MB) {
      console.warn(`[memory] Over limit (${rssMB}MB > ${RAM_LIMIT_MB}MB) — attempting cleanup...`);

      if (global.gc) {
        global.gc();
        const afterMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
        console.log(`[memory] After GC: ${afterMB}MB`);
        if (afterMB <= RAM_LIMIT_MB) return; // GC brought it back down, no restart needed
      } else {
        console.warn('[memory] global.gc() not available — start Node with --expose-gc for this to help. Restarting instead.');
      }

      console.error('[memory] Still over limit after cleanup — restarting process for a clean slate.');
      process.exit(1); // Render's supervisor restarts automatically on exit
    }
  }, MEMORY_CHECK_INTERVAL_MS);
}

function startCrashHandlers() {
  process.on('uncaughtException', (err) => {
    console.error('[crash] Uncaught exception, restarting:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[crash] Unhandled promise rejection, restarting:', reason);
    process.exit(1);
  });
}

/**
 * Call this whenever restarting the bot should happen automatically —
 * passed in from index.js so this module doesn't need to know about Baileys.
 */
function startStaleConnectionWatchdog(onStale) {
  setInterval(() => {
    const idleMs = Date.now() - lastActivity;
    if (idleMs > STALE_THRESHOLD_MS) {
      console.warn(`[watchdog] No activity for ${Math.round(idleMs / 60000)} min — connection may be dead. Restarting.`);
      markActivity(); // reset so this doesn't fire repeatedly during the restart
      onStale();
    }
  }, STALE_CHECK_INTERVAL_MS);
}

module.exports = { startMemoryGuard, startCrashHandlers, startStaleConnectionWatchdog, markActivity };
