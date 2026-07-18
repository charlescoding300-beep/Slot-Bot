// lib/trophyCard.js
// Real photo background (confirmed gold trophy/award photo), same
// no-emoji-overlay approach as the other cards — the old version used a
// flat gradient AND an emoji glyph directly in the SVG (🏆), which is
// exactly the black-box rendering issue from earlier. Both fixed here.

const sharp = require('sharp');

const WIDTH = 800;
const HEIGHT = 480;

// Confirmed real photo: gold/silver trophy statue (Unsplash)
const TROPHY_BG_URL = 'https://images.unsplash.com/photo-1648538874920-5deefcb65673?w=1400&q=80&fit=crop';

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Background photo fetch failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function renderTrophyCard(opts) {
  const { winnerName, loserName } = opts;

  let bg;
  try {
    const bgBuffer = await fetchImageBuffer(TROPHY_BG_URL);
    bg = await sharp(bgBuffer).resize(WIDTH, HEIGHT, { fit: 'cover' }).toBuffer();
  } catch (err) {
    bg = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#1a1300' },
    }).png().toBuffer();
  }

  const overlaySvg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.88"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffd700"/>
        <stop offset="100%" stop-color="#ff9d00"/>
      </linearGradient>
    </defs>

    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>
    <rect x="10" y="10" width="${WIDTH - 20}" height="${HEIGHT - 20}" fill="none"
          stroke="url(#gold)" stroke-width="4" rx="18"/>

    <text x="${WIDTH / 2}" y="60" font-family="Arial Black, sans-serif" font-size="30"
          fill="#ffffff" text-anchor="middle" font-weight="bold">CYBER X ARMY</text>

    <text x="${WIDTH / 2}" y="${HEIGHT - 150}" font-family="Arial Black, sans-serif" font-size="38"
          fill="url(#gold)" text-anchor="middle" font-weight="bold">${winnerName} WON THE BATTLE!</text>

    <text x="${WIDTH / 2}" y="${HEIGHT - 105}" font-family="Arial, sans-serif" font-size="24"
          fill="#ff3b5c" text-anchor="middle">${loserName} has been defeated</text>

    <line x1="${WIDTH / 2 - 180}" y1="${HEIGHT - 65}" x2="${WIDTH / 2 + 180}" y2="${HEIGHT - 65}" stroke="url(#gold)" stroke-width="1" opacity="0.5"/>

    <text x="${WIDTH / 2}" y="${HEIGHT - 20}" font-family="Arial, sans-serif" font-size="18"
          fill="#dddddd" text-anchor="middle">© 𝕮𝖄𝕭𝙀𝙍 𝖃</text>
  </svg>
  `;

  return sharp(bg)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

module.exports = { renderTrophyCard };
