// lib/barracksCard.js
// Real photo backgrounds, confirmed via search (not guessed), matching each
// tier's vibe: wooden fence -> stone castle -> golden throne room.

const sharp = require('sharp');

const WIDTH = 900;
const HEIGHT = 520;

const LEVEL_BG_URLS = {
  1: 'https://images.unsplash.com/photo-1758636588716-5dc04a819c24?w=1400&q=80&fit=crop', // rustic wooden fence
  2: 'https://images.unsplash.com/photo-1758636588716-5dc04a819c24?w=1400&q=80&fit=crop',
  3: 'https://images.unsplash.com/photo-1742629290171-c0ff8999749f?w=1400&q=80&fit=crop', // stone castle on hillside
  4: 'https://images.unsplash.com/photo-1742629290171-c0ff8999749f?w=1400&q=80&fit=crop',
  5: 'https://images.unsplash.com/photo-1695638720523-07dba7435b22?w=1400&q=80&fit=crop', // golden throne room
};

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Background photo fetch failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * @param {object} opts
 *   opts.level, opts.levelName, opts.stars, opts.vibe
 *   opts.used, opts.capacity (Infinity for lvl5)
 *   opts.units - { archer, swordman, knight, giant }
 *   opts.hp, opts.dmg - total power
 *   opts.displayName
 */
async function renderBarracksCard(opts) {
  const { level, levelName, stars, vibe, used, capacity, units, hp, dmg, displayName } = opts;
  const color = level === 5 ? '#ffd700' : '#00ff9d';
  const capacityText = capacity === Infinity ? `${used}/♾️` : `${used}/${capacity}`;

  let bg;
  try {
    const bgBuffer = await fetchImageBuffer(LEVEL_BG_URLS[level] || LEVEL_BG_URLS[1]);
    bg = await sharp(bgBuffer).resize(WIDTH, HEIGHT, { fit: 'cover' }).toBuffer();
  } catch (err) {
    bg = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#0d0d0d' },
    }).png().toBuffer();
  }

  const unitEntries = ['archer', 'swordman', 'knight', 'giant'].filter((t) => units[t] > 0);
  const unitLines = unitEntries.length
    ? unitEntries
        .map((t, i) => `<tspan x="60" dy="${i === 0 ? 0 : 26}">${units[t]}x ${t.charAt(0).toUpperCase() + t.slice(1)}</tspan>`)
        .join('')
    : `<tspan x="60" dy="0">No units yet</tspan>`;

  const overlaySvg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.82"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>
    <rect x="8" y="8" width="${WIDTH - 16}" height="${HEIGHT - 16}" fill="none" stroke="${color}" stroke-width="4" rx="14"/>

    <text x="50%" y="55" font-family="Arial Black, sans-serif" font-size="26"
          fill="#ffffff" text-anchor="middle" font-weight="bold">${displayName}'s Barracks</text>

    <text x="50%" y="105" font-family="Arial Black, sans-serif" font-size="34"
          fill="${color}" text-anchor="middle" font-weight="bold">${levelName}</text>

    <text x="50%" y="135" font-family="Arial, sans-serif" font-size="20"
          fill="${color}" text-anchor="middle">${stars}</text>

    <text x="60" y="185" font-family="Arial, sans-serif" font-size="18" fill="#dddddd">CAPACITY: ${capacityText} units</text>

    <text font-family="Arial, sans-serif" font-size="20" fill="#ffffff" font-weight="bold" y="225">
      ${unitLines}
    </text>

    <text x="60" y="${HEIGHT - 90}" font-family="Arial Black, sans-serif" font-size="22"
          fill="${color}" font-weight="bold">POWER: ${hp.toLocaleString()} HP | ${dmg.toLocaleString()} DMG</text>

    <text x="60" y="${HEIGHT - 55}" font-family="Arial, sans-serif" font-size="17"
          fill="#cccccc" font-style="italic">"${vibe}"</text>

    <text x="50%" y="${HEIGHT - 20}" font-family="Arial, sans-serif" font-size="15"
          fill="#888888" text-anchor="middle">© 𝕮𝖄𝕭𝙀𝙍 𝖃</text>
  </svg>
  `;

  return sharp(bg)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

module.exports = { renderBarracksCard };
