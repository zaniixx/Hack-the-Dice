/**
 * The dice catalog.
 *
 * Every die is data. The scoring pipeline never checks a die's id: it asks the
 * definition for `onScore` effects, a `lateMultiplier`, or the `mirrors` flag,
 * so a new die can be added here without touching game logic.
 *
 *   faces           highest value the die can roll
 *   cut             corner bevel in pixels used by the sprite painter, which
 *                   is how a d20 reads as rounder than a d6
 *   color           body color of the sprite
 *   cost / tier     black market price, and the server tier it unlocks at
 *   onScore(die)    effects applied the moment the die scores
 *   lateMultiplier  ×Mult applied after flat bonuses, or null for none
 *   mirrors         scores the highest value among the other dice instead
 */
import { mult } from './effects.js';

export const DICE = {
  d6: {
    name: 'D6 STANDARD',
    faces: 6, cut: 1, color: '#3df2ff',
    cost: 4, tier: 1,
    desc: 'Rolls 1–6. Reliable.',
  },
  d8: {
    name: 'D8 OCTA',
    faces: 8, cut: 3, color: '#7dffb0',
    cost: 7, tier: 1,
    desc: 'Rolls 1–8.',
  },
  amp: {
    name: 'AMP DIE',
    faces: 6, cut: 1, color: '#ff3df0',
    cost: 9, tier: 1,
    desc: 'Rolls 1–6. A scoring 6 grants ×2 Mult.',
    lateMultiplier: die => (die.scoringValue === 6 ? 2 : null),
  },
  virus: {
    name: 'VIRUS DIE',
    faces: 6, cut: 1, color: '#b6ff3d',
    cost: 8, tier: 1,
    desc: 'Rolls 1–6. Adds +3 Mult when it scores.',
    onScore: () => [mult(3)],
  },
  d12: {
    name: 'D12 DODECA',
    faces: 12, cut: 4, color: '#ffc23d',
    cost: 13, tier: 2,
    desc: 'Rolls 1–12.',
  },
  mirror: {
    name: 'MIRROR DIE',
    faces: 6, cut: 1, color: '#c9d1ff',
    cost: 12, tier: 2,
    desc: 'Scores the highest value among your other dice.',
    mirrors: true,
  },
  d20: {
    name: 'D20 ICOSA',
    faces: 20, cut: 5, color: '#ff7a5a',
    cost: 22, tier: 3,
    desc: 'Rolls 1–20.',
  },
  qubit: {
    name: 'QUBIT DIE',
    faces: 6, cut: 1, color: '#9a7bff',
    cost: 20, tier: 3,
    desc: 'Rolls 1–6. Grants ×1.25 Mult when it scores.',
    lateMultiplier: () => 1.25,
  },
};

/** The pool every run starts with. */
export const STARTING_DICE = ['d6', 'd6', 'd6', 'd6', 'd6'];

/** A die type id the catalog knows about, for validating saved runs. */
export const isKnownDie = type => Object.hasOwn(DICE, type);
