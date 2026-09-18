/**
 * Checking contracts off, and remembering which ones are done.
 *
 * The catalog in data/achievements.js says what each one wants and when to look
 * at it; this is what looks. A run calls `checkContracts` at the four moments
 * that matter and gets back whatever was earned by doing so, which is usually
 * nothing — the common case is a handful of predicates over an object that is
 * already in memory, so it is called freely rather than carefully.
 *
 * Kept on this device, alongside the archive and for the same reason: it is a
 * record of what you have played, not a number anyone competes on, so it never
 * goes near the shared board.
 *
 * A run that has been edited by hand earns nothing. That is the same rule the
 * leaderboard uses and it is the same reasoning — a contract granted by typing
 * it into the console is not a contract, and the one person it would fool is
 * the one who typed it.
 */
import { readJSON, writeJSON } from '../core/storage.js';
import { ACHIEVEMENTS, ACHIEVEMENT_IDS, dueAt, Moment } from '../data/achievements.js';
import { artifactSlots } from './difficulty.js';
import { run } from './state.js';
import { DIFFICULTIES } from '../data/difficulty.js';
import { log } from '../ui/log.js';
import { toast } from '../ui/fx.js';
import { sfx } from '../audio/sfx.js';

const CONTRACTS_KEY = 'htd_contracts_v1';

/** When each earned contract was earned, as `{ [id]: epoch ms }`. */
const load = () => {
  const stored = readJSON(CONTRACTS_KEY, {});
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
};

export const earnedContracts = () => load();
export const isEarned = id => Object.hasOwn(load(), id);
export const earnedCount = () => ACHIEVEMENT_IDS.filter(isEarned).length;
export const contractTotal = () => ACHIEVEMENT_IDS.length;

/** How many rerolls this run's threat level hands out per node. */
const rerollsAllowed = () => (DIFFICULTIES[run.difficulty] || {}).rerolls || 0;

/**
 * What a contract gets to look at.
 *
 * Everything a predicate could want, gathered in one place rather than each
 * moment inventing its own shape — a contract moved from BREACH to SERVER
 * should not stop working because the field it read is only passed at one of
 * them.
 */
function contextFor(extra) {
  return {
    run,
    slots: artifactSlots(),
    rerollsLeft: run.rerolls,
    rerollsAllowed: rerollsAllowed(),
    enemy: run.enemy,
    total: 0,
    firstExecute: false,
    killed: false,
    wasBoss: false,
    ...extra,
  };
}

function award(id) {
  const earned = load();
  earned[id] = Date.now();
  writeJSON(CONTRACTS_KEY, earned);

  const { name, desc } = ACHIEVEMENTS[id];
  toast('CONTRACT: ' + name);
  log(`> contract complete — ${name}: ${desc}`, 'lime');
  // Not chord(): a breach plays one of those already, and a contract earned
  // on a breach would land underneath it.
  sfx.boot();
}

/**
 * Look at every contract due at this point, and bank the ones that are done.
 *
 * @param {string} moment one of data/achievements.js `Moment`
 * @param {object} extra  what this moment knows that the run does not
 * @returns {string[]} ids earned by this call, usually empty
 */
export function checkContracts(moment, extra = {}) {
  if (!run || run.cheated) return [];

  const context = contextFor(extra);
  const won = [];

  for (const id of dueAt(moment)) {
    if (isEarned(id)) continue;
    let done = false;
    try {
      done = !!ACHIEVEMENTS[id].test(context);
    } catch {
      // A contract that throws is a contract nobody earns, which is a far
      // better outcome than one that stops a run mid-execute.
      done = false;
    }
    if (done) {
      award(id);
      won.push(id);
    }
  }
  return won;
}

/** Every contract cleared, for the development console. */
export function grantAllContracts() {
  const earned = load();
  const now = Date.now();
  for (const id of ACHIEVEMENT_IDS) earned[id] = earned[id] || now;
  writeJSON(CONTRACTS_KEY, earned);
}

/** None of them, for the development console. */
export function forgetContracts() {
  writeJSON(CONTRACTS_KEY, {});
}

export { Moment };
