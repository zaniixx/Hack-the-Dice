/**
 * The rules that decide what a board is worth, with no animation attached.
 *
 * Both the live preview and the execute pipeline go through here, so the
 * number the player is shown before committing can never disagree with the
 * number they get.
 */
import { DICE } from '../data/dice.js';
import { WATCHDOG_ABSORB_MAX } from '../data/rules.js';
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

/** AI WATCHDOG eats anything showing 3 or less. */
export const isAbsorbed = (die, enemy) =>
  enemy?.boss === 'watchdog' && die.scoringValue <= WATCHDOG_ABSORB_MAX;

/** Dice that will actually score against this enemy. */
export const eligibleDice = (dice, enemy) =>
  dice.filter(die => !die.quarantined && !isAbsorbed(die, enemy));

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
