// lib/watermark.js
// Every command's output gets this footer appended — the bot's signature watermark.

const WATERMARK = '\n\n> © *𝕮𝖄𝕭𝙀𝙍 𝖃*';

function withWatermark(text) {
  return `${text}${WATERMARK}`;
}

module.exports = { withWatermark, WATERMARK };
