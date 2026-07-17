// lib/unitCard.js
// Branded purchase-confirmation card (Sharp/SVG, same aesthetic as slotsBoard.js
// and .wasted). Not frame-animated — see note in chat re: canvas/gif limitations
// on free-tier hosting. This renders instantly and works anywhere Sharp runs.

const sharp = require('sharp');

const WIDTH = 800;
const HEIGHT = 450;

const UNIT_COLORS = {
  soldier: '#00ff9d',
  archer: '#ffcc00',
  giant: '#ff3b5c',
};

/**
 * @param {string} unitType - 'soldier' | 'archer' | 'giant'
 * @param {object} opts
 *   opts.emoji, opts.label, opts.qty, opts.cost, opts.damage, opts.displayName
 */
async function renderUnitCard(unitType, opts) {
  const { emoji, label, qty, cost, damage, displayName } = opts;
  const color = UNIT_COLORS[unitType] || '#00ff9d';
  const totalCost = cost * qty;
  const totalDamage = damage * qty;

  const svg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0d0d0d"/>
        <stop offset="100%" stop-color="#1a1a1a"/>
      </linearGradient>
    </defs>

    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    <rect x="10" y="10" width="${WIDTH - 20}" height="${HEIGHT - 20}" fill="none"
          stroke="${color}" stroke-width="3" rx="18"/>

    <text x="${WIDTH / 2}" y="60" font-family="Arial Black, sans-serif" font-size="30"
          fill="#ffffff" text-anchor="middle" font-weight="bold">CYBER X ARMY</text>

    <circle cx="${WIDTH / 2}" cy="185" r="90" fill="#161616" stroke="${color}" stroke-width="3"/>
    <text x="${WIDTH / 2}" y="215" font-size="100" text-anchor="middle">${emoji}</text>

    <text x="${WIDTH / 2}" y="315" font-family="Arial, sans-serif" font-size="30"
          fill="${color}" text-anchor="middle" font-weight="bold">${qty}x ${label}${qty > 1 ? 's' : ''} Purchased</text>

    <text x="${WIDTH / 2}" y="355" font-family="Arial, sans-serif" font-size="22"
          fill="#ffffff" text-anchor="middle">${displayName} • Cost: ${totalCost.toLocaleString()} coins</text>

    <text x="${WIDTH / 2}" y="390" font-family="Arial Black, sans-serif" font-size="24"
          fill="${color}" text-anchor="middle" font-weight="bold">⚔️ Total Damage: ${totalDamage.toLocaleString()}</text>
  </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = { renderUnitCard };
