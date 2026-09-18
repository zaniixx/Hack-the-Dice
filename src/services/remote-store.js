/**
 * The board, over HTTP. There is only one, and it is shared.
 *
 * Scores and tournaments are global: every device that opens the game is
 * looking at the same standings, because a leaderboard each browser keeps its
 * own copy of is not a leaderboard. There is deliberately no local fallback —
 * a board that quietly answered from this browser when the network was down
 * would show numbers nobody else can see and call them the board. When it
 * cannot be reached a read returns null, and the screen says so.
 *
 * Two things stay on the device, because neither is a result. A profile — your
 * handle, your last threat level, whether you have seen the tutorial — is a
 * preference, and putting it on a server would mean accounts. And the list of
 * tournaments this device knows about is what stops the tournament screen being
 * a directory of other people's games: the board holds them all, and you see
 * the ones you hosted or were given the code to.
 *
 * See services/config.js for the URL, and worker/ for what answers it.
 */
import { API_BASE, API_TIMEOUT_MS } from './config.js';
import {
  localStore, compareEntries, knownTournamentIds, rememberTournament, forgetTournament,
} from './local-store.js';
import { decodeTournament } from '../game/tournament.js';

/**
 * One request, with a timeout and no exceptions escaping.
 *
 * @returns {*} the parsed body, or null if the board could not answer
 */
async function call(path, { method = 'GET', body = null } = {}) {
  if (!API_BASE) return null; // no board configured: see services/config.js

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
    // has to tell the player the board is not there.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A board row, back into a whole tournament.
 *
 * The board keeps the join code and nothing else about the rules, because the
 * code already carries every one of them — the threat level, the fixed seed and
 * all four ban lists, packed into a string short enough to read out. Unpacking
 * it here is what makes a row off the board the same shape as the one that was
 * put on it; without this, `bans` is missing and anything that reads the rules
 * throws on it.
 *
 * A row whose code will not decode keeps what the board had, which is enough to
 * list and open it.
 */
function whole(row) {
  if (!row) return row;
  const decoded = decodeTournament(row.code);
  return decoded ? { ...decoded, created: row.created } : row;
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

  // ---- Preferences: this device's own, never the board's -------------------

  getProfile: (...args) => localStore.getProfile(...args),
  saveProfile: (...args) => localStore.saveProfile(...args),
  rememberHandle: (...args) => localStore.rememberHandle(...args),

  // ---- The leaderboard -----------------------------------------------------

  /** @returns {?Array} the board, or null when it cannot be reached. */
  async listScores({ difficulty = null, limit = 100, offset = 0 } = {}) {
    const query = new URLSearchParams();
    if (difficulty) query.set('difficulty', difficulty);
    query.set('limit', String(limit));
    if (offset) query.set('offset', String(offset));

    return call('/scores?' + query);
  },

  /** @returns {?object} the entry once the board has it, or null if it has not. */
  async addScore(entry) {
    const banked = await call('/scores', { method: 'POST', body: entry });
    return banked ? entry : null;
  },

  // ---- Runs in progress, for the tournament lobby --------------------------

  async listLiveRuns(tournamentId) {
    return call(`/tournaments/${encodeURIComponent(tournamentId)}/live`);
  },

  async setLiveRun(entry) {
    await call(`/live/${encodeURIComponent(entry.id)}`, { method: 'PUT', body: entry });
    return entry;
  },

  async clearLiveRun(id, tournamentId = '') {
    const query = tournamentId ? '?tournament=' + encodeURIComponent(tournamentId) : '';
    await call(`/live/${encodeURIComponent(id)}${query}`, { method: 'DELETE' });
  },

  // ---- Tournaments ---------------------------------------------------------

  /**
   * The tournaments this device has any business seeing.
   *
   * Every tournament lives on the shared board, but a list of all of them would
   * be a directory of games nobody here was invited to. So the board is
   * filtered to the ones this device hosted or was given the code to — scanning
   * a QR or typing an invite code is what adds one, and there is no other way.
   *
   * @returns {?Array} the list, or null when the board cannot be reached.
   */
  async listTournaments() {
    const board = await call('/tournaments');
    if (!board) return null;

    const known = new Set(knownTournamentIds());
    return board
      .filter(row => known.has(row.id))
      .map(whole)
      .sort((a, b) => (b.created || 0) - (a.created || 0));
  },

  /**
   * One tournament, by id.
   *
   * Not filtered by what this device knows: asking for a specific op code is
   * how someone joins, so knowing the code is the permission.
   */
  async getTournament(id) {
    return whole(await call('/tournaments/' + encodeURIComponent(id)));
  },

  /**
   * Put a tournament on the board, and record that this device knows it.
   *
   * Hosting one and joining one both land here, which is what makes the
   * tournament list exactly "mine, and the ones I was invited to".
   */
  async saveTournament(tournament) {
    rememberTournament(tournament.id);
    const saved = await call('/tournaments/' + encodeURIComponent(tournament.id), {
      method: 'PUT',
      body: { ...tournament, secret: hostSecretFor(tournament.id) },
    });
    return saved ? tournament : null;
  },

  async deleteTournament(id) {
    forgetTournament(id);
    const secret = encodeURIComponent(hostSecretFor(id));
    await call(`/tournaments/${encodeURIComponent(id)}?secret=${secret}`, { method: 'DELETE' });
  },

  async listTournamentScores(id) {
    return call(`/tournaments/${encodeURIComponent(id)}/scores`);
  },

  /**
   * Add a result to a tournament board.
   *
   * Merging one in also means this device now knows that tournament, so a host
   * handed a result code for a game they did not run can still see its board.
   *
   * @returns {boolean} false when this exact result was already there, which is
   *          how merging a result code twice stays harmless.
   */
  async addTournamentScore(id, entry) {
    rememberTournament(id);
    const result = await call(`/tournaments/${encodeURIComponent(id)}/scores`, {
      method: 'POST',
      body: entry,
    });
    return result ? result.isNew : false;
  },
};

export { compareEntries };
