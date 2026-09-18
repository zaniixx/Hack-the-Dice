/**
 * Player settings that outlive a run.
 *
 * Two kinds live here. Some change how the game plays out in front of you —
 * `speed` is a divisor on every scripted delay, so 4x is a genuine fast forward
 * of the scoring animation rather than a skip. The rest are about the machine
 * you are playing on: how big the console should be drawn, how loud it should
 * be, and whether the screen effects are worth their cost.
 *
 * Everything stored is put back through `sanitise` on the way in. A settings
 * blob is the one piece of saved state a player can open a console and edit,
 * and a scale of 40 or a volume of NaN should be a setting that did not take,
 * not a game that will not draw.
 */
import { clamp } from './math.js';
import { readJSON, writeJSON } from './storage.js';

const SETTINGS_KEY = 'htd_settings_v1';

/** Speeds the SPD button cycles through, in order. */
export const SPEEDS = [1, 2, 4];

/**
 * How far the interface can be scaled.
 *
 * Down to 70% because a small phone in landscape has to fit a whole console;
 * up to 150% because the pixel type is deliberately tiny and some screens — or
 * some eyes — need it not to be.
 */
export const SCALE_MIN = 0.7;
export const SCALE_MAX = 1.5;
export const SCALE_STEP = 0.05;

export const DEFAULTS = Object.freeze({
  muted: false,
  speed: 1,
  uiScale: 1,
  sfxVolume: 1,
  musicVolume: 0.8,
  effects: true,
  shake: true,
});

export const settings = { ...DEFAULTS };

/** A stored number, or the default when it is not one. */
const number = (value, low, high, fallback) =>
  (Number.isFinite(Number(value)) ? clamp(Number(value), low, high) : fallback);

/** A stored flag, treating "never set" as the default rather than as false. */
const flag = (value, fallback) => (value === undefined ? fallback : !!value);

function sanitise(stored) {
  return {
    muted: !!stored.muted,
    speed: SPEEDS.includes(stored.speed) ? stored.speed : DEFAULTS.speed,
    uiScale: number(stored.uiScale, SCALE_MIN, SCALE_MAX, DEFAULTS.uiScale),
    sfxVolume: number(stored.sfxVolume, 0, 1, DEFAULTS.sfxVolume),
    musicVolume: number(stored.musicVolume, 0, 1, DEFAULTS.musicVolume),
    effects: flag(stored.effects, DEFAULTS.effects),
    shake: flag(stored.shake, DEFAULTS.shake),
  };
}

Object.assign(settings, sanitise(readJSON(SETTINGS_KEY, {})));

export function saveSettings() {
  writeJSON(SETTINGS_KEY, settings);
}

/**
 * Change one setting and persist it.
 *
 * Everything goes through `sanitise`, so a caller cannot put a value in here
 * that reading it back would have refused.
 *
 * @returns {*} the value that was actually stored, which may not be the one asked for
 */
export function setSetting(key, value) {
  if (!(key in DEFAULTS)) return undefined;
  Object.assign(settings, sanitise({ ...settings, [key]: value }));
  saveSettings();
  return settings[key];
}

/** Everything back to how it arrives on a new device. */
export function resetSettings() {
  Object.assign(settings, DEFAULTS);
  saveSettings();
}

/** Advance to the next animation speed and persist it. */
export function cycleSpeed() {
  const next = (SPEEDS.indexOf(settings.speed) + 1) % SPEEDS.length;
  return setSetting('speed', SPEEDS[next]);
}

/** Flip mute and persist it. */
export function toggleMuted() {
  return setSetting('muted', !settings.muted);
}
