/**
 * Persistence: one saved run, plus a personal best that outlives it.
 *
 * The save is deliberately partial. It records the rig and where the run had
 * got to, never the state of a node in progress, so reloading mid-node restarts
 * that node rather than letting a bad roll be rerolled by refreshing.
 */
import { readJSON, writeJSON, removeKey } from '../core/storage.js';
import { rngState } from '../core/game-random.js';
import { run, Phase } from './state.js';

const SAVE_KEY = 'htd_save_v1';
const BEST_KEY = 'htd_best_v1';
const SAVE_VERSION = 1;

export function saveRun() {
  if (!run || run.phase === Phase.OVER || run.phase === Phase.TITLE) return;
  writeJSON(SAVE_KEY, {
    v: SAVE_VERSION,
    // Who is playing and under what rules. Absent in saves from before
    // threat levels existed, which is why resuming defaults them.
    handle: run.handle,
    difficulty: run.difficulty,
    tournament: run.tournament,
    // The seed and where its stream had got to, so a resumed run keeps rolling
    // the same sequence instead of starting the seed over.
    seed: run.seed,
    rng: rngState(),
    server: run.server,
    node: run.node,
    scrap: run.scrap,
    dice: run.dice,
    artifacts: run.artifacts,
    abilities: run.abilities,
    stacks: run.stacks,
    editions: run.editions,
    stats: run.stats,
    cheated: run.cheated,
    // Resume into the market if that is where the player was, else at the node.
    at: run.phase === Phase.SHOP ? 'shop' : 'node',
    shop: run.shop,
  });
}

/** The saved run, or null when there is nothing usable to resume. */
export function loadSavedRun() {
  const saved = readJSON(SAVE_KEY);
  const usable = saved && saved.v === SAVE_VERSION && Array.isArray(saved.dice);
  return usable ? saved : null;
}

export function clearSavedRun() {
  removeKey(SAVE_KEY);
}

export function loadBest() {
  return readJSON(BEST_KEY);
}

/**
 * Fold this run into the personal best. Progress is compared as a single
 * number so server 2 node 1 beats server 1 node 5.
 *
 * @returns {boolean} true if the run set a new furthest point
 */
export function recordBest() {
  const best = loadBest() || { server: 0, node: 0, biggest: 0 };
  const progress = run.server * 10 + run.node;
  const bestProgress = best.server * 10 + best.node;
  const improved = progress > bestProgress;

  writeJSON(BEST_KEY, {
    server: improved ? run.server : best.server,
    node: improved ? run.node : best.node,
    biggest: Math.max(best.biggest || 0, run.stats.biggest),
  });
  return improved;
}
