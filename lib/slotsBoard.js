// lib/slotsBoard.js
// Renders a slot-machine result as a PNG image (dark/hacker aesthetic to match
// CYBER X branding), same Sharp/SVG approach as your .wasted command.

const sharp = require('sharp');

const WIDTH = 900;
const HEIGHT = 500;

// Real photo background instead of a flat/solid rectangle — fixes the
// "black" look by giving the card actual depth instead of a plain gradient.
// If this URL ever stops resolving, swap it for any other direct image link.
const CASINO_BG_URL = 'https://images.unsplash.com/photo-1566563255308-753861417000?w=1400&q=80&fit=crop';

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Background photo fetch failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * @param {string[]} reels - e.g. ['💎','💎','🍒']
 * @param {object} opts
 *   opts.won: boolean
 *   opts.multiplier: number
 *   opts.betAmount: number
 *   opts.netGain: number
 *   opts.balance: number
 *   opts.displayName: string  // player's name to show on the board
 */
async function renderSlotsBoard(reels, opts) {
  const { won, multiplier, betAmount, netGain, balance, displayName } = opts;

  const resultColor = won ? '#00ff9d' : '#ff3b5c';
  const resultText = won
    ? multiplier >= 5
      ? '🎉 JACKPOT — ALL THREE MATCH!'
      : '🎉 TWO SYMBOLS MATCH!'
    : '💨 NO MATCH';

  const gainText = won
    ? `+${netGain.toLocaleString()} COINS`
    : `${netGain.toLocaleString()} COINS`;

  const svg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.65"/>
      </linearGradient>
      <linearGradient id="reelBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1f1f1f"/>
        <stop offset="100%" stop-color="#111"/>
      </linearGradient>
    </defs>

    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>
    <rect x="10" y="10" width="${WIDTH - 20}" height="${HEIGHT - 20}" fill="none"
          stroke="${resultColor}" stroke-width="3" rx="18"/>

    <text x="${WIDTH / 2}" y="70" font-family="Arial Black, sans-serif" font-size="42"
          fill="#ffffff" text-anchor="middle" font-weight="bold">CYBER X SLOTS</text>

    <!-- reel boxes -->
    ${reels
      .map((sym, i) => {
        const boxW = 220;
        const gap = 30;
        const totalW = boxW * 3 + gap * 2;
        const startX = (WIDTH - totalW) / 2;
        const x = startX + i * (boxW + gap);
        return `
        <rect x="${x}" y="130" width="${boxW}" height="180" rx="16" fill="url(#reelBg)"
              stroke="#333" stroke-width="2"/>
        <text x="${x + boxW / 2}" y="250" font-size="90" text-anchor="middle">${sym}</text>
        `;
      })
      .join('')}

    <text x="${WIDTH / 2}" y="360" font-family="Arial, sans-serif" font-size="34"
          fill="${resultColor}" text-anchor="middle" font-weight="bold">${resultText}</text>

    <text x="${WIDTH / 2}" y="405" font-family="Arial, sans-serif" font-size="26"
          fill="#ffffff" text-anchor="middle">${displayName} • Bet ${betAmount.toLocaleString()}</text>

    <text x="${WIDTH / 2}" y="445" font-family="Arial Black, sans-serif" font-size="32"
          fill="${resultColor}" text-anchor="middle" font-weight="bold">${gainText}</text>

    <text x="${WIDTH / 2}" y="480" font-family="Arial, sans-serif" font-size="22"
          fill="#dddddd" text-anchor="middle">Balance: ${balance.toLocaleString()} coins</text>
  </svg>
  `;

  let bg;
  try {
    const bgBuffer = await fetchImageBuffer(CASINO_BG_URL);
    bg = await sharp(bgBuffer).resize(WIDTH, HEIGHT, { fit: 'cover' }).toBuffer();
  } catch (err) {
    // No internet on this host, or the photo URL broke — fall back to a
    // plain dark background so the command still works either way.
    bg = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#0d0d0d' },
    }).png().toBuffer();
  }

  return sharp(bg)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

module.exports = { renderSlotsBoard };
