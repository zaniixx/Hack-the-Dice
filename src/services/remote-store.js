/**
 * The shared board, over HTTP.
 *
 * Same async methods as local-store.js, because that was always the point of
 * making them async: the screens already await everything, so swapping the
 * backend underneath them changes nothing above.
 *
 * Two things stay local whatever this does. A profile — your handle, your last
 * threat level, whether you have seen the tutorial — is about this device, not
 * about the board, and putting it on a server would mean accounts. And every
 * board read falls back to the local one when the network is not there, so a
 * flaky connection degrades to the old behaviour instead of an empty screen.
 *
 * See services/config.js for the URL, and worker/ for what answers it.
 */
import { API_BASE, API_TIMEOUT_MS } from './config.js';
import { localStore, compareEntries } from './local-store.js';

/**
 * One request, with a timeout and no exceptions escaping.
 *
 * @returns {Promise<*>} the parsed body, or null if the board could not answer
 */
async function call(path, { method = 'GET', body = null } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(API_BASE + '/api' + path, {
      method,
      signal: controller.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    // Offline, blocked, slow, or misconfigured: all the same to a caller that
    // has a local board to fall back on.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The host's proof that a tournament is theirs.
 *
 * Kept next to the rest of the browser-local data because that is exactly what
 * it is: a token this device made up so nobody else can overwrite the
 * tournament it created.
 */
const SECRET_KEY = 'htd_host_secrets_v1';

function hostSecretFor(id) {
  let secrets = {};
  try {
    secrets = JSON.parse(localStorage.getItem(SECRET_KEY) || '{}');
  } catch {
    secrets = {};
  }
  if (!secrets[id]) {
    secrets[id] = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      localStorage.setItem(SECRET_KEY, JSON.stringify(secrets));
    } catch {
      // A browser refusing storage just means this device cannot prove it hosted
      // the tournament later. Everything else still works.
    }
  }
  return secrets[id];
}

export const remoteStore = {
  /** Where this store keeps things, for the UI to be honest about it. */
  scope: 'global',

  // ---- Profile: this device's own, never the board's -----------------------

  getProfile: (...args) => localStore.getProfile(...args),
  saveProfile: (...args) => localStore.saveProfile(...args),
  rememberHandle: (...args) => localStore.rememberHandle(...args),

  // ---- The global leaderboard ---------------------------------------------

  async listScores({ difficulty = null, limit = 100 } = {}) {
    const query = new URLSearchParams();
    if (difficulty) query.set('difficulty', difficulty);
    query.set('limit', String(limit));

    const board = await call('/scores?' + query);
    return board || localStore.listScores({ difficulty, limit });
  },

  /**
   * Bank a result.
   *
   * It is written locally either way, so a run played with the board
   * unreachable is still on this device's board and is not simply lost.
   */
  async addScore(entry) {
    await localStore.addScore(entry);
    await call('/scores', { method: 'POST', body: entry });
    return entry;
  },

  // ---- Runs in progress, for the tournament lobby --------------------------

  async listLiveRuns(tournamentId) {
    const rows = await call(`/tournaments/${encodeURIComponent(tournamentId)}/live`);
    return rows || localStore.listLiveRuns(tournamentId);
  },

  async setLiveRun(entry) {
    await call(`/live/${encodeURIComponent(entry.id)}`, { method: 'PUT', body: entry });
    return entry;
  },

  async clearLiveRun(id, tournamentId = '') {
    const query = tournamentId ? '?tournament=' + encodeURIComponent(tournamentId) : '';
    await call(`/live/${encodeURIComponent(id)}${query}`, { method: 'DELETE' });
    await localStore.clearLiveRun(id);
  },

  // ---- Tournaments ---------------------------------------------------------

  /**
   * Every tournament on the board, plus any this device knows about that the
   * board does not — one created while offline, or joined from a code.
   */
  async listTournaments() {
    const remote = await call('/tournaments');
    const local = await localStore.listTournaments();
    if (!remote) return local;

    const ids = new Set(remote.map(row => row.id));
    return [...remote, ...local.filter(row => !ids.has(row.id))]
      .sort((a, b) => (b.created || 0) - (a.created || 0));
  },

  /** The board's copy, or this device's if the board has never heard of it. */
  async getTournament(id) {
    const remote = await call('/tournaments/' + encodeURIComponent(id));
    return remote || localStore.getTournament(id);
  },

  async saveTournament(tournament) {
    await localStore.saveTournament(tournament);
    await call('/tournaments/' + encodeURIComponent(tournament.id), {
      method: 'PUT',
      body: { ...tournament, secret: hostSecretFor(tournament.id) },
    });
    return tournament;
  },

  async deleteTournament(id) {
    await localStore.deleteTournament(id);
    const secret = encodeURIComponent(hostSecretFor(id));
    await call(`/tournaments/${encodeURIComponent(id)}?secret=${secret}`, { method: 'DELETE' });
  },

  async listTournamentScores(id) {
    const board = await call(`/tournaments/${encodeURIComponent(id)}/scores`);
    return board || localStore.listTournamentScores(id);
  },

  /**
   * Add a result to a tournament board.
   *
   * @returns {boolean} false when this exact result was already there, which is
   *          how merging a result code twice stays harmless.
   */
  async addTournamentScore(id, entry) {
    const isNewLocally = await localStore.addTournamentScore(id, entry);
    const result = await call(`/tournaments/${encodeURIComponent(id)}/scores`, {
      method: 'POST',
      body: entry,
    });
    return result ? result.isNew : isNewLocally;
  },
};

export { compareEntries };
