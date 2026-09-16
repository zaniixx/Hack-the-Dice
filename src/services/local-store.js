/**
 * The browser-local store: profile, leaderboards and tournaments in
 * localStorage.
 *
 * Every method is async even though localStorage is not. That is deliberate:
 * it is the seam where a networked backend would slot in, and having the UI
 * already await these calls means adding one would not ripple through the
 * screens. See services/store.js.
 *
 * Scope of the data: this browser, on this device. Tournament *rules* travel
 * between devices inside the join code, and single results travel inside a
 * result code, but nothing syncs on its own.
 */
import { readJSON, writeJSON } from '../core/storage.js';

const PROFILE_KEY = 'htd_profile_v1';
const SCORES_KEY = 'htd_scores_v1';
const TOURNAMENTS_KEY = 'htd_tournaments_v1';
const TOURNAMENT_SCORES_KEY = 'htd_tournament_scores_v1';

/** Boards are trimmed to this, best first, so storage cannot grow forever. */
const MAX_BOARD_SIZE = 100;
/** Handles offered back to the player on the start screen. */
const MAX_RECENT_HANDLES = 6;

const EMPTY_PROFILE = { handle: '', difficulty: '', recentHandles: [] };

/**
 * Arcade ranking: score first, then how deep the run got, then the biggest
 * single hack as a tie-break.
 */
export function compareEntries(a, b) {
  return b.score - a.score
    || b.server - a.server
    || b.node - a.node
    || b.biggest - a.biggest;
}

const sortedBoard = entries => [...entries].sort(compareEntries).slice(0, MAX_BOARD_SIZE);

/** Drop any entry already on the board with the same id. */
const withoutDuplicate = (entries, id) => entries.filter(entry => entry.id !== id);

export const localStore = {
  /** Where this store keeps things, for the UI to be honest about it. */
  scope: 'device',

  async getProfile() {
    return { ...EMPTY_PROFILE, ...readJSON(PROFILE_KEY, {}) };
  },

  async saveProfile(profile) {
    writeJSON(PROFILE_KEY, profile);
    return profile;
  },

  /** Remember a handle so returning players do not have to retype it. */
  async rememberHandle(handle) {
    const profile = await this.getProfile();
    const recent = [handle, ...profile.recentHandles.filter(name => name !== handle)]
      .slice(0, MAX_RECENT_HANDLES);
    return this.saveProfile({ ...profile, handle, recentHandles: recent });
  },

  async listScores({ difficulty = null, limit = MAX_BOARD_SIZE } = {}) {
    const board = readJSON(SCORES_KEY, []);
    const filtered = difficulty ? board.filter(entry => entry.difficulty === difficulty) : board;
    return sortedBoard(filtered).slice(0, limit);
  },

  async addScore(entry) {
    const board = withoutDuplicate(readJSON(SCORES_KEY, []), entry.id);
    writeJSON(SCORES_KEY, sortedBoard([...board, entry]));
    return entry;
  },

  async listTournaments() {
    return Object.values(readJSON(TOURNAMENTS_KEY, {}))
      .sort((a, b) => (b.created || 0) - (a.created || 0));
  },

  async getTournament(id) {
    return readJSON(TOURNAMENTS_KEY, {})[id] || null;
  },

  async saveTournament(tournament) {
    const all = readJSON(TOURNAMENTS_KEY, {});
    all[tournament.id] = tournament;
    writeJSON(TOURNAMENTS_KEY, all);
    return tournament;
  },

  async deleteTournament(id) {
    const all = readJSON(TOURNAMENTS_KEY, {});
    delete all[id];
    writeJSON(TOURNAMENTS_KEY, all);

    const boards = readJSON(TOURNAMENT_SCORES_KEY, {});
    delete boards[id];
    writeJSON(TOURNAMENT_SCORES_KEY, boards);
  },

  async listTournamentScores(id) {
    return sortedBoard(readJSON(TOURNAMENT_SCORES_KEY, {})[id] || []);
  },

  /**
   * Add a result to a tournament board.
   *
   * @returns {boolean} false when this exact result was already there, which is
   *          how merging a result code twice stays harmless.
   */
  async addTournamentScore(id, entry) {
    const boards = readJSON(TOURNAMENT_SCORES_KEY, {});
    const board = boards[id] || [];
    const isNew = !board.some(existing => existing.id === entry.id);

    boards[id] = sortedBoard([...withoutDuplicate(board, entry.id), entry]);
    writeJSON(TOURNAMENT_SCORES_KEY, boards);
    return isNew;
  },
};
