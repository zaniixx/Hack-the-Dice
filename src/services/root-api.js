/**
 * The board's maintenance API, from this side.
 *
 * Taking a tournament off the board for everybody, or a result off a
 * leaderboard, is not something the game does — a player can only delete what
 * their own browser can prove it made. This is the other thing: the calls that
 * answer to whoever holds the board's key, for the times something needs to
 * come off it and there is nobody else to do it.
 *
 * The key is typed in and kept in this browser. It is deliberately not in the
 * source, because the source is served to every player: see worker/index.js,
 * which holds the other half and answers 404 to anyone without it.
 *
 * Nothing imports this at startup. It is reached from ui/root-shell.js, which
 * is itself only fetched on demand, so a normal session never loads either.
 */
import { API_BASE, API_TIMEOUT_MS } from './config.js';
import { knownTournamentIds, rememberTournament, forgetTournament } from './local-store.js';

/** Where the key is kept. Losing it costs nothing but typing it again. */
const KEY_STORAGE = 'htd_admin_key';

/** Everything this game keeps on a device starts with this. */
const DEVICE_PREFIX = 'htd_';

const read = key => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const write = (key, value) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // A browser refusing storage just means nothing is remembered between loads.
  }
};

export const adminKey = () => read(KEY_STORAGE);
export const setAdminKey = value => write(KEY_STORAGE, String(value || '').trim());

/**
 * One maintenance request.
 *
 * Answers are shaped rather than thrown, because every caller here is a button
 * that has to say what happened. The three outcomes that matter are told apart:
 * no key set, a key the board would not take, and a board that never answered.
 *
 * @returns {{ok: boolean, data: *, error: string}}
 */
async function call(path, { method = 'GET' } = {}) {
  const key = adminKey();
  if (!key) return { ok: false, data: null, error: 'no key on this device' };
  if (!API_BASE) return { ok: false, data: null, error: 'no board configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(API_BASE + '/api/admin' + path, {
      method,
      signal: controller.signal,
      headers: { 'X-Admin-Key': key },
    });
    const data = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data, error: '' };
    // The board hides a wrong key behind the same 404 as a wrong address, so
    // this cannot honestly claim to know which of the two it was.
    return {
      ok: false,
      data: null,
      error: response.status === 404
        ? 'key refused, or this board has no maintenance API'
        : (data && data.error) || 'board said ' + response.status,
    };
  } catch {
    return { ok: false, data: null, error: 'board unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

// ---- The board -------------------------------------------------------------

/** What is on the board, in counts. Also the way to test a key. */
export const boardPing = () => call('/ping');

/** Every tournament out there, with its board and lobby sizes. */
export const allTournaments = () => call('/tournaments');

/**
 * Re-apply the one-row-per-runner rule to everything already on the board.
 *
 * Only needed once, for rows banked before the board had that rule: after that
 * every result cleans up after itself as it lands.
 */
export const compactBoard = () => call('/compact', { method: 'POST' });

/** Drop index rows whose tournament has already expired out of storage. */
export const sweepExpired = () => call('/sweep', { method: 'POST' });

/** Take a tournament off the board for every device, host token or not. */
export async function wipeTournament(id) {
  const result = await call('/tournaments/' + encodeURIComponent(id), { method: 'DELETE' });
  // Only once it is actually gone: a device that forgot a tournament the board
  // still has would stop listing one that other people can still play.
  if (result.ok) forgetTournament(id);
  return result;
}

export const clearTournamentBoard = id =>
  call(`/tournaments/${encodeURIComponent(id)}/scores`, { method: 'DELETE' });

export const clearTournamentLobby = id =>
  call(`/tournaments/${encodeURIComponent(id)}/live`, { method: 'DELETE' });

export const dropTournamentScore = (id, entryId) =>
  call(`/tournaments/${encodeURIComponent(id)}/scores/${encodeURIComponent(entryId)}`,
    { method: 'DELETE' });

// ---- The leaderboard -------------------------------------------------------

/** One run off the global board. */
export const dropScore = entryId =>
  call('/scores/' + encodeURIComponent(entryId), { method: 'DELETE' });

/** The global board, emptied. */
export const clearScores = () => call('/scores', { method: 'DELETE' });

/**
 * Every result posted under one handle, wherever it was posted.
 *
 * Worth being clear about what this is: a handle is a label a player types, not
 * an account, so this sweeps a name off the boards and anyone else who happened
 * to use the same one goes with it. On a board that has never known who anybody
 * is, there is no more precise version of "delete this player's runs".
 */
export const purgeHandle = handle =>
  call('/handles/' + encodeURIComponent(String(handle).toUpperCase()), { method: 'DELETE' });

// ---- This device -----------------------------------------------------------

/**
 * Which board this browser is pointed at, and where that was decided.
 *
 * config.js reads the override once, at load, so changing it here cannot take
 * effect until the page is loaded again — the caller says so out loud.
 */
export const boardTarget = () => ({
  base: API_BASE,
  override: read('htd_api_base'),
});

export function setBoardTarget(value) {
  write('htd_api_base', String(value || '').trim().replace(/\/+$/, ''));
}

/** Everything this game has stored here, biggest first, so it can be pruned. */
export function deviceKeys() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (!name || !name.startsWith(DEVICE_PREFIX)) continue;
      keys.push({ name, size: (localStorage.getItem(name) || '').length });
    }
  } catch {
    return [];
  }
  return keys.sort((a, b) => b.size - a.size);
}

export const dropDeviceKey = name => write(name, '');

/** Make this device forget which tournaments it was let into, without deleting any. */
export function forgetAllTournaments() {
  const ids = knownTournamentIds();
  ids.forEach(forgetTournament);
  return ids.length;
}

export { knownTournamentIds, rememberTournament, forgetTournament };
