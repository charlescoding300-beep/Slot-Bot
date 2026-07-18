// lib/unitPhotoCard.js
// Real photo per unit type (confirmed via search, not guessed), same
// no-emoji-overlay approach as the other cards.

const sharp = require('sharp');

const WIDTH = 900;
const HEIGHT = 500;

const UNIT_BG_URLS = {
  archer: 'https://images.unsplash.com/photo-1741790053537-c34a2e90ed40?w=1400&q=80&fit=crop', // person shooting a bow
  swordman: 'https://images.unsplash.com/photo-1711523645098-838ccc182d80?w=1400&q=80&fit=crop', // medieval armor group
  knight: 'https://images.unsplash.com/photo-1756799773311-399ac88a8b93?w=1400&q=80&fit=crop', // knight on horseback
  giant: 'https://images.unsplash.com/photo-1741283880414-e8480d78517e?w=1400&q=80&fit=crop', // giant statue
};

const UNIT_COLORS = {
  archer: '#00ff9d',
  swordman: '#00c3ff',
  knight: '#ffd700',
  giant: '#ff3b5c',
};

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Background photo fetch failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * @param {string} unitType - 'archer' | 'swordman' | 'knight' | 'giant'
 * @param {object} opts - opts.label, opts.qty, opts.cost, opts.dmg, opts.hp, opts.displayName
 */
async function renderUnitPhotoCard(unitType, opts) {
  const { label, qty, cost, dmg, hp, displayName } = opts;
  const color = UNIT_COLORS[unitType] || '#00ff9d';
  const totalCost = cost * qty;

  let bg;
  try {
    const bgBuffer = await fetchImageBuffer(UNIT_BG_URLS[unitType]);
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
        <stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>
    <rect x="8" y="8" width="${WIDTH - 16}" height="${HEIGHT - 16}" fill="none" stroke="${color}" stroke-width="4" rx="14"/>

    <text x="50%" y="55" font-family="Arial Black, sans-serif" font-size="26"
          fill="#ffffff" text-anchor="middle" font-weight="bold">CYBER X ARMY</text>

    <text x="50%" y="${HEIGHT - 130}" font-family="Arial Black, sans-serif" font-size="32"
          fill="${color}" text-anchor="middle" font-weight="bold">${qty}x ${label}${qty > 1 ? 's' : ''} Recruited</text>

    <text x="50%" y="${HEIGHT - 90}" font-family="Arial, sans-serif" font-size="22"
          fill="#ffffff" text-anchor="middle">${displayName} • Cost: ${totalCost.toLocaleString()}g</text>

    <text x="50%" y="${HEIGHT - 55}" font-family="Arial Black, sans-serif" font-size="24"
          fill="${color}" text-anchor="middle" font-weight="bold">⚔️ ${(hp * qty).toLocaleString()} HP | ${(dmg * qty).toLocaleString()} DMG</text>

    <text x="50%" y="${HEIGHT - 20}" font-family="Arial, sans-serif" font-size="15"
          fill="#cccccc" text-anchor="middle">© 𝕮𝖄𝕭𝙀𝙍 𝖃</text>
  </svg>
  `;

  return sharp(bg)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

module.exports = { renderUnitPhotoCard };
