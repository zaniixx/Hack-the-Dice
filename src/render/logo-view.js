/**
 * The title, corrupting itself.
 *
 * Drawn a pixel at a time onto a canvas, which is the whole reason this exists:
 * the old title was body text with a CSS glitch over it, and CSS can only ever
 * slide whole copies of the word about. Working on the pixel grid means a band
 * of the letters can tear sideways, a block can be punched out and refilled
 * with the wrong thing, and a letter can be replaced by something that is not
 * quite a letter.
 *
 * It is quiet most of the time. Corruption arrives in short bursts a second or
 * two apart, because something that glitches constantly stops reading as broken
 * and starts reading as a texture — and a title nobody can read is a failed
 * title however good the effect is.
 *
 * Nothing here is seeded. It is decoration, so it uses the cosmetic stream and
 * never touches the run's own.
 */
import { LOGO_GLYPHS, GLYPH_JUNK, GLYPH_HEIGHT, layoutLogo } from '../data/logo-font.js';
import { rand, randInt, pick } from '../core/random.js';

/**
 * Colours, in the order they are laid down: the two fringes either side, then
 * the ink over the top of both.
 *
 * Kept in one place and swappable so the wordmark can be recoloured without
 * touching the drawing, which is the only part of this worth arguing about.
 */
export const LOGO_PALETTES = {
  signal: { left: '#3df2ff', right: '#ff3df0', ink: '#ffffff' },
  terminal: { left: '#b6ff3d', right: '#3df2ff', ink: '#e8ffd6' },
  amber: { left: '#ffc23d', right: '#ff4d6d', ink: '#fff2d0' },
  violet: { left: '#9a7bff', right: '#3df2ff', ink: '#e6e2ff' },
  alarm: { left: '#ff4d6d', right: '#ffc23d', ink: '#ffffff' },
  ice: { left: '#3df2ff', right: '#9a7bff', ink: '#ffffff' },
};

const PALETTE_NAMES = Object.keys(LOGO_PALETTES);

/** One of them, at random. The title is a different colour every time you see it. */
export const randomPalette = () => LOGO_PALETTES[pick(PALETTE_NAMES)];

/**
 * How often a burst leaves the title a different colour than it found it.
 *
 * Low on purpose. The signal dropping onto another channel is a thing you
 * should catch happening once in a while, not a thing the title does every
 * couple of seconds — at that rate it stops being an event and starts being a
 * colour cycle.
 */
const RECOLOUR_CHANCE = 0.12;

let palette = LOGO_PALETTES.signal;

/** How far the colour fringes sit from the body of the letters, in pixels. */
const FRINGE = 1;

/**
 * A burst lasts this long, they arrive this far apart, and the damage is
 * rebuilt every STEP_MS while one is running.
 *
 * The step is the part that matters. A burst that picks one arrangement and
 * holds it for a fifth of a second reads as the title having been replaced by a
 * different title; rebuilding it every few frames reads as the signal breaking
 * up, which is the thing being drawn.
 */
const BURST_MS = [120, 340];
const STEP_MS = [40, 80];
const CALM_MS = [900, 2600];

/** The largest scale the wordmark is ever drawn at, in screen pixels per cell. */
const MAX_SCALE = 7;
const MIN_SCALE = 2;

let frame = null;
let canvas = null;
let ctx = null;
let layout = null;
let scale = 1;

/** What is wrong with the title right now. Rebuilt at the start of each burst. */
let damage = emptyDamage();
let nextChange = 0;
let burstEnds = 0;
let bursting = false;
/** Set when the caller would rather nothing moved. */
let still = false;

function emptyDamage() {
  return { tears: [], blocks: [], swaps: new Map(), dim: 0, shift: 0 };
}

const between = ([low, high]) => low + rand(0, 1) * (high - low);

/**
 * Decide what this burst does to the title.
 *
 * Each kind of damage is independent and most bursts only get one or two of
 * them, which is what keeps them from all looking the same.
 */
function corrupt() {
  const { width } = layout;
  const next = emptyDamage();

  // Horizontal tearing: bands of rows slid sideways.
  const tears = randInt(0, 2);
  for (let i = 0; i < tears; i++) {
    const top = randInt(0, GLYPH_HEIGHT - 2);
    next.tears.push({
      top,
      height: randInt(1, 3),
      offset: randInt(1, 4) * (rand(0, 1) < 0.5 ? -1 : 1),
    });
  }

  // Blocks punched out and filled with the wrong colour.
  const blocks = randInt(0, 3);
  for (let i = 0; i < blocks; i++) {
    next.blocks.push({
      x: randInt(0, Math.max(0, width - 4)),
      y: randInt(0, GLYPH_HEIGHT - 2),
      width: randInt(2, 9),
      height: randInt(1, 3),
      color: rand(0, 1) < 0.5 ? palette.left : palette.right,
    });
  }

  // A letter or two swapped for something that is nearly one.
  if (layout.cells.length && rand(0, 1) < 0.55) {
    const count = randInt(1, 2);
    for (let i = 0; i < count; i++) {
      next.swaps.set(randInt(0, layout.cells.length - 1), randInt(0, GLYPH_JUNK.length - 1));
    }
  }

  /*
   * The whole thing dips or jumps, occasionally.
   *
   * The dip is kept shallow on purpose. Taken far enough it stops reading as a
   * flicker in the signal and starts reading as the logo having simply turned
   * off, which is both less interesting and, for the two frames in seven it
   * used to happen on, unreadable.
   */
  next.dim = rand(0, 1) < 0.15 ? 0.22 + rand(0, 1) * 0.2 : 0;
  next.shift = rand(0, 1) < 0.3 ? randInt(1, 2) * (rand(0, 1) < 0.5 ? -1 : 1) : 0;

  return next;
}

/** The rows of a glyph, or of the junk standing in for it. */
function rowsFor(cell, index) {
  const swap = damage.swaps.get(index);
  if (swap !== undefined) return GLYPH_JUNK[swap];
  return LOGO_GLYPHS[cell.char] || GLYPH_JUNK[0];
}

/**
 * Paint the wordmark once, in one colour, at an offset.
 *
 * Called three times a frame — cyan left, magenta right, then the ink on top —
 * which is what gives the letters their split fringe without needing three
 * canvases or any blending.
 */
function paintPass(colour, dx, dy) {
  ctx.fillStyle = colour;
  layout.cells.forEach((cell, index) => {
    const rows = rowsFor(cell, index);
    for (let y = 0; y < rows.length; y++) {
      // A row inside a tear is drawn shifted; everything else sits still.
      let slide = 0;
      for (const tear of damage.tears) {
        if (y >= tear.top && y < tear.top + tear.height) slide = tear.offset;
      }
      const line = rows[y];
      for (let x = 0; x < line.length; x++) {
        if (line[x] !== '#') continue;
        ctx.fillRect(
          (cell.x + x + slide + dx + damage.shift) * scale,
          (y + dy) * scale,
          scale,
          scale,
        );
      }
    }
  });
}

function draw() {
  const { width } = layout;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Chromatic split first, so the white sits on top of both fringes.
  paintPass(palette.left, -FRINGE, 0);
  paintPass(palette.right, FRINGE, 0);
  paintPass(palette.ink, 0, 0);

  // Blocks of the wrong colour, punched over the top.
  for (const block of damage.blocks) {
    ctx.fillStyle = block.color;
    ctx.fillRect(block.x * scale, block.y * scale, block.width * scale, block.height * scale);
  }

  // Scanlines, at the pixel grid rather than the screen's, so they scale with
  // the rest of it instead of turning into moire.
  if (scale >= 3) {
    ctx.fillStyle = 'rgba(7,6,15,.35)';
    for (let y = 0; y < GLYPH_HEIGHT; y++) {
      ctx.fillRect(0, (y * scale) + scale - 1, width * scale, 1);
    }
  }

  if (damage.dim) {
    ctx.fillStyle = `rgba(7,6,15,${damage.dim})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function tick(now) {
  frame = requestAnimationFrame(tick);
  if (now < nextChange) return;

  if (!bursting) {
    // Quiet spell over: break up, and keep breaking up for a moment.
    bursting = true;
    burstEnds = now + between(BURST_MS);
    // Once in a while the signal comes back on a different channel.
    if (rand(0, 1) < RECOLOUR_CHANCE) palette = randomPalette();
    damage = corrupt();
    nextChange = now + between(STEP_MS);
  } else if (now >= burstEnds) {
    // Signal recovered.
    bursting = false;
    damage = emptyDamage();
    nextChange = now + between(CALM_MS);
  } else {
    // Mid-burst: a different fault, a few frames on from the last one.
    damage = corrupt();
    nextChange = now + between(STEP_MS);
  }
  draw();
}

/** Fit the canvas to the room it has, at a whole number of pixels per cell. */
function resize() {
  const room = canvas.parentElement?.clientWidth || canvas.clientWidth || 320;
  // Two cells of margin either side, so a tear never runs off the edge.
  const usable = Math.max(1, room - 8);
  const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.floor(usable / layout.width)));
  if (next === scale && canvas.width) return;

  scale = next;
  canvas.width = layout.width * scale;
  canvas.height = GLYPH_HEIGHT * scale;
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  ctx.imageSmoothingEnabled = false;
  draw();
}

/**
 * Start the title animating on `element`.
 *
 * Safe to call again on a new canvas — the start screen rebuilds its markup on
 * every view change, so the old one is gone and this is how the new one picks
 * the animation back up. Each of those is a fresh roll of the palette, so the
 * title is rarely the colour it was last time you looked at it.
 */
export function startLogo(element, { motion = true, colours = null } = {}) {
  stopLogo();
  if (!element) return;

  canvas = element;
  ctx = canvas.getContext('2d');
  layout = layoutLogo();
  // A fresh colour every time the title is put on screen, unless one is asked
  // for — the previews and the tests want to choose.
  palette = colours || randomPalette();
  still = !motion;
  scale = 0;
  resize();

  if (still) {
    // One frame of damage, held: enough to read as corrupted without anything
    // moving, for somebody who has asked for less motion.
    damage = corrupt();
    draw();
    return;
  }

  damage = emptyDamage();
  bursting = false;
  nextChange = 0;
  frame = requestAnimationFrame(tick);
  addEventListener('resize', resize);
}

export function stopLogo() {
  if (frame) cancelAnimationFrame(frame);
  removeEventListener('resize', resize);
  frame = null;
  canvas = null;
  ctx = null;
}

/** The wordmark's size in cells, for anything that needs to reserve room. */
export const logoSize = () => {
  const { width, height } = layoutLogo();
  return { width, height };
};
