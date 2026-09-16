/**
 * The seeded generator that decides what a run does.
 *
 * Two kinds of randomness live in this game and they must not share a stream:
 *
 *   this module   anything that changes the outcome — dice faces, shop offers,
 *                 node names, which die the ANTIVIRUS quarantines
 *   random.js     anything cosmetic — sparks, screen shake, glitches, noise
 *
 * Keeping them apart is what makes a seed mean something. Cosmetic randomness
 * is drawn on every frame and varies with frame rate, so if it shared this
 * stream two players on the same seed would diverge immediately.
 *
 * The generator is mulberry32: one 32-bit word of state, which is small enough
 * to drop into a save so a resumed run keeps rolling the same sequence.
 */

/** Crockford-style base32: no I, L, O or U, so codes cannot be misread. */
export const READABLE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Seeds are shown to players and typed back in, so keep them short. */
export const MAX_SEED_LENGTH = 12;

let state = 0;
let currentSeed = '';

/** Hash a seed string to a 32-bit state (cyrb53-style mixing). */
function hashSeed(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return (h1 ^ (h1 >>> 16)) >>> 0;
}

/** Normalise anything a player typed into the form the game stores. */
export const normaliseSeed = text =>
  String(text || '')
    .trim().toUpperCase()
    .replace(/\s+/g, '-')
    // Only characters a tournament code can carry, so a seed always round-trips.
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, MAX_SEED_LENGTH);

/** A fresh readable seed, for players who do not bring their own. */
export function randomSeed(length = 6) {
  let seed = '';
  for (let i = 0; i < length; i++) {
    seed += READABLE_ALPHABET[Math.floor(Math.random() * READABLE_ALPHABET.length)];
  }
  return seed;
}

/**
 * Start a run's stream.
 *
 * @param {string} seed  a player's seed, or blank for a fresh random one
 * @returns {string} the seed actually used, to show and to save
 */
export function seedRun(seed) {
  currentSeed = normaliseSeed(seed) || randomSeed();
  state = hashSeed(currentSeed);
  return currentSeed;
}

export const seedOf = () => currentSeed;

/** The generator state, for saving a run mid-stream. */
export const rngState = () => state;

/** Put a resumed run back exactly where its stream left off. */
export function restoreRng(seed, savedState) {
  currentSeed = normaliseSeed(seed);
  state = Number.isInteger(savedState) ? savedState >>> 0 : hashSeed(currentSeed);
}

/** Next float in [0, 1). */
export function gameFloat() {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Next integer in [min, max], both ends included. */
export const gameInt = (min, max) => Math.floor(gameFloat() * (max - min + 1)) + min;

/** A random element of `list`. */
export const gamePick = list => list[Math.floor(gameFloat() * list.length)];
