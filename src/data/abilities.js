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
import { MIN_DICE } from './rules.js';
import { gameInt } from '../core/game-random.js';

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

/**
 * Arm a ×Mult on the coming Execute.
 *
 * OVERDRIVE and SUDO are the same move at two prices, so they are the same
 * code: the run carries the multiplier and the name of whatever armed it, and
 * a bigger one always wins over a smaller one already in place.
 */
function arm({ run, log, notify }, multiplier, name) {
  if (run.overdrive >= multiplier) {
    notify(`${run.overdriveLabel} ALREADY ARMED`);
    return false;
  }
  run.overdrive = multiplier;
  run.overdriveLabel = name;
  log(`> ${name.toLowerCase()} armed: ×${multiplier} on execute`, 'mag');
}

/** A die picked without a preference, off the seeded stream. */
const anyOf = list => list[gameInt(0, list.length - 1)];

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
    use: ctx => arm(ctx, 2, 'OVERDRIVE'),
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

  // ---- Tier 3 -------------------------------------------------------------
  defrag: {
    name: 'DEFRAG', tier: 3, cost: 18, charges: 1, color: '#3df2ff',
    desc: '+3 to every unlocked die (up to its max face).',
    use({ dice, log, notify, popDie }) {
      let shifted = 0;
      for (const die of dice) {
        if (die.locked || die.value >= maxFace(die)) continue;
        setValue(die, Math.min(maxFace(die), die.value + 3), popDie);
        shifted++;
      }
      if (!shifted) {
        notify('NO DICE TO DEFRAG');
        return false;
      }
      log(`> defrag: +3 on ${shifted} dice`, 'cyan');
    },
  },
  forkbomb: {
    name: 'FORK BOMB', tier: 3, cost: 22, charges: 1, color: '#b6ff3d',
    desc: '+2 Executes on this node.',
    use({ run, log }) {
      run.executes += 2;
      run.maxExecutes = Math.max(run.maxExecutes, run.executes);
      log('> fork bomb: +2 executes', 'cyan');
    },
  },
  polymorph: {
    name: 'POLYMORPH', tier: 3, cost: 24, charges: 1, color: '#c9d1ff',
    desc: 'Every die copies the highest value on the board.',
    use({ dice, log, notify, popDie }) {
      if (!dice.length) return false;

      const highest = Math.max(...dice.map(die => die.value));
      // Each die is still bound by its own faces: a d6 cannot show a 12.
      const changed = dice.filter(die => Math.min(highest, maxFace(die)) > die.value);
      if (!changed.length) {
        notify('NOTHING TO POLYMORPH');
        return false;
      }
      for (const die of changed) setValue(die, Math.min(highest, maxFace(die)), popDie);
      log(`> polymorph: ${changed.length} dice rewritten to ${highest}`, 'mag');
    },
  },

  // ---- Tier 4 -------------------------------------------------------------
  sudo: {
    name: 'SUDO', tier: 4, cost: 36, charges: 1, color: '#ffe23d',
    desc: 'This Execute deals ×4 Hacking Power.',
    use: ctx => arm(ctx, 4, 'SUDO'),
  },
  kexploit: {
    name: 'KERNEL EXPLOIT', tier: 4, cost: 42, charges: 1, color: '#ff7a5a',
    desc: 'Every die shows its max face.',
    use({ dice, log, notify, popDie }) {
      const changed = dice.filter(die => die.value < maxFace(die));
      if (!changed.length) {
        notify('ALL DICE ARE MAXED');
        return false;
      }
      for (const die of changed) setValue(die, maxFace(die), popDie);
      log(`> kernel exploit: ${changed.length} dice forced to max`, 'mag');
    },
  },

  // ---- Found junk ---------------------------------------------------------
  // Not tools so much as things that have worked before. Cheap, and two of them
  // cost you something real.
  cartridge: {
    name: 'BLOW ON THE CARTRIDGE', tier: 1, cost: 4, charges: 1, color: '#7dffb0',
    desc: 'Reroll your lowest die. It works.',
    use({ dice, log, notify, popDie, run }) {
      const candidates = dice.filter(die => die.value < maxFace(die));
      if (!candidates.length) {
        notify('NOTHING TO BLOW ON');
        return false;
      }
      const die = lowest(candidates);
      // Straight off the seeded stream, so a seed still replays exactly.
      setValue(die, gameInt(1, maxFace(die)), popDie);
      log(`> blew on it: die is now ${die.value}`, 'cyan');
      return run && true;
    },
  },
  dumpster: {
    name: 'DUMPSTER DIVE', tier: 1, cost: 7, charges: 1, color: '#ffc23d',
    desc: 'Gain Data Scrap equal to the node you are on.',
    use({ run, log }) {
      const found = Math.max(1, run.node);
      run.scrap += found;
      log(`> dumpster dive: ${found} data scrap, and a sandwich`, 'amber');
    },
  },
  percussive: {
    name: 'PERCUSSIVE MAINTENANCE', tier: 2, cost: 8, charges: 1, color: '#ff7a5a',
    desc: 'Reroll every die, locks and all. One of them breaks for good.',
    use({ dice, run, log, notify }) {
      if (run.dice.length <= MIN_DICE) {
        notify('POOL TOO SMALL TO BREAK ONE');
        return false;
      }
      // The pool loses one; the board is rerolled by the caller in turn.js,
      // which is why this only has to say which die went.
      const goner = anyOf(run.dice);
      run.dice.splice(run.dice.indexOf(goner), 1);
      run.hitIt = true; // turn.js picks this up and rerolls everything
      log(`> you hit it. it helped. the ${DICE[goner].name.toLowerCase()} fell off`, 'red');
      return dice && true;
    },
  },
  reboot: {
    name: 'TURN IT OFF AND ON AGAIN', tier: 2, cost: 12, charges: 1, color: '#3df2ff',
    desc: 'Restores the firewall to full — and refills every Execute and reroll.',
    use({ run, log, notify }) {
      if (!run.enemy) {
        notify('NOTHING TO REBOOT');
        return false;
      }
      run.enemy.hp = run.enemy.max;
      run.executes = run.maxExecutes;
      run.rebooted = true; // turn.js refills the rerolls on the next roll
      log('> have you tried turning it off and on again', 'cyan');
    },
  },
};

export const isKnownAbility = id => Object.hasOwn(ABILITIES, id);
