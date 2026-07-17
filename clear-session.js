// clear-session.js
// Run this once: node clear-session.js
// Properly loads .env first (unlike an inline `node -e` command), then
// deletes every saved session key so the next boot starts 100% fresh —
// no leftover state from any previous library/fork to conflict with official Baileys.

require('dotenv').config();
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

(async () => {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error('❌ UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not found in your .env file.');
    console.error('   Make sure clear-session.js is in the same folder as your .env file.');
    process.exit(1);
  }

  const keys = await redis.keys('session:*');
  console.log(`Found ${keys.length} session keys.`);

  if (keys.length === 0) {
    console.log('Nothing to clear — already clean.');
    return;
  }

  for (const key of keys) {
    await redis.del(key);
    console.log(`Deleted: ${key}`);
  }

  console.log('\n✅ Done. All old session data cleared. Run `node index.js` now to get a fresh pairing code.');
})();
