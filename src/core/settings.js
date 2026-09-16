/**
 * Player settings that outlive a run: animation speed and mute.
 *
 * `speed` is a divisor on every scripted delay, so 4x is a genuine fast
 * forward of the scoring animation rather than a skip.
 */
import { readJSON, writeJSON } from './storage.js';

const SETTINGS_KEY = 'htd_settings_v1';

/** Speeds the SPD button cycles through, in order. */
export const SPEEDS = [1, 2, 4];

export const settings = {
  muted: false,
  speed: 1,
};

Object.assign(settings, readJSON(SETTINGS_KEY, {}));

export function saveSettings() {
  writeJSON(SETTINGS_KEY, settings);
}

/** Advance to the next animation speed and persist it. */
export function cycleSpeed() {
  const next = (SPEEDS.indexOf(settings.speed) + 1) % SPEEDS.length;
  settings.speed = SPEEDS[next];
  saveSettings();
  return settings.speed;
}

/** Flip mute and persist it. */
export function toggleMuted() {
  settings.muted = !settings.muted;
  saveSettings();
  return settings.muted;
}
