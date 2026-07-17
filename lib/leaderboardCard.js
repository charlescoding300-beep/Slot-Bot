// lib/leaderboardCard.js
const sharp = require('sharp');

const WIDTH = 900;
const HEIGHT = 700;

// Confirmed real photo: gold coins (reusing the dig card's confirmed photo)
const BG_URL = 'https://images.unsplash.com/photo-1691404819847-dab7d769aca7?w=1400&q=80&fit=crop';

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Background photo fetch failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * @param {object} opts
 *   opts.richest - [{userId, score}] top 10 by coins
 *   opts.generals - [{userId, power}] top 10 by army power
 */
async function renderLeaderboardCard(opts) {
  const { richest, generals } = opts;

  let bg;
  try {
    const bgBuffer = await fetchImageBuffer(BG_URL);
    bg = await sharp(bgBuffer).resize(WIDTH, HEIGHT, { fit: 'cover' }).toBuffer();
  } catch (err) {
    bg = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#0d0d0d' },
    }).png().toBuffer();
  }

  const richLines = richest
    .slice(0, 10)
    .map((e, i) => `<tspan x="60" dy="${i === 0 ? 0 : 26}">${i + 1}. ${e.userId} — ${e.score.toLocaleString()}g</tspan>`)
    .join('');

  const genLines = generals
    .slice(0, 10)
    .map((e, i) => `<tspan x="${WIDTH / 2 + 30}" dy="${i === 0 ? 0 : 26}">${i + 1}. ${e.userId} — ${e.power.toLocaleString()}</tspan>`)
    .join('');

  const overlaySvg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>
    <rect x="8" y="8" width="${WIDTH - 16}" height="${HEIGHT - 16}" fill="none" stroke="#ffd700" stroke-width="4" rx="14"/>

    <text x="50%" y="55" font-family="Arial Black, sans-serif" font-size="34"
          fill="#ffd700" text-anchor="middle" font-weight="bold">🏆 SERVER ELITE 🏆</text>

    <text x="60" y="100" font-family="Arial Black, sans-serif" font-size="22" fill="#ffffff" font-weight="bold">💰 RICHEST</text>
    <text font-family="Arial, sans-serif" font-size="18" fill="#dddddd" y="135">${richLines}</text>

    <text x="${WIDTH / 2 + 30}" y="100" font-family="Arial Black, sans-serif" font-size="22" fill="#ffffff" font-weight="bold">⚔️ GENERALS</text>
    <text font-family="Arial, sans-serif" font-size="18" fill="#dddddd" y="135">${genLines}</text>

    <text x="50%" y="${HEIGHT - 20}" font-family="Arial, sans-serif" font-size="15"
          fill="#888888" text-anchor="middle">© 𝕮𝖄𝕭𝙀𝙍 𝖃</text>
  </svg>
  `;

  return sharp(bg)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

module.exports = { renderLeaderboardCard };
