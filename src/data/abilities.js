/**
 * The ability catalog — one-shot tools the player fires between the roll and
 * the execute.
 *
 * `use(ctx)` mutates the dice on the board or the run, and returns false to
 * cancel: a cancelled ability costs no charge, which is what makes "nothing to
 * clone" a warning rather than a wasted turn. `ctx` provides:
 *
 *   dice     the dice currently on the board
 *   run      the active run
 *   log      write a line to the console panel
 *   notify   flash a toast at the player
 *   popDie   make a die hop and sparkle after it has been changed
 */
import { DICE } from './dice.js';

/** Highest face a die can show. */
const maxFace = die => DICE[die.type].faces;

/** The die with the lowest current value among `candidates`. */
const lowest = candidates => candidates.reduce((a, b) => (b.value < a.value ? b : a));

/** Change a die's value and make it read as changed, on the board. */
function setValue(die, value, popDie) {
  die.value = value;
  die.shownValue = value;
  popDie(die);
}

export const ABILITIES = {
  bitshift: {
    name: 'BIT SHIFT', tier: 1, cost: 6, charges: 1, color: '#3df2ff',
    desc: '+1 to every unlocked die (up to its max face).',
    use({ dice, log, notify, popDie }) {
      let shifted = 0;
      for (const die of dice) {
        if (die.locked || die.value >= maxFace(die)) continue;
        setValue(die, die.value + 1, popDie);
        shifted++;
      }
      if (!shifted) {
        notify('NO DICE TO SHIFT');
        return false;
      }
      log(`> bit shift: +1 on ${shifted} dice`, 'cyan');
    },
  },
  ddos: {
    name: 'DDOS FLOOD', tier: 1, cost: 5, charges: 1, color: '#b6ff3d',
    desc: '+2 rerolls for this Execute.',
    use({ run, log }) {
      run.rerolls += 2;
      log('> ddos flood: +2 rerolls', 'cyan');
    },
  },
  exploit: {
    name: 'EXPLOIT', tier: 1, cost: 7, charges: 1, color: '#ffc23d',
    desc: 'Set your lowest die to its max face.',
    use({ dice, log, notify, popDie }) {
      const candidates = dice.filter(die => die.value < maxFace(die));
      if (!candidates.length) {
        notify('ALL DICE ARE MAXED');
        return false;
      }
      const die = lowest(candidates);
      setValue(die, maxFace(die), popDie);
      log(`> exploit: die forced to ${die.value}`, 'cyan');
    },
  },
  clone: {
    name: 'CLONE', tier: 2, cost: 9, charges: 1, color: '#c9d1ff',
    desc: 'Your lowest die copies your highest value (capped at its max).',
    use({ dice, log, notify, popDie }) {
      if (dice.length < 2) return false;

      const highest = Math.max(...dice.map(die => die.value));
      const gainFor = die => Math.min(highest, maxFace(die));
      const candidates = dice.filter(die => gainFor(die) > die.value);
      if (!candidates.length) {
        notify('NOTHING TO CLONE');
        return false;
      }
      const die = lowest(candidates);
      setValue(die, gainFor(die), popDie);
      log(`> clone: die copied to ${die.value}`, 'cyan');
    },
  },
  overdrive: {
    name: 'OVERDRIVE', tier: 2, cost: 11, charges: 1, color: '#ff3df0',
    desc: 'This Execute deals ×2 Hacking Power.',
    use({ run, log, notify }) {
      if (run.overdrive) {
        notify('OVERDRIVE ALREADY ARMED');
        return false;
      }
      run.overdrive = true;
      log('> overdrive armed: ×2 on execute', 'mag');
    },
  },
  rootkit: {
    name: 'ROOTKIT', tier: 2, cost: 12, charges: 1, color: '#ff4d6d',
    desc: '+1 Execute on this node.',
    use({ run, log }) {
      run.executes++;
      run.maxExecutes = Math.max(run.maxExecutes, run.executes);
      log('> rootkit installed: +1 execute', 'cyan');
    },
  },
};

export const isKnownAbility = id => Object.hasOwn(ABILITIES, id);
