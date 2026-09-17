/**
 * Leaderboard submission and lookup.
 *
 * A finished run goes onto the all-comers board, and onto its tournament's
 * board as well when it was played inside one. Both live in the store, so
 * swapping the store swaps where scores go.
 */
import { store, compareEntries } from '../services/store.js';
import { runResult } from './score.js';

/** Where `entry` sits on a board, 1-based, or null if it is not on it. */
export function rankOf(board, entry) {
  const index = board.findIndex(row => row.id === entry.id);
  return index === -1 ? null : index + 1;
}

/**
 * Record a finished run.
 *
 * A run marked `cheated` is scored and shown as usual but never written to a
 * board. The boards are shared between devices now, and one assembled rig would
 * sit at the top of them forever.
 *
 * @returns {{entry, rank, tournamentRank}} the entry and where it placed
 */
export async function submitRun(run, { reason }) {
  const entry = runResult(run, { reason });
  if (run.cheated) return { entry, rank: null, tournamentRank: null };

  await store.addScore(entry);
  const board = await store.listScores({ difficulty: entry.difficulty });
  const rank = rankOf(board, entry);

  let tournamentRank = null;
  if (entry.tournament) {
    await store.addTournamentScore(entry.tournament, entry);
    const tournamentBoard = await store.listTournamentScores(entry.tournament);
    tournamentRank = rankOf(tournamentBoard, entry);
  }

  return { entry, rank, tournamentRank };
}

/** Top entries, optionally for one threat level. */
export const topScores = options => store.listScores(options);

/** Top entries for one tournament. */
export const tournamentScores = id => store.listTournamentScores(id);

export { compareEntries };
