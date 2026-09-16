/**
 * Delays used to pace the scoring animation.
 *
 * `sleep` is scaled by the player's speed setting and is what game flow should
 * use; `rawSleep` is wall-clock and is reserved for polling loops that must not
 * change duration when the player speeds up the animation.
 */
import { settings } from './settings.js';

export function rawSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function sleep(ms) {
  return rawSleep(ms / settings.speed);
}
