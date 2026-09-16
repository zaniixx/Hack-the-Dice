/**
 * The rules that decide what a board is worth, with no animation attached.
 *
 * Both the live preview and the execute pipeline go through here, so the
 * number the player is shown before committing can never disagree with the
 * number they get.
 */
import { DICE } from '../data/dice.js';
import { BOSSES } from '../data/bosses.js';
import { countPairs, longestStraight } from '../data/combos.js';

/**
 * Work out what each die will score with.
 *
 * Mirror dice copy the highest value among the non-mirror dice, so they are
 * resolved against the rest of the board rather than their own face.
 */
export function applyScoringValues(dice) {
  const ordinaryValues = dice.filter(die => !DICE[die.type].mirrors).map(die => die.value);
  const highest = ordinaryValues.length ? Math.max(...ordinaryValues) : null;

  for (const die of dice) {
    die.scoringValue = DICE[die.type].mirrors && highest !== null ? highest : die.value;
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
