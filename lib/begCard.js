// lib/begCard.js
// Real photo background (confirmed: wallet stuffed with banknotes).

const sharp = require('sharp');

const WIDTH = 900;
const HEIGHT = 480;

// Confirmed real photo: "a wallet with a bunch of money sticking out of it" (Unsplash)
const BEG_BG_URL = 'https://images.unsplash.com/photo-1676313609592-909607f7332f?w=1400&q=80&fit=crop';

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Background photo fetch failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function renderBegCard(opts) {
  const { requesterName, targetName, amount } = opts;

  let bg;
  try {
    const bgBuffer = await fetchImageBuffer(BEG_BG_URL);
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
        <stop offset="0%" stop-color="#000000" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.8"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>
    <rect x="8" y="8" width="${WIDTH - 16}" height="${HEIGHT - 16}" fill="none" stroke="#ffd700" stroke-width="4" rx="14"/>

    <text x="50%" y="60" font-family="Arial Black, sans-serif" font-size="28"
          fill="#ffffff" text-anchor="middle" font-weight="bold" letter-spacing="2">CYBER X ARMY — REQUEST</text>

    <text x="50%" y="${HEIGHT - 130}" font-family="Arial, sans-serif" font-size="28"
          fill="#ffffff" text-anchor="middle" font-weight="bold">${requesterName} is asking ${targetName}</text>

    <text x="50%" y="${HEIGHT - 80}" font-family="Arial Black, sans-serif" font-size="40"
          fill="#ffd700" text-anchor="middle" font-weight="bold">for ${amount.toLocaleString()} coins</text>

    <text x="50%" y="${HEIGHT - 35}" font-family="Arial, sans-serif" font-size="20"
          fill="#dddddd" text-anchor="middle">Tap a button below to respond</text>
  </svg>
  `;

  return sharp(bg)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

module.exports = { renderBegCard };
