/**
 * Artifact editions — the stamp a cyberartifact can come out of the market
 * wearing.
 *
 * An edition never changes what an artifact does. It is a rider bolted on top,
 * paid for once at purchase and carried for the rest of the run, which is what
 * makes a stamped tier-1 artifact worth a slot that a plain tier-3 one is not.
 *
 * Three of them pay into the execute alongside the artifact they sit on:
 *
 *   flat(ctx)   Bits and +Mult, applied in the flat bonus phase
 *   late(ctx)   ×Mult, applied in the multiplier phase after the flat ones
 *
 * NEGATIVE pays in space instead — `slots` widens the rig itself, which is
 * worth more than any number once slots are the thing a build runs out of.
 *
 *   priceScale  what the stamp does to the market price
 *   weight      how often the market reaches for this one
 */
import { bits, mult, xMult } from './effects.js';

export const EDITIONS = {
  encrypted: {
    name: 'ENCRYPTED', tag: 'ENC', color: '#3df2ff',
    desc: '+30 Bits on every Execute.',
    priceScale: 1.6, weight: 38,
    flat: () => [bits(30)],
  },
  overclocked: {
    name: 'OVERCLOCKED', tag: 'OVR', color: '#ff3df0',
    desc: '+4 Mult on every Execute.',
    priceScale: 2.1, weight: 27,
    flat: () => [mult(4)],
  },
  prismatic: {
    name: 'PRISMATIC', tag: 'PRI', color: '#9a7bff',
    desc: '×1.5 Mult on every Execute.',
    priceScale: 2.8, weight: 20,
    late: () => [xMult(1.5)],
  },
  negative: {
    name: 'NEGATIVE', tag: 'NEG', color: '#c9d1ff',
    desc: '+1 artifact slot while installed.',
    priceScale: 3.4, weight: 15,
    slots: 1,
  },
};

export const isKnownEdition = id => Object.hasOwn(EDITIONS, id);

/** Artifact slots an edition adds, and 0 for the ones that pay in numbers. */
export const slotsFrom = id => (EDITIONS[id] ? EDITIONS[id].slots || 0 : 0);

/**
 * How likely a market artifact is to carry a stamp.
 *
 * It climbs with the run: deep servers are where slots get tight and a plain
 * artifact stops being worth one, so that is where the market starts dealing
 * them out.
 */
export const EDITION_CHANCE_BASE = 0.12;
export const EDITION_CHANCE_PER_SERVER = 0.05;
export const EDITION_CHANCE_MAX = 0.42;

export const editionChance = server => Math.min(
  EDITION_CHANCE_MAX,
  EDITION_CHANCE_BASE + EDITION_CHANCE_PER_SERVER * (server - 1),
);
