/**
 * Applying a boss protocol.
 *
 * data/bosses.js says what each boss does; this is the one place that asks.
 * Every call is a no-op on an ordinary node, so the game flow reads the same
 * whether or not a boss is watching.
 */
import { BOSSES } from '../data/bosses.js';
import { dice } from '../engine/dice-board.js';
import { sfx } from '../audio/sfx.js';
import { log } from '../ui/log.js';
import { toast } from '../ui/fx.js';
import { run } from './state.js';

/** The boss guarding the current node, or null. */
export const activeBoss = () =>
  run && run.enemy && run.enemy.boss ? BOSSES[run.enemy.boss] : null;

/** The same shape abilities get, so boss hooks read like ability hooks. */
const context = () => ({
  run,
  enemy: run.enemy,
  dice,
  log,
  notify: toast,
  sfx,
});

/** The node has loaded: the boss may change the terms before anyone rolls. */
export function bossOnNodeStart() {
  activeBoss()?.onNodeStart?.(context());
}

/** The dice have settled, before the player gets to act on them. */
export function bossOnSettled() {
  activeBoss()?.onSettled?.(context());
}

/** Effects the boss adds at the end of an execute, after every artifact. */
export function bossMultipliers(tally) {
  return activeBoss()?.multiplier?.(tally, context()) || [];
}

/** The hit has landed and damage is recorded. */
export function bossAfterExecute() {
  activeBoss()?.afterExecute?.(context());
}

/**
 * A killing blow: the boss may refuse it.
 *
 * @returns {boolean} true when the firewall is still standing after all
 */
export function bossSurvivesBreach() {
  if (run.enemy.hp > 0) return false;
  return !!activeBoss()?.survivesBreach?.(context());
}
