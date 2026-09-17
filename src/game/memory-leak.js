/**
 * MEMORY LEAK: damage over time after every execute.
 *
 * The leak ticks on the animation frame rather than the game loop, so it keeps
 * draining while the player thinks. It may only land the killing blow when the
 * game is idle — during a scoring animation it stops at 1 HP, so a breach never
 * interrupts an execute that is still playing out.
 */
import { fmt } from '../core/format.js';
import { MEMORY_LEAK_MS } from '../data/rules.js';
import { log } from '../ui/log.js';
import { floatText, centerOf } from '../ui/fx.js';
import { updateFirewall } from '../ui/hud.js';
import { els } from '../ui/dom.js';
import { run, Phase } from './state.js';

/** Damage popups are batched to at most one every this many milliseconds. */
const POPUP_INTERVAL_MS = 450;

/** Phases in which the leak drains at all, and in which it may kill. */
const DRAINS_IN = [Phase.READY, Phase.MANIP, Phase.ROLLING, Phase.SCORING, Phase.LEAK_WAIT];
const MAY_KILL_IN = [Phase.READY, Phase.MANIP, Phase.LEAK_WAIT];

const leak = {
  damagePerSecond: 0,
  until: 0,
  /** Fractional damage carried between frames, so slow leaks still land. */
  carry: 0,
  /** Damage waiting to be shown in the next popup. */
  pending: 0,
  lastPopup: 0,
};

const IDLE = { firewallDown: false };

export function startLeak(damagePerSecond) {
  leak.damagePerSecond = damagePerSecond;
  leak.until = performance.now() + MEMORY_LEAK_MS;
  leak.carry = 0;
}

export function stopLeak() {
  leak.until = 0;
}

export function resetLeak() {
  leak.damagePerSecond = 0;
  leak.until = 0;
  leak.carry = 0;
  leak.pending = 0;
}

export const isLeakDraining = () => leak.until > performance.now();

/**
 * Drain the firewall for one frame.
 *
 * @returns {{firewallDown: boolean}} whether the leak just finished the node
 */
export function tickMemoryLeak(dt) {
  if (!run || !run.enemy || run.enemy.hp <= 0) return IDLE;

  const now = performance.now();
  if (leak.until <= now || leak.damagePerSecond <= 0) return IDLE;
  if (!DRAINS_IN.includes(run.phase)) return IDLE;

  leak.carry += leak.damagePerSecond * dt;
  if (leak.carry < 1) return IDLE;
  const damage = Math.floor(leak.carry);
  leak.carry -= damage;

  const mayKill = MAY_KILL_IN.includes(run.phase);
  const before = run.enemy.hp;
  run.enemy.hp = Math.max(mayKill ? 0 : 1, before - damage);
  const dealt = before - run.enemy.hp;
  if (dealt <= 0) return IDLE;

  run.stats.dmg += dealt;
  leak.pending += dealt;
  // Draining: the bar follows the damage rather than animating towards it.
  updateFirewall({ draining: true });

  if (now - leak.lastPopup > POPUP_INTERVAL_MS) {
    floatText('-' + fmt(leak.pending), centerOf(els.firewallBar), 'c-lime small', 700);
    leak.pending = 0;
    leak.lastPopup = now;
  }

  if (run.enemy.hp <= 0 && mayKill) {
    log('> memory leak collapsed the firewall', 'lime');
    return { firewallDown: true };
  }
  return IDLE;
}
