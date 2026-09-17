/**
 * What each key does, and how to put it somewhere else.
 *
 * Keys are stored as `event.code` — the physical position, not the character it
 * produces. That is the difference between a binding that means "the key left
 * of S" and one that means "the letter R": on an AZERTY keyboard the second
 * sends the player somewhere they did not ask to go. It is also why the screen
 * cannot simply print the stored value, and why keyLabel() exists.
 *
 * Rebinding swaps rather than clears. If ROLL is on Space and somebody puts
 * REROLL there, ROLL takes the key REROLL was using. Clearing would be simpler
 * and would quietly leave an action with no key at all, which is a state a
 * player would have to notice on their own, mid-run.
 */
import { readJSON, writeJSON } from './storage.js';

const BINDS_KEY = 'htd_keys_v1';

/**
 * Every action a key can sit on, in the order the settings screen lists them.
 *
 * The three abilities are separate actions rather than one "digit" rule,
 * because the point of rebinding is that they need not be digits.
 */
export const ACTIONS = {
  throw: {
    name: 'ROLL / EXECUTE',
    help: 'Throws the pool, then commits it once it has landed',
    key: 'Space',
  },
  reroll: { name: 'REROLL', help: 'Rerolls everything you have not locked', key: 'KeyR' },
  execute: { name: 'EXECUTE', help: 'Commits the board without rolling first', key: 'KeyE' },
  ability1: { name: 'ABILITY 1', help: 'The first ability in your rig', key: 'Digit1' },
  ability2: { name: 'ABILITY 2', help: 'The second', key: 'Digit2' },
  ability3: { name: 'ABILITY 3', help: 'The third', key: 'Digit3' },
  market: { name: 'BLACK MARKET', help: 'Opens and closes it between nodes', key: 'KeyM' },
  next: { name: 'BREACH NEXT NODE', help: 'Leaves the market for the next node', key: 'Enter' },
};

export const ACTION_IDS = Object.keys(ACTIONS);

/**
 * Keys the game will not take.
 *
 * Escape backs out of every overlay there is, including the screen you would be
 * rebinding from; Tab is how the keyboard moves between controls at all; the
 * rest belong to the browser and it will not give them up anyway.
 */
export const RESERVED = new Set(['Escape', 'Tab', 'F5', 'F11', 'F12']);

/** A key held to change another key, which on its own binds nothing. */
const MODIFIERS = new Set([
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
]);

export const isModifier = code => MODIFIERS.has(code);

export const DEFAULT_BINDS = Object.freeze(
  Object.fromEntries(ACTION_IDS.map(id => [id, ACTIONS[id].key])),
);

export const binds = { ...DEFAULT_BINDS };

/**
 * Whatever was stored, turned back into a usable set of bindings.
 *
 * The rebinder cannot produce two actions on one key, but a hand-edited store
 * can: the first action listed keeps it and the second falls back to its own
 * default, or to nothing if that is taken too. An action with no key is a
 * legitimate state — the screen shows it as a dash — and it is a far better
 * answer than two actions firing at once.
 */
function sanitise(stored) {
  const next = {};
  const used = new Set();

  for (const id of ACTION_IDS) {
    const asked = stored && typeof stored[id] === 'string' ? stored[id] : DEFAULT_BINDS[id];
    const wanted = asked && !RESERVED.has(asked) ? asked : DEFAULT_BINDS[id];
    const code = used.has(wanted) ? DEFAULT_BINDS[id] : wanted;

    next[id] = used.has(code) ? '' : code;
    if (next[id]) used.add(next[id]);
  }
  return next;
}

Object.assign(binds, sanitise(readJSON(BINDS_KEY, {})));

function save() {
  writeJSON(BINDS_KEY, binds);
}

/** Which action this key fires, or null when it fires nothing. */
export function actionFor(code) {
  if (!code) return null;
  return ACTION_IDS.find(id => binds[id] === code) || null;
}

/**
 * Put `action` on `code`.
 *
 * @returns {{ok: boolean, reason?: string, swapped?: string}} what happened, so
 *          the screen can say it. `swapped` names the action that gave the key up.
 */
export function bindKey(action, code) {
  if (!(action in ACTIONS) || !code) return { ok: false, reason: 'unknown' };
  if (RESERVED.has(code) || isModifier(code)) return { ok: false, reason: 'reserved' };
  if (binds[action] === code) return { ok: true };

  const taken = ACTION_IDS.find(id => id !== action && binds[id] === code);
  const previous = binds[action];

  binds[action] = code;
  if (taken) binds[taken] = previous;

  save();
  return { ok: true, swapped: taken || undefined };
}

/** Every key back where it started. */
export function resetBinds() {
  Object.assign(binds, DEFAULT_BINDS);
  save();
}

/** Codes whose label is not obvious from the code itself. */
const LABELS = {
  Space: 'SPACE',
  Enter: 'ENTER',
  NumpadEnter: 'NUM ENTER',
  Backspace: 'BKSP',
  CapsLock: 'CAPS',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: '\'',
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  PageUp: 'PG UP',
  PageDown: 'PG DN',
};

/** A key code as something to print on a button. */
export function keyLabel(code) {
  if (!code) return '—';
  if (LABELS[code]) return LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6).toUpperCase();
  return code.toUpperCase();
}

/** The key for one action, ready to print — for help text that names a key. */
export const labelFor = action => keyLabel(binds[action]);
