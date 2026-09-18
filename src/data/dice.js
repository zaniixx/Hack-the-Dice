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
 *   retriggers      scores a second time, paying every perDie artifact twice
 *   roll(die, cap, gameInt)  what it lands on, when 1–faces is not the answer
 *   noBits          scores no Bits at all — it is here for the Mult
 *   wearsOut        loses a face per node, and is gone when it runs out
 *   iconFace        the face to show in the market, for a die that cannot roll
 *                   every number up to its maximum
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
    // It never shows a roll of its own: it lands blank and then wears whatever
    // it is copying. See mirrorSource() below, and render/board-view.js.
    desc: 'Rolls blank. Scores the highest value among your other dice.',
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
  tesseract: {
    name: 'TESSERACT DIE',
    faces: 6, cut: 2, color: '#ff3df0',
    // +Mult is flat, and flat Mult multiplies everything the artifacts do after
    // it — so a pool of these compounds fast. VIRUS gives +3 at tier 1; this is
    // the tier-3 step up, and deliberately not a large one.
    cost: 20, tier: 3,
    desc: 'Rolls 1–6. Adds +4 Mult when it scores.',
    onScore: () => [mult(4)],
  },
  daemon: {
    name: 'DAEMON DIE',
    faces: 8, cut: 3, color: '#ff4d6d',
    cost: 26, tier: 3,
    desc: 'Rolls 1–8. A scoring 7 or 8 grants ×2.5 Mult.',
    lateMultiplier: die => (die.scoringValue >= 7 ? 2.5 : null),
  },

  // ---- Tier 4 -------------------------------------------------------------
  // Deep-server hardware. These are what a run past server 4 is shopping for:
  // the numbers are large enough to matter against a firewall curve that has
  // been accelerating since server 2.
  chrono: {
    name: 'CHRONO DIE',
    faces: 6, cut: 1, color: '#7dffb0',
    cost: 54, tier: 4,
    // Twice the Bits, and twice the payout from every perDie artifact in the
    // rig — which is where most of its cost is actually going.
    desc: 'Rolls 1–6. Scores twice.',
    retriggers: true,
  },
  nova: {
    name: 'NOVA DIE',
    faces: 6, cut: 1, color: '#ffe23d',
    // ×Mult dice stack multiplicatively, so the step from QUBIT's ×1.25 is
    // kept small: eight of these are already ×25 on their own.
    cost: 45, tier: 4,
    desc: 'Rolls 1–6. Grants ×1.5 Mult when it scores.',
    lateMultiplier: () => 1.5,
  },
  d50: {
    name: 'D50 PENTACONTA',
    faces: 50, cut: 6, color: '#3df2ff',
    cost: 48, tier: 4,
    desc: 'Rolls 1–50. Huge, and wildly unreliable.',
  },

  // ---- Found junk ---------------------------------------------------------
  // Things off a desk rather than out of a rig. They are cheap, they are
  // strange, and most of them are worse than the hardware they sit next to in
  // at least one way that matters — which is the point of buying them anyway.
  coin: {
    name: 'TOSSED COIN',
    faces: 6, cut: 3, color: '#ffc23d',
    cost: 6, tier: 1,
    // Same average as a D6 and none of the middle: half its rolls are a 6,
    // which is worth a great deal to OVERCLOCKER and nothing at all to
    // anything counting a straight.
    desc: 'Lands on 1 or 6. Nothing in between.',
    roll: (die, cap, gameInt) => (gameInt(1, 2) === 1 ? 1 : 6),
    iconFace: 6, // it has never rolled a five and should not advertise one
  },
  lego: {
    name: 'LEGO BRICK',
    faces: 4, cut: 1, color: '#ff4d6d',
    cost: 4, tier: 1,
    // The worst roll on the smallest die pays the most, which is exactly how
    // it works on a dark landing. One roll in four, so +6 averages out near
    // VIRUS's flat +3 — bought with the worst Bits on the board.
    desc: 'Rolls 1–4. Adds +6 Mult when it rolls a 1.',
    onScore: die => (die.scoringValue === 1 ? [mult(6)] : []),
  },
  battery: {
    name: 'AA BATTERY',
    faces: 10, cut: 2, color: '#b6ff3d',
    cost: 7, tier: 1,
    // Better than a D8 on the day you buy it and worthless ten nodes later.
    // Deliberately not a D12 for less money: it is a head start, not a rig.
    desc: 'Rolls 1–10, and loses a face every node. At zero it is spent.',
    wearsOut: true,
  },
  gum: {
    name: 'CHEWED GUM',
    faces: 6, cut: 1, color: '#ff3df0',
    cost: 10, tier: 2,
    // Rerolling it can only help, which makes it the one die on the board that
    // never punishes a reroll spent somewhere else — and worth nothing to a rig
    // that never rerolls, which is why it is not priced like a D12.
    desc: 'Rolls 1–6, and sticks: a reroll can only raise it.',
    roll: (die, cap, gameInt) => Math.max(die.value || 0, gameInt(1, cap)),
  },
  loaded: {
    name: 'LOADED DIE',
    faces: 6, cut: 1, color: '#ffe23d',
    cost: 12, tier: 2,
    // Nobody asks where you got it. Fewer Bits than a D12 that costs more, and
    // a floor that never once breaks KERNEL PANIC — the floor is the product.
    desc: 'Rolls 4, 5 or 6. Never anything else.',
    roll: (die, cap, gameInt) => gameInt(4, 6),
  },
  fuzzy: {
    name: 'FUZZY DICE',
    faces: 6, cut: 3, color: '#9a7bff',
    cost: 22, tier: 3,
    // They hang off a mirror. They were never for rolling. The value still
    // counts for pairs and straights — it simply never reaches the Bits.
    desc: 'Rolls 1–6 and scores no Bits. Adds +6 Mult when it scores.',
    noBits: true,
    onScore: () => [mult(6)],
  },
};

/**
 * The highest face a die of this type can currently show.
 *
 * Only worn-out dice care: an AA BATTERY at three nodes of wear is a d9, and at
 * twelve it is nothing at all. Everything else ignores `wear` entirely.
 */
export const faceCapFor = (type, wear = 0) => {
  const def = DICE[type];
  if (!def) return 0;
  return def.wearsOut ? Math.max(0, def.faces - wear) : def.faces;
};

/** The pool every run starts with. */
export const STARTING_DICE = ['d6', 'd6', 'd6', 'd6', 'd6'];

/** A die type id the catalog knows about, for validating saved runs. */
export const isKnownDie = type => Object.hasOwn(DICE, type);

/**
 * The die a MIRROR DIE copies: the highest of the dice that rolled a face of
 * their own.
 *
 * Two places need this and neither is above the other — the scoring rules, to
 * know what a mirror is worth, and the board, to draw the line from the die
 * being copied — so it lives with the dice themselves.
 *
 * @returns {?object} the die being copied, or null when there is none
 */
export function mirrorSource(dice) {
  const ordinary = dice.filter(die => !DICE[die.type].mirrors);
  if (!ordinary.length) return null;
  return ordinary.reduce((best, die) => (die.value > best.value ? die : best));
}
