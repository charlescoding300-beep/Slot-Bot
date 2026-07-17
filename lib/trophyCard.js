// lib/trophyCard.js
const sharp = require('sharp');

const WIDTH = 800;
const HEIGHT = 480;

async function renderTrophyCard(opts) {
  const { winnerName, loserName } = opts;

  const svg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1a1300"/>
        <stop offset="100%" stop-color="#0d0d0d"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffd700"/>
        <stop offset="100%" stop-color="#ff9d00"/>
      </linearGradient>
    </defs>

    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    <rect x="10" y="10" width="${WIDTH - 20}" height="${HEIGHT - 20}" fill="none"
          stroke="url(#gold)" stroke-width="4" rx="18"/>

    <text x="${WIDTH / 2}" y="60" font-family="Arial Black, sans-serif" font-size="30"
          fill="#ffffff" text-anchor="middle" font-weight="bold">CYBER X ARMY</text>

    <text x="${WIDTH / 2}" y="200" font-size="120" text-anchor="middle">🏆</text>

    <text x="${WIDTH / 2}" y="290" font-family="Arial Black, sans-serif" font-size="38"
          fill="url(#gold)" text-anchor="middle" font-weight="bold">${winnerName} WON THE BATTLE!</text>

    <text x="${WIDTH / 2}" y="335" font-family="Arial, sans-serif" font-size="24"
          fill="#ff3b5c" text-anchor="middle">${loserName} has been defeated</text>

    <line x1="${WIDTH / 2 - 180}" y1="375" x2="${WIDTH / 2 + 180}" y2="375" stroke="url(#gold)" stroke-width="1" opacity="0.5"/>

    <text x="${WIDTH / 2}" y="420" font-family="Arial, sans-serif" font-size="18"
          fill="#888888" text-anchor="middle">© MR_ZACK(^_^) • Created by cyber X</text>
  </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = { renderTrophyCard };
