/**
 * Turns the 8x8 patterns in data/icons.js into tinted, black-outlined images.
 *
 * Results are data URLs so they can be dropped straight into `<img src>` by the
 * HUD, and they are cached per key+color because the HUD re-renders often.
 */
import { ICON_PATTERNS } from '../data/icons.js';

const cache = new Map();

/** A 10x10 data URL for `key`, painted in `color`. Unknown keys fall back. */
export function iconURL(key, color) {
  const cacheKey = key + color;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const pattern = ICON_PATTERNS[key] || ICON_PATTERNS.scrap;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 10;
  const ctx = canvas.getContext('2d');

  // The pattern sits one pixel in from the edge, leaving room for the outline.
  const points = [];
  pattern.forEach((row, y) => {
    for (let x = 0; x < 8; x++) {
      if (row[x] === '#') points.push([x + 1, y + 1]);
    }
  });

  // Outline first: a black plus sign under every lit pixel.
  ctx.fillStyle = '#000';
  for (const [x, y] of points) {
    ctx.fillRect(x - 1, y, 3, 1);
    ctx.fillRect(x, y - 1, 1, 3);
  }

  ctx.fillStyle = color;
  for (const [x, y] of points) ctx.fillRect(x, y, 1, 1);

  const url = canvas.toDataURL();
  cache.set(cacheKey, url);
  return url;
}
