/**
 * Die faces, painted pixel by pixel onto 16x16 canvases.
 *
 * Every face the game can show is drawn once and cached, so the board loop only
 * ever blits. A die is a rounded square (`cut` controls how rounded), lit from
 * the top, with either pips or a two-digit number on it.
 */
import { DICE } from '../data/dice.js';
import { DIGIT_GLYPHS, PIP_LAYOUTS } from '../data/icons.js';
import { shade } from './palette.js';

const SIZE = 16;
const EDGE = '#07060f';
const cache = new Map();

/**
 * The face of a die that has no value of its own.
 *
 * A MIRROR DIE is blank until the board settles and it has something to copy,
 * so its own roll is never shown — it does not have one.
 */
export const BLANK_FACE = 0;

/**
 * Decorations that make a special die recognisable at a glance. Keyed by die
 * type; a die without an entry here is simply undecorated.
 */
const MARKINGS = {
  virus(ctx, { dark }) {
    ctx.fillStyle = dark;
    const spikes = [[5, 1], [10, 1], [1, 5], [14, 10], [5, 14], [10, 14], [1, 10], [14, 5]];
    for (const [x, y] of spikes) ctx.fillRect(x, y, 1, 1);
  },
  mirror(ctx) {
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 5; i++) ctx.fillRect(2 + i, 6 - i, 1, 1);
  },
  qubit(ctx, { light }) {
    ctx.fillStyle = light;
    ctx.fillRect(1, 3, 1, 10);
    ctx.fillRect(14, 3, 1, 10);
  },
  amp(ctx, { light }) {
    ctx.fillStyle = light;
    ctx.fillRect(12, 1, 2, 1);
    ctx.fillRect(13, 2, 1, 1);
  },
};

/** Paint `value` as centred 3x5 digits — used by dice with more than six faces. */
function drawDigits(ctx, value) {
  const text = String(value);
  const width = text.length * 3 + (text.length - 1);
  let x = Math.floor((SIZE - width) / 2);
  for (const char of text) {
    const glyph = DIGIT_GLYPHS[char];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (glyph[row][col] === '1') ctx.fillRect(x + col, 5 + row, 1, 1);
      }
    }
    x += 4;
  }
}

/** The face canvas for `type` showing `value`. Cached; do not draw into it. */
export function dieSprite(type, value) {
  const cacheKey = type + '|' + value;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const def = DICE[type];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  // How far each row is inset, which is what rounds the corners.
  const inset = y => Math.max(0, def.cut - y, def.cut - (SIZE - 1 - y));

  // Dark silhouette, then the lit body one pixel inside it.
  ctx.fillStyle = EDGE;
  for (let y = 0; y < SIZE; y++) {
    const i = inset(y);
    ctx.fillRect(i, y, SIZE - 2 * i, 1);
  }

  const light = shade(def.color, 0.5);
  const dark = shade(def.color, -0.38);
  for (let y = 1; y < SIZE - 1; y++) {
    const i = inset(y) + 1;
    const width = SIZE - 2 * i;
    if (width <= 0) continue;
    ctx.fillStyle = y <= 2 ? light : y >= 12 ? dark : def.color;
    ctx.fillRect(i, y, width, 1);
  }

  MARKINGS[type]?.(ctx, { light, dark, color: def.color });

  ctx.fillStyle = EDGE;
  if (!value) {
    // BLANK_FACE: body and markings, and nothing to read off it.
  } else if (PIP_LAYOUTS[value] && def.faces === 6) {
    for (const [x, y] of PIP_LAYOUTS[value]) ctx.fillRect(x, y, 2, 2);
  } else {
    // Digits, for a die with more faces than there are pip layouts — and for a
    // six-sided MIRROR DIE showing a value it copied off a d12 or a d20.
    drawDigits(ctx, value);
  }

  cache.set(cacheKey, canvas);
  return canvas;
}

/** A solid white silhouette of a die, used for the hit flash. */
export function whiteSprite(type) {
  const cacheKey = 'white|' + type;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(dieSprite(type, 1), 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  cache.set(cacheKey, canvas);
  return canvas;
}

const iconURLs = new Map();

/** A data URL of a die, for shop cards and the inventory list. */
export function dieIconURL(type) {
  const cached = iconURLs.get(type);
  if (cached) return cached;

  // Show a face that reads well: five pips, or the die's top number. A die
  // that mirrors has no face of its own, so it is shown as it plays: blank.
  const def = DICE[type];
  const face = def.mirrors ? BLANK_FACE : (def.faces === 6 ? 5 : def.faces);
  const url = dieSprite(type, face).toDataURL();
  iconURLs.set(type, url);
  return url;
}
