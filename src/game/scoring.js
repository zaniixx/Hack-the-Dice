/**
 * The rules that decide what a board is worth, with no animation attached.
 *
 * Both the live preview and the execute pipeline go through here, so the
 * number the player is shown before committing can never disagree with the
 * number they get.
 */
import { DICE, mirrorSource } from '../data/dice.js';
import { BOSSES } from '../data/bosses.js';
import { countPairs, longestStraight } from '../data/combos.js';

/**
 * Work out what each die will score with.
 *
 * Mirror dice copy the highest value among the non-mirror dice, so they are
 * resolved against the rest of the board rather than their own face — they do
 * not have one. `mirrorOf` records what each is copying right now, which is
 * what the board draws on it, and is null while there is nothing to copy.
 */
export function applyScoringValues(dice) {
  const source = mirrorSource(dice);
  const highest = source ? source.value : null;

  for (const die of dice) {
    if (!DICE[die.type].mirrors) {
      die.scoringValue = die.value;
      continue;
    }
    // With no ordinary die on the board there is nothing to copy, and it falls
    // back to the face it rolled — so that is what it shows.
    die.mirrorOf = highest === null ? die.value : highest;
    die.scoringValue = die.mirrorOf;
  }
}


const bossOf = enemy => (enemy && enemy.boss ? BOSSES[enemy.boss] : null);

/** A die the boss refuses to let score at all — AI WATCHDOG eats low ones. */
export const isAbsorbed = (die, enemy) => !!bossOf(enemy)?.absorbs?.(die);

/**
 * The dice a boss allows through at all.
 *
 * RATE LIMITER narrows this to your best three; most bosses leave it alone.
 * Both the preview and the execute ask for this, so what the player is shown
 * is what they get.
 */
export const allowedDice = (dice, enemy) => {
  const boss = bossOf(enemy);
  return new Set(boss?.scoringDice ? boss.scoringDice(dice) : dice);
};

/** Dice that will actually score against this enemy. */
export function eligibleDice(dice, enemy) {
  const allowed = allowedDice(dice, enemy);
  return dice.filter(die =>
    allowed.has(die) && !die.quarantined && !isAbsorbed(die, enemy));
}

/**
 * Whether a die pays its face value into the Bits on this roll.
 *
 * FUZZY DICE never do — they were only ever decorative — so theirs is a plain
 * flag. A LEGO BRICK decides per roll, paying nothing unless it came to rest
 * studs up, so `noBits` is allowed to be a question about this roll instead of
 * a fact about the die.
 *
 * Note what this does not touch: the die still has a value, and combos are
 * counted off values. A die that pays no Bits still pairs and still fills a
 * straight, which is the difference between an all-or-nothing die and a hole
 * in the pool.
 */
export function paysBits(def, die) {
  const silent = typeof def.noBits === 'function' ? def.noBits(die) : def.noBits;
  return !silent;
}

/**
 * Whether this die puts anything into the tally at all.
 *
 * Every perDie artifact is worded "for every die that scores", and until a LEGO
 * BRICK could land the wrong way up that meant the same as "every die", so
 * nothing had to decide what scoring meant. It does now: a brick that came to
 * rest studs down pays no Bits and no Mult, and an artifact paying out for it
 * would hand the cheapest die on the board most of a working die's value and
 * none of the risk its face is advertising.
 *
 * The line is contributing anything, not contributing Bits, which is what
 * leaves FUZZY DICE where they were. They have never paid Bits and were never
 * meant to; they pay their Mult every single time, so they have always scored.
 *
 * This reads `onScore` to answer the question, so `onScore` has to be a pure
 * function of the die — which it is for all four dice that define one, and
 * which the catalog's "every die is data" contract asks for anyway.
 */
export function contributes(def, die) {
  if (paysBits(def, die)) return true;
  if (def.onScore?.(die)?.length) return true;
  return !!def.lateMultiplier?.(die);
}

/** Readable labels for the combos on the board, shown above the dice. */
export function comboTags(values) {
  const tags = [];

  const pairs = countPairs(values);
  if (pairs) tags.push(pairs === 1 ? 'PAIR' : `${pairs} PAIRS`);

  const straight = longestStraight(values);
  if (straight >= 3) tags.push(`RUN OF ${straight}`);

  if (values.length && values.every(value => value >= 4)) tags.push('ALL 4+');

  return tags;
}
