/**
 * Contracts: the things worth doing that the score does not ask for.
 *
 * Playing well means the same handful of moves every run — buy the biggest
 * multiplier, keep the pool small, never take a risk you were not paid for.
 * These are here to pull against that. Clearing a server with no artifacts
 * installed is a worse run than one with five, and that is the point: it is a
 * reason to build something other than the best build.
 *
 * Each one says when to look at it and what it is looking for. The test is a
 * plain function over a context the run hands it — no state of its own, nothing
 * imported from the game — so a contract can be read here and checked in a test
 * without a run existing at all. game/achievements.js is what calls them.
 */
import { MIN_DICE, MAX_DICE } from './rules.js';
import { EDITIONS } from './editions.js';

/**
 * The four points a contract can be checked at.
 *
 * EXECUTE fires once the payload has landed and the boss has had its say, so
 * `total` is final and `killed` is honest about a protocol that refused to die.
 * BREACH fires after the node is counted and the scrap is in. SERVER fires when
 * the run moves up, with `run.server` already the new one. RUN fires when it is
 * over, however it ended.
 */
export const Moment = {
  EXECUTE: 'execute',
  BREACH: 'breach',
  SERVER: 'server',
  RUN: 'run',
};

const EDITION_COUNT = Object.keys(EDITIONS).length;

/** How many different editions are installed right now. */
const editionsWorn = run => new Set(Object.values(run.editions || {}).filter(Boolean)).size;

export const ACHIEVEMENTS = {
  // ---- Getting going -------------------------------------------------------
  firstblood: {
    name: 'FIRST BLOOD',
    desc: 'Breach a node.',
    at: Moment.BREACH,
    test: () => true,
  },
  protocol: {
    name: 'PROTOCOL BROKEN',
    desc: 'Beat a boss protocol.',
    at: Moment.BREACH,
    test: ({ wasBoss }) => wasBoss,
  },

  // ---- Numbers -------------------------------------------------------------
  seven: {
    name: 'SEVEN FIGURES',
    desc: 'Land 1,000,000 hacking power in one Execute.',
    at: Moment.EXECUTE,
    test: ({ total }) => total >= 1e6,
  },
  ten: {
    name: 'TEN DIGITS',
    desc: 'Land 1,000,000,000 in one Execute.',
    at: Moment.EXECUTE,
    test: ({ total }) => total >= 1e9,
  },
  overkill: {
    name: 'OVERKILL',
    desc: 'Hit a firewall for ten times everything it had.',
    at: Moment.EXECUTE,
    secret: true,
    test: ({ total, enemy }) => enemy && total >= enemy.max * 10,
  },

  // ---- Playing it differently ---------------------------------------------
  oneshot: {
    name: 'ONE AND DONE',
    desc: 'Destroy a boss protocol with a single Execute.',
    at: Moment.EXECUTE,
    test: ({ killed, firstExecute, enemy }) => killed && firstExecute && !!(enemy && enemy.boss),
  },
  nonotes: {
    name: 'NO NOTES',
    desc: 'Breach a node without spending a reroll.',
    at: Moment.BREACH,
    test: ({ rerollsLeft, rerollsAllowed }) =>
      rerollsAllowed > 0 && rerollsLeft >= rerollsAllowed,
  },
  lastgasp: {
    name: 'LAST GASP',
    desc: 'Breach a node on your final Execute.',
    at: Moment.BREACH,
    test: ({ run }) => run.executes <= 0,
  },
  baremetal: {
    name: 'BARE METAL',
    desc: 'Clear a whole server with no cyberartifacts installed.',
    at: Moment.SERVER,
    test: ({ run }) => run.artifacts.length === 0,
  },
  threedice: {
    name: 'THREE IS ENOUGH',
    desc: `Reach server 3 carrying only ${MIN_DICE} dice.`,
    at: Moment.SERVER,
    test: ({ run }) => run.server >= 3 && run.dice.length <= MIN_DICE,
  },

  // ---- Collecting ----------------------------------------------------------
  fullrig: {
    name: 'EVERY SLOT',
    desc: 'Fill every cyberartifact slot you have.',
    at: Moment.BREACH,
    test: ({ run, slots }) => slots > 0 && run.artifacts.length >= slots,
  },
  fullset: {
    name: 'FULL SET',
    desc: 'Carry all four editions at once.',
    at: Moment.BREACH,
    test: ({ run }) => editionsWorn(run) >= EDITION_COUNT,
  },
  bigpool: {
    name: 'MAXED OUT',
    desc: `Carry the largest pool the rig takes — ${MAX_DICE} dice.`,
    at: Moment.BREACH,
    test: ({ run }) => run.dice.length >= MAX_DICE,
  },
  liquidity: {
    name: 'LIQUIDITY',
    desc: 'Hold 1,000 data scrap at once.',
    at: Moment.BREACH,
    test: ({ run }) => run.scrap >= 1000,
  },

  // ---- Knowing when to stop ------------------------------------------------
  cashedout: {
    name: 'CASHED OUT',
    desc: 'Walk away from a run with ten nodes breached, instead of being traced.',
    at: Moment.RUN,
    test: ({ run, reason }) => reason === 'abandoned' && run.stats.nodes >= 10,
  },

  // ---- Going deep ----------------------------------------------------------
  nomargin: {
    name: 'NO MARGIN',
    desc: 'Reach server 5 as a NATION STATE.',
    at: Moment.SERVER,
    test: ({ run }) => run.server >= 5 && run.difficulty === 'nation-state',
  },
  deeprun: {
    name: 'DEEP RUN',
    desc: 'Reach server 10.',
    at: Moment.SERVER,
    test: ({ run }) => run.server >= 10,
  },
  fullsweep: {
    name: 'FULL SWEEP',
    desc: 'Beat all eight boss protocols in a single run.',
    at: Moment.SERVER,
    test: ({ run }) => run.server > 8,
  },
};

export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENTS);

/** Contracts due to be looked at at this point in a run. */
export const dueAt = moment => ACHIEVEMENT_IDS.filter(id => ACHIEVEMENTS[id].at === moment);
