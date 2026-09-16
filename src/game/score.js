/**
 * Run scoring, for the leaderboards.
 *
 * Hacking power grows exponentially across servers, so it makes a terrible
 * score — one lucky build would dwarf every other entry forever. The score is
 * built from things that grow linearly instead: nodes breached, servers owned,
 * and scrap harvested. It stays in arcade range, and a deeper run always beats
 * a shallower one.
 */
import { difficultyOf } from '../data/difficulty.js';

export const POINTS_PER_NODE = 500;
export const POINTS_PER_SERVER = 2500;
export const POINTS_PER_SCRAP = 10;

/** The final score for a run, with the threat level's multiplier applied. */
export function runScore(run) {
  const base = run.stats.nodes * POINTS_PER_NODE
    + (run.server - 1) * POINTS_PER_SERVER
    + run.stats.scrap * POINTS_PER_SCRAP;
  return Math.round(base * difficultyOf(run.difficulty).scoreMultiplier);
}

/** Unique enough for a leaderboard, and short enough to sit inside a code. */
const newId = () =>
  Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

/**
 * A finished run as a leaderboard entry.
 *
 * Entries are self-contained: everything the board displays is on them, so a
 * result can be handed to another device as a code and still make sense there.
 */
export function runResult(run, { reason }) {
  return {
    id: newId(),
    handle: run.handle || 'ANON',
    score: runScore(run),
    difficulty: run.difficulty,
    server: run.server,
    node: run.node,
    nodes: run.stats.nodes,
    biggest: run.stats.biggest,
    damage: run.stats.dmg,
    scrap: run.stats.scrap,
    tournament: run.tournament ? run.tournament.id : null,
    reason, // 'traced' or 'abandoned'
    at: Date.now(),
  };
}
