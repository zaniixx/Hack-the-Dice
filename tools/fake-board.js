/**
 * An in-memory shared board, for the test pages.
 *
 * Boards are global now — there is no browser-local fallback — so a test that
 * touches a leaderboard or a tournament needs a board to touch. Standing up the
 * real Worker for every test run would be heavy, so this answers the same URLs
 * with the same rules: it implements worker/index.js closely enough that the
 * client is exercised over a real fetch, request shapes and all, rather than
 * being handed a stub store.
 *
 * Install it before importing anything that reads services/config.js, because
 * that module reads the board URL once, at load.
 */

/** The address the fake board answers on. Nothing actually listens there. */
export const FAKE_BOARD_URL = 'http://fake-board.test';

const MAX_BOARD_SIZE = 100;

/** Arcade ranking, as the Worker sorts it. */
const compare = (a, b) =>
  b.score - a.score || b.server - a.server || b.node - a.node || b.biggest - a.biggest;

const str = (value, max) => String(value ?? '').slice(0, max);
const num = value => (Number.isFinite(+value) ? Math.max(0, Math.floor(+value)) : 0);

/** The same retyping the Worker does, so the tests see what the board stores. */
const cleanEntry = entry => ({
  id: str(entry.id, 40),
  handle: str(entry.handle, 16).toUpperCase(),
  score: num(entry.score),
  difficulty: str(entry.difficulty, 24),
  server: num(entry.server),
  node: num(entry.node),
  nodes: num(entry.nodes),
  biggest: num(entry.biggest),
  damage: num(entry.damage),
  scrap: num(entry.scrap),
  tournament: entry.tournament ? str(entry.tournament, 8) : null,
  reason: entry.reason === 'abandoned' ? 'abandoned' : 'traced',
  at: num(entry.at) || Date.now(),
});

/**
 * The same shaping the Worker does to a tournament.
 *
 * This matters more than it looks: the Worker keeps the join code and throws
 * everything else away, `bans` included, because the code already carries the
 * whole rule set. A fake board that stored whatever it was sent would let a
 * client that expects `bans` on a board row pass here and break in production.
 */
const cleanTournament = t => ({
  id: str(t.id, 8).toUpperCase(),
  name: str(t.name, 40).toUpperCase(),
  host: str(t.host, 16).toUpperCase(),
  code: str(t.code, 200),
  difficulty: str(t.difficulty, 24),
  seed: str(t.seed, 12).toUpperCase(),
  created: num(t.created) || Date.now(),
  secret: str(t.secret, 64),
});

const merge = (board, entry) =>
  [...board.filter(row => row.id !== entry.id), entry].sort(compare).slice(0, MAX_BOARD_SIZE);

/**
 * Replace `fetch` with one that serves the board from memory.
 *
 * @returns {{reset: Function, restore: Function, state: object}}
 */
export function installFakeBoard() {
  const state = { scores: [], tournaments: new Map(), tournamentScores: new Map(), live: new Map() };
  const realFetch = globalThis.fetch.bind(globalThis);
  /** Flip this to make the board unreachable, as a dead network would. */
  let offline = false;

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  function route(url, method, body) {
    const parts = url.pathname.split('/').filter(Boolean).slice(1);
    const id = (parts[1] || '').toUpperCase();

    if (parts[0] === 'health') return json({ ok: true, scope: 'global' });

    if (parts[0] === 'scores' && parts.length === 1) {
      if (method === 'GET') {
        const difficulty = url.searchParams.get('difficulty');
        const limit = num(url.searchParams.get('limit')) || MAX_BOARD_SIZE;
        const board = difficulty
          ? state.scores.filter(row => row.difficulty === difficulty)
          : state.scores;
        return json(board.slice(0, limit));
      }
      if (method === 'POST') {
        const entry = cleanEntry(body);
        if (!entry.id || !entry.handle) return json({ error: 'bad entry' }, 400);
        state.scores = merge(state.scores, entry);
        return json(entry, 201);
      }
    }

    if (parts[0] === 'live' && parts.length === 2) {
      if (method === 'PUT') {
        // As the Worker does: the endpoint decides the run is live, not the body.
        const entry = { ...cleanEntry(body), live: true };
        state.live.set(entry.tournament + ':' + parts[1], entry);
        return json(entry);
      }
      if (method === 'DELETE') {
        const tournament = url.searchParams.get('tournament') || '';
        state.live.delete(tournament + ':' + parts[1]);
        return json({ ok: true });
      }
    }

    if (parts[0] === 'tournaments') {
      if (parts.length === 1 && method === 'GET') {
        return json([...state.tournaments.values()].map(({ secret, ...rest }) => rest));
      }
      if (parts.length === 2) {
        if (method === 'GET') {
          const stored = state.tournaments.get(id);
          if (!stored) return json({ error: 'no such tournament' }, 404);
          const { secret, ...rest } = stored;
          return json(rest);
        }
        if (method === 'PUT') {
          const existing = state.tournaments.get(id);
          if (existing && existing.secret && existing.secret !== body.secret) {
            return json({ error: 'not yours' }, 403);
          }
          state.tournaments.set(id, cleanTournament({ ...body, id }));
          const { secret, ...rest } = state.tournaments.get(id);
          return json(rest);
        }
        if (method === 'DELETE') {
          const stored = state.tournaments.get(id);
          const secret = url.searchParams.get('secret') || '';
          if (stored && stored.secret && stored.secret !== secret) {
            return json({ error: 'not yours' }, 403);
          }
          state.tournaments.delete(id);
          state.tournamentScores.delete(id);
          return json({ ok: true });
        }
      }
      if (parts.length === 3 && parts[2] === 'scores') {
        if (method === 'GET') return json(state.tournamentScores.get(id) || []);
        if (method === 'POST') {
          const entry = cleanEntry({ ...body, tournament: id });
          const board = state.tournamentScores.get(id) || [];
          const isNew = !board.some(row => row.id === entry.id);
          state.tournamentScores.set(id, merge(board, entry));
          return json({ entry, isNew }, isNew ? 201 : 200);
        }
      }
      if (parts.length === 3 && parts[2] === 'live' && method === 'GET') {
        return json([...state.live.entries()]
          .filter(([key]) => key.startsWith(id + ':'))
          .map(([, row]) => row)
          .sort(compare));
      }
    }

    return json({ error: 'no such endpoint' }, 404);
  }

  globalThis.fetch = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input.url;
    if (!href.startsWith(FAKE_BOARD_URL)) return realFetch(input, init);
    if (offline) throw new TypeError('Failed to fetch');

    const url = new URL(href);
    const body = init.body ? JSON.parse(init.body) : null;
    return route(url, (init.method || 'GET').toUpperCase(), body);
  };

  return {
    state,
    /** Take the board down, or bring it back, without touching the game. */
    setOffline(value) {
      offline = !!value;
    },
    reset() {
      state.scores = [];
      state.tournaments.clear();
      state.tournamentScores.clear();
      state.live.clear();
    },
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}
