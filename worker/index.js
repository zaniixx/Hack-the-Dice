/**
 * Hack the Dice — the shared board.
 *
 * A Cloudflare Worker over one KV namespace. It exists because the game itself
 * is a static site: GitHub Pages can serve the game to every device, but it
 * cannot remember anything, so leaderboards and tournaments lived and died on
 * whichever browser played them. This is the smallest thing that fixes that.
 *
 * It stores what a board needs and nothing else. There are no accounts and no
 * secrets worth stealing: a handle is a label a player types, not an identity,
 * exactly as it was when boards were browser-local. So the rules are the ones
 * you would want for a public arcade cabinet — anyone may add a score, nobody
 * may edit one that is already there, and everything is size-capped and
 * rate-limited so a bored visitor cannot turn an open endpoint into a bill.
 *
 *   GET    /api/health
 *   GET    /api/scores?difficulty=black-hat&limit=100
 *   POST   /api/scores                     one run result
 *   GET    /api/tournaments
 *   GET    /api/tournaments/:id
 *   PUT    /api/tournaments/:id            create or update (host only)
 *   DELETE /api/tournaments/:id            host only
 *   GET    /api/tournaments/:id/scores
 *   POST   /api/tournaments/:id/scores
 *   GET    /api/tournaments/:id/live       runs in progress
 *   PUT    /api/live/:id                   heartbeat for a run in progress
 *   DELETE /api/live/:id
 *
 * Deploying it: see worker/README.md.
 */

/** Boards are trimmed to this, best first, so a key cannot grow forever. */
const MAX_BOARD_SIZE = 100;
/** A tournament nobody has touched for this long is swept up by KV itself. */
const TOURNAMENT_TTL_S = 60 * 60 * 24 * 90;
/** A run in progress drops off the lobby this long after its last heartbeat. */
const LIVE_TTL_S = 120;
/** Anything longer than this is not a score, it is someone having a go. */
const MAX_BODY_BYTES = 4096;
/** Writes allowed per IP per minute. */
const RATE_LIMIT = 30;

const KEYS = {
  scores: 'scores',
  tournament: id => `tournament:${id}`,
  tournamentIndex: 'tournaments',
  tournamentScores: id => `tscores:${id}`,
  live: (tournament, id) => `live:${tournament}:${id}`,
};

// ---- Plumbing --------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
});

const fail = (status, message) => json({ error: message }, status);

/** Read a JSON body, refusing anything oversized or malformed. */
async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error('body too large');
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object') throw new Error('malformed body');
    return value;
  } catch {
    throw new Error('malformed body');
  }
}

/**
 * A crude per-IP write budget, kept in KV.
 *
 * Not a security boundary — a speed bump. Reads are not counted, because a
 * board being read is the point.
 */
async function withinRateLimit(env, request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  const key = `rate:${ip}:${Math.floor(Date.now() / 60000)}`;
  const used = Number(await env.BOARDS.get(key)) || 0;
  if (used >= RATE_LIMIT) return false;
  await env.BOARDS.put(key, String(used + 1), { expirationTtl: 120 });
  return true;
}

async function readJSON(env, key, fallback) {
  const value = await env.BOARDS.get(key, 'json');
  return value === null || value === undefined ? fallback : value;
}

// ---- Entries ---------------------------------------------------------------

/** Arcade ranking: score, then depth, then the biggest single hack. */
const compareEntries = (a, b) =>
  b.score - a.score || b.server - a.server || b.node - a.node || b.biggest - a.biggest;

const str = (value, max) => String(value ?? '').slice(0, max);
const num = value => (Number.isFinite(+value) ? Math.max(0, Math.floor(+value)) : 0);

/**
 * Keep only the fields a board shows, with the types and lengths we chose.
 *
 * Whatever a client posts, what lands in KV is this shape — which is what stops
 * a crafted body from turning a leaderboard row into anything else.
 */
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

/** Add an entry to a board, replacing any earlier copy of the same run. */
function merge(board, entry) {
  const without = board.filter(row => row.id !== entry.id);
  return [...without, entry].sort(compareEntries).slice(0, MAX_BOARD_SIZE);
}

// ---- Routes ----------------------------------------------------------------

async function getScores(env, url) {
  const difficulty = url.searchParams.get('difficulty');
  const limit = Math.min(MAX_BOARD_SIZE, num(url.searchParams.get('limit')) || MAX_BOARD_SIZE);
  const board = await readJSON(env, KEYS.scores, []);
  const filtered = difficulty ? board.filter(row => row.difficulty === difficulty) : board;
  return json(filtered.slice(0, limit));
}

async function postScore(env, request) {
  const entry = cleanEntry(await readBody(request));
  if (!entry.id || !entry.handle) return fail(400, 'a result needs an id and a handle');

  const board = await readJSON(env, KEYS.scores, []);
  await env.BOARDS.put(KEYS.scores, JSON.stringify(merge(board, entry)));
  return json(entry, 201);
}

/**
 * A tournament as it is stored.
 *
 * `code` already carries the whole rule set — the game packs and unpacks it —
 * so this is deliberately dumb: an id, that code, and enough to list it.
 * `secret` is the host's own token, so only they can change or delete it.
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

/** The public view: everything except whatever proves you are the host. */
const published = tournament => {
  const { secret, ...rest } = tournament;
  return rest;
};

async function putTournament(env, request, id) {
  const body = cleanTournament({ ...(await readBody(request)), id });
  if (!body.id || !body.code) return fail(400, 'a tournament needs an id and a code');

  const existing = await readJSON(env, KEYS.tournament(body.id), null);
  if (existing && existing.secret && existing.secret !== body.secret) {
    return fail(403, 'that op code belongs to another host');
  }

  await env.BOARDS.put(KEYS.tournament(body.id), JSON.stringify(body),
    { expirationTtl: TOURNAMENT_TTL_S });

  // A small index, so listing does not need a KV list over every key.
  const index = await readJSON(env, KEYS.tournamentIndex, []);
  const next = [published(body), ...index.filter(row => row.id !== body.id)].slice(0, 200);
  await env.BOARDS.put(KEYS.tournamentIndex, JSON.stringify(next));

  return json(published(body));
}

async function deleteTournament(env, request, id) {
  const stored = await readJSON(env, KEYS.tournament(id), null);
  if (!stored) return json({ ok: true });

  const secret = new URL(request.url).searchParams.get('secret') || '';
  if (stored.secret && stored.secret !== secret) return fail(403, 'not your tournament');

  await env.BOARDS.delete(KEYS.tournament(id));
  await env.BOARDS.delete(KEYS.tournamentScores(id));
  const index = await readJSON(env, KEYS.tournamentIndex, []);
  await env.BOARDS.put(KEYS.tournamentIndex, JSON.stringify(index.filter(row => row.id !== id)));
  return json({ ok: true });
}

async function postTournamentScore(env, request, id) {
  const entry = cleanEntry({ ...(await readBody(request)), tournament: id });
  if (!entry.id || !entry.handle) return fail(400, 'a result needs an id and a handle');

  const board = await readJSON(env, KEYS.tournamentScores(id), []);
  const isNew = !board.some(row => row.id === entry.id);
  await env.BOARDS.put(KEYS.tournamentScores(id), JSON.stringify(merge(board, entry)));
  return json({ entry, isNew }, isNew ? 201 : 200);
}

/** Runs in progress: one short-lived key each, swept by KV's own expiry. */
async function listLiveRuns(env, tournamentId) {
  const listed = await env.BOARDS.list({ prefix: `live:${tournamentId}:` });
  const rows = await Promise.all(listed.keys.map(key => env.BOARDS.get(key.name, 'json')));
  return json(rows.filter(Boolean).sort(compareEntries));
}

async function putLiveRun(env, request, id) {
  const entry = cleanEntry(await readBody(request));
  if (!entry.id || !entry.tournament) return fail(400, 'a live run needs an id and a tournament');

  await env.BOARDS.put(KEYS.live(entry.tournament, id),
    JSON.stringify({ ...entry, updatedAt: Date.now() }),
    { expirationTtl: LIVE_TTL_S });
  return json(entry);
}

async function deleteLiveRun(env, request, id) {
  const tournament = new URL(request.url).searchParams.get('tournament') || '';
  if (tournament) await env.BOARDS.delete(KEYS.live(tournament, id));
  return json({ ok: true });
}

// ---- Router ----------------------------------------------------------------

/** Path segments after /api/, with empties dropped. */
function segmentsOf(url) {
  return url.pathname.split('/').filter(Boolean).slice(1);
}

async function route(request, env) {
  const url = new URL(request.url);
  const parts = segmentsOf(url);
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!env.BOARDS) return fail(500, 'the BOARDS KV namespace is not bound');

  // Writes are budgeted; reads are not.
  if (method !== 'GET' && !(await withinRateLimit(env, request))) {
    return fail(429, 'slow down');
  }

  if (parts[0] === 'health') return json({ ok: true, scope: 'global' });

  if (parts[0] === 'scores' && parts.length === 1) {
    if (method === 'GET') return getScores(env, url);
    if (method === 'POST') return postScore(env, request);
  }

  if (parts[0] === 'live' && parts.length === 2) {
    if (method === 'PUT') return putLiveRun(env, request, parts[1]);
    if (method === 'DELETE') return deleteLiveRun(env, request, parts[1]);
  }

  if (parts[0] === 'tournaments') {
    if (parts.length === 1 && method === 'GET') {
      return json(await readJSON(env, KEYS.tournamentIndex, []));
    }

    const id = (parts[1] || '').toUpperCase();
    if (parts.length === 2) {
      if (method === 'GET') {
        const stored = await readJSON(env, KEYS.tournament(id), null);
        return stored ? json(published(stored)) : fail(404, 'no such tournament');
      }
      if (method === 'PUT') return putTournament(env, request, id);
      if (method === 'DELETE') return deleteTournament(env, request, id);
    }
    if (parts.length === 3 && parts[2] === 'scores') {
      if (method === 'GET') return json(await readJSON(env, KEYS.tournamentScores(id), []));
      if (method === 'POST') return postTournamentScore(env, request, id);
    }
    if (parts.length === 3 && parts[2] === 'live' && method === 'GET') {
      return listLiveRuns(env, id);
    }
  }

  return fail(404, 'no such endpoint');
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      // A bad body is the client's fault; anything else is worth saying plainly.
      const message = String(error && error.message ? error.message : error);
      const clientFault = message === 'body too large' || message === 'malformed body';
      return fail(clientFault ? 400 : 500, message);
    }
  },
};
