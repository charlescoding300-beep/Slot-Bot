// lib/donateCard.js
// Uses a real photographic background instead of emoji glyphs — this is
// what actually fixes the "black box" rendering problem from earlier cards.
// Emoji need a color-emoji font that Render's servers don't ship with;
// a photo + plain bold text overlay has no such dependency at all.

const sharp = require('sharp');

const WIDTH = 1000;
const HEIGHT = 560;

// Fixed, direct-hotlink stock photo (casino chips/cards). If this specific
// URL ever stops resolving, swap it for any other direct image URL — the
// rest of the function doesn't care what the photo is.
const CASINO_PHOTO_URL = 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=1200&q=80&fit=crop';

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Background photo fetch failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * @param {object} opts
 *   opts.senderName, opts.receiverName — already formatted, e.g. "@charles"
 *   opts.amount - number
 */
async function renderDonateCard(opts) {
  const { senderName, receiverName, amount } = opts;

  const bgBuffer = await fetchImageBuffer(CASINO_PHOTO_URL);
  const bg = await sharp(bgBuffer).resize(WIDTH, HEIGHT, { fit: 'cover' }).toBuffer();

  // Dark gradient fade at the bottom so white text stays readable over any photo,
  // plus a thin gold frame to match the CYBER X brand accent color.
  const overlaySvg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="55%" stop-color="#000000" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.88"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>
    <rect x="8" y="8" width="${WIDTH - 16}" height="${HEIGHT - 16}" fill="none" stroke="#ffd700" stroke-width="4" rx="14"/>

    <text x="50%" y="${HEIGHT - 155}" font-family="Arial Black, sans-serif" font-size="30"
          fill="#ffd700" text-anchor="middle" font-weight="bold" letter-spacing="2">CYBER X ARMY — DONATION</text>

    <text x="50%" y="${HEIGHT - 95}" font-family="Arial, sans-serif" font-size="32"
          fill="#ffffff" text-anchor="middle" font-weight="bold">${senderName} funded ${receiverName}</text>

    <text x="50%" y="${HEIGHT - 45}" font-family="Arial Black, sans-serif" font-size="42"
          fill="#00ff9d" text-anchor="middle" font-weight="bold">+${amount.toLocaleString()} coins</text>
  </svg>
  `;

  return sharp(bg)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

module.exports = { renderDonateCard };
