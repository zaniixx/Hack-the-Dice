/**
 * Choosing the music for what is happening.
 *
 * The mapping is deliberately about tension rather than location: a boss node
 * with one execute left is danger, not boss music, because that is what the
 * player is feeling. audio/music.js handles the playing.
 */
import { setMood } from '../audio/music.js';
import { Phase } from './state.js';

/**
 * The mood a run should be playing right now.
 *
 * Pure, so it can be reasoned about (and tested) without any audio.
 */
export function moodFor(run) {
  if (!run) return 'menu';
  if (run.phase === Phase.OVER) return 'silence';
  if (run.phase === Phase.TITLE) return 'menu';
  if (run.phase === Phase.SHOP || run.phase === Phase.BREACH) return 'shop';
  if (run.phase === Phase.LEAK_WAIT || run.executes <= 1) return 'danger';
  if (run.enemy && run.enemy.boss) return 'boss';
  return 'node';
}

export function syncSoundtrack(run) {
  setMood(moodFor(run));
}
