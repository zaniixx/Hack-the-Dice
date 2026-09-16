/**
 * Scoring effects.
 *
 * Artifacts and dice never touch the scoreboard directly: they return plain
 * effect objects, and the execute pipeline applies them one at a time so each
 * one can be animated on its way to the HUD.
 */

export const EffectType = Object.freeze({
  /** Flat addition to the Bits side of the equation. */
  BITS: 'bits',
  /** Flat addition to Mult. */
  MULT: 'mult',
  /** Multiplication of Mult — the big numbers come from here. */
  XMULT: 'xmult',
});

export const bits = (value, label) => ({ type: EffectType.BITS, value, label });
export const mult = (value, label) => ({ type: EffectType.MULT, value, label });
export const xMult = (value, label) => ({ type: EffectType.XMULT, value, label });
