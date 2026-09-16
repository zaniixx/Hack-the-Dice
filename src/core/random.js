/**
 * Randomness helpers. Everything visual (dice throws, sparks, glitches) and
 * everything mechanical (shop rolls, node names) goes through these, so the
 * whole game has exactly one source of randomness to swap out if it ever
 * needs to become seedable.
 */

/** Uniform float in [min, max). */
export function rand(min, max) {
  return Math.random() * (max - min) + min;
}

/** Uniform integer in [min, max], both ends included. */
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** A random element of `list`. */
export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
