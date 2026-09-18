/**
 * Choosing the music for what is happening.
 *
 * Two answers come out of here and they do different jobs. The mood is about
 * where the player is — a market is a different piece of music from a boss —
 * and is deliberately about tension rather than location: a boss node with one
 * execute left is danger, not boss music, because that is what the player is
 * feeling.
 *
 * The intensity is about how that place is going. It is a single number the
 * arrangement in audio/music.js uses to decide how many layers to play, which
 * is what keeps a node from sounding identical at full executes and at its
 * last one. It moves continuously while the mood does not, so the music can
 * tighten under a fight without ever cutting to a different track.
 *
 * Both are pure, so they can be reasoned about (and tested) without any audio.
 */
import { setMood, setIntensity } from '../audio/music.js';
import { Phase } from './state.js';

/** The mood a run should be playing right now. */
export function moodFor(run) {
  if (!run) return 'menu';
  if (run.phase === Phase.OVER) return 'silence';
  if (run.phase === Phase.TITLE) return 'menu';
  if (run.phase === Phase.SHOP || run.phase === Phase.BREACH) return 'shop';
  if (run.phase === Phase.LEAK_WAIT || run.executes <= 1) return 'danger';
  if (run.enemy && run.enemy.boss) return 'boss';
  return 'node';
}

/**
 * How hard the music should be working, 0 to 1.
 *
 * Three things drive it, and they are the three things a player is actually
 * tracking during a node:
 *
 *   pressure  how few executes are left — the clock running out
 *   damage    how far into the firewall the run has got — closing in
 *   depth     which server it is, so the whole run tightens as it goes
 *
 * The floor of 0.58 is where the melody layer switches in, so an ordinary node
 * still has a tune over it; everything above that is the arrangement thickening
 * as the situation does. A boss gets a little extra on top, which is separate
 * from it also being a different mood.
 *
 * Between them a comfortable first node sits near 0.6 and a last execute
 * against a nearly-breached boss deep in the run runs past 0.9, which is the
 * whole audible range of the layer stack.
 */
export function intensityFor(run) {
  if (!run) return 0.3;
  if (run.phase === Phase.OVER) return 0;
  if (run.phase === Phase.TITLE) return 0.3;
  if (run.phase === Phase.SHOP || run.phase === Phase.BREACH) return 0.34;

  // maxExecutes is what the node started with; falling back to the current
  // count keeps a half-built run from reading as maximum pressure.
  const started = Math.max(1, run.maxExecutes || run.executes || 1);
  const pressure = 1 - Math.min(1, Math.max(0, run.executes || 0) / started);

  const enemy = run.enemy;
  const damage = enemy && enemy.max
    ? 1 - Math.min(1, Math.max(0, enemy.hp) / enemy.max)
    : 0;

  const depth = Math.min(1, ((run.server || 1) - 1) / 5);

  const level = 0.58
    + 0.20 * pressure
    + 0.14 * damage
    + 0.05 * depth
    + (enemy && enemy.boss ? 0.06 : 0);

  return Math.min(1, Math.max(0, level));
}

export function syncSoundtrack(run) {
  setMood(moodFor(run));
  setIntensity(intensityFor(run));
}
