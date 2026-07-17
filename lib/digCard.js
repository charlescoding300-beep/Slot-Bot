// lib/digCard.js
// Real photo background (confirmed: a table of gold coins/treasure), same
// no-emoji-overlay approach as donateCard.js and slotsBoard.js.

const sharp = require('sharp');

const WIDTH = 900;
const HEIGHT = 500;

// Confirmed real photo: "a table topped with lots of gold coins" (Unsplash)
const DIG_BG_URL = 'https://images.unsplash.com/photo-1691404819847-dab7d769aca7?w=1400&q=80&fit=crop';

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Background photo fetch failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * @param {object} opts
 *   opts.won - boolean
 *   opts.amount - number (only relevant if won)
 *   opts.displayName - string
 */
async function renderDigCard(opts) {
  const { won, amount, displayName } = opts;
  const color = won ? '#00ff9d' : '#ff3b5c';
  const headline = won ? 'GOLD FOUND!' : 'NO GOLD FOUND';

  let bg;
  try {
    const bgBuffer = await fetchImageBuffer(DIG_BG_URL);
    bg = await sharp(bgBuffer).resize(WIDTH, HEIGHT, { fit: 'cover' }).toBuffer();
  } catch (err) {
    bg = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#0d0d0d' },
    }).png().toBuffer();
  }

  const overlaySvg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.75"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>
    <rect x="8" y="8" width="${WIDTH - 16}" height="${HEIGHT - 16}" fill="none" stroke="${color}" stroke-width="4" rx="14"/>

    <text x="50%" y="70" font-family="Arial Black, sans-serif" font-size="30"
          fill="#ffffff" text-anchor="middle" font-weight="bold" letter-spacing="2">CYBER X ARMY — DIG</text>

    <text x="50%" y="${HEIGHT / 2 + 10}" font-family="Arial Black, sans-serif" font-size="46"
          fill="${color}" text-anchor="middle" font-weight="bold">${headline}</text>

    ${won
      ? `<text x="50%" y="${HEIGHT / 2 + 60}" font-family="Arial, sans-serif" font-size="30"
          fill="#ffffff" text-anchor="middle" font-weight="bold">+${amount.toLocaleString()} gold coins</text>`
      : ''}

    <text x="50%" y="${HEIGHT - 30}" font-family="Arial, sans-serif" font-size="22"
          fill="#dddddd" text-anchor="middle">${displayName}</text>
  </svg>
  `;

  return sharp(bg)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

module.exports = { renderDigCard };
