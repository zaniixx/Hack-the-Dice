/**
 * The run: everything that is true about the current attempt.
 *
 * `run` is a live binding — import it and read `run.scrap` at call time, never
 * destructure it, because starting a new run replaces the object. Only this
 * module reassigns it.
 */
import { STARTING_DICE } from '../data/dice.js';
import { difficultyOf, DEFAULT_DIFFICULTY } from '../data/difficulty.js';

/**
 * Where the run is right now. The phase gates every input and most rendering.
 *
 *   TITLE      nothing started yet; the title modal is up
 *   READY      a node is loaded, waiting for the player to roll
 *   ROLLING    dice are in the air
 *   MANIP      dice have settled: lock, reroll, use abilities, execute
 *   SCORING    the execute animation is playing; input is locked out
 *   LEAK_WAIT  out of executes, waiting on MEMORY LEAK to finish draining
 *   BREACH     the firewall is down and the reward is being handed over
 *   SHOP       between nodes, in the black market
 *   OVER       traced; the run is finished
 */
export const Phase = Object.freeze({
  TITLE: 'title',
  READY: 'ready',
  ROLLING: 'rolling',
  MANIP: 'manip',
  SCORING: 'scoring',
  LEAK_WAIT: 'leakwait',
  BREACH: 'breach',
  SHOP: 'shop',
  OVER: 'over',
});

export let run = null;

/**
 * Start a blank run and make it current.
 *
 * @param {object} options
 * @param {string} options.handle      the runner's name, for the leaderboards
 * @param {string} options.difficulty  threat level id
 * @param {?object} options.tournament the tournament being played, if any
 * @param {string} options.seed        the seed this run's dice come from
 */
export function createRun({
  handle = '', difficulty = DEFAULT_DIFFICULTY, tournament = null, seed = '',
} = {}) {
  run = {
    // Who is playing, and under what rules
    handle,
    difficulty,
    seed,
    tournament: tournament
      ? { id: tournament.id, name: tournament.name, code: tournament.code }
      : null,

    // Progress
    server: 1,
    node: 1,
    scrap: difficultyOf(difficulty).startingScrap,
    phase: Phase.TITLE,

    // The rig
    dice: [...STARTING_DICE],
    artifacts: [],
    abilities: [],
    /** Per-artifact counters, for artifacts that grow over a run. */
    stacks: {},
    /** The edition each artifact was bought wearing, keyed by artifact id. */
    editions: {},

    // The current node
    enemy: null,
    executes: 0,
    maxExecutes: difficultyOf(difficulty).executes,
    rerolls: 0,
    /** Ability charges remaining on this node, keyed by ability id. */
    charges: {},
    firstExecute: true,
    /** xMult armed for the next Execute by an ability; 1 is none. */
    overdrive: 1,
    overdriveLabel: '',
    rolledOnce: false,

    // The black market
    shop: [],
    shopRefreshes: 0,

    // For the run-over screen and the leaderboards
    stats: { dmg: 0, nodes: 0, biggest: 0, scrap: 0 },
    /** Set when a run has been altered by hand; such a run is never banked. */
    cheated: false,
  };
  return run;
}

export const hasArtifact = id => !!run && run.artifacts.includes(id);

/** True while the game is mid-animation and must not take new input. */
export const isBusy = () =>
  [Phase.SCORING, Phase.BREACH, Phase.ROLLING, Phase.LEAK_WAIT].includes(run.phase);
