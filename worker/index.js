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
 * There is also a maintenance API under /api/admin, for taking things off the
 * board that should not be on it. It is gated on a key this repository does not
 * contain and answers 404 without one — see "Maintenance" below.
 *
 * Deploying it: see worker/README.md.
 */

/**
 * Boards are trimmed to this, best first, so a key cannot grow forever.
 *
 * It can afford to be large because a board holds one row per runner per threat
 * level rather than one per run — see merge(). It grows with how many people
 * play, not with how much they play.
 */
const MAX_BOARD_SIZE = 1000;
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
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
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

/**
 * Add an entry to a board: one row per runner per threat level, their best.
 *
 * A leaderboard of every run anyone has ever finished is a leaderboard of
 * whoever played the most. So a new result either takes a handle's place on its
 * threat level or it does not appear at all, and the same handle on a different
 * threat level is a different row — the tiers are different games.
 *
 * Worth being straight about what "a runner" means here: a handle is a label
 * somebody typed, not an account, so two people sharing one share a row. That
 * has been true of this board since it existed, and there is nothing on it that
 * could tell them apart.
 *
 * A result that loses to the one already there changes nothing, which also
 * means re-posting a run can never make it worse.
 */
function merge(board, entry) {
  const sameRunner = row =>
    row.handle === entry.handle && row.difficulty === entry.difficulty;

  const standing = board.find(row => sameRunner(row) && row.id !== entry.id);
  const best = standing && compareEntries(standing, entry) < 0 ? standing : entry;

  const without = board.filter(row => row.id !== entry.id && !sameRunner(row));
  return [...without, best].sort(compareEntries).slice(0, MAX_BOARD_SIZE);
}

// ---- Routes ----------------------------------------------------------------

async function getScores(env, url) {
  const difficulty = url.searchParams.get('difficulty');
  const limit = Math.min(MAX_BOARD_SIZE, num(url.searchParams.get('limit')) || MAX_BOARD_SIZE);
  const offset = Math.min(MAX_BOARD_SIZE, num(url.searchParams.get('offset')));

  const board = await readJSON(env, KEYS.scores, []);
  const filtered = difficulty ? board.filter(row => row.difficulty === difficulty) : board;
  return json(filtered.slice(offset, offset + limit));
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

  // Marked here rather than trusted from the body: anything on this endpoint is
  // a run in progress by definition, and the lobby reads the flag to tell a
  // runner still going from one that has finished.
  const running = { ...entry, live: true, updatedAt: Date.now() };
  await env.BOARDS.put(KEYS.live(entry.tournament, id), JSON.stringify(running),
    { expirationTtl: LIVE_TTL_S });
  return json(running);
}

async function deleteLiveRun(env, request, id) {
  const tournament = new URL(request.url).searchParams.get('tournament') || '';
  if (tournament) await env.BOARDS.delete(KEYS.live(tournament, id));
  return json({ ok: true });
}

// ---- Maintenance -----------------------------------------------------------

/*
 * Everything under /api/admin can delete something that is not the caller's:
 * a tournament somebody else hosted, a result somebody else posted. The board
 * has no accounts to check that against, so it checks one secret instead — one
 * the Worker holds and this repository does not:
 *
 *   npx wrangler secret put ADMIN_KEY
 *
 * Set nothing, or something short enough to guess, and there is no maintenance
 * API at all: every route here answers 404, exactly as an address that is not
 * there would. A wrong key answers 404 too, so probing cannot tell the
 * difference between a bad key and no such endpoint.
 *
 * Reading the source tells you this exists. That is fine and unavoidable — the
 * game is served from the same repository. What keeps the board safe is the key
 * being secret and long, never this code being unread.
 */

/** Shorter than this is not a secret, it is a password someone will guess. */
const MIN_ADMIN_KEY = 16;
const ADMIN_HEADER = 'X-Admin-Key';

/** Compared without an early exit, so the key cannot be found a byte at a time. */
function sameSecret(given, wanted) {
  if (given.length !== wanted.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ wanted.charCodeAt(i);
  return diff === 0;
}

function isAdmin(env, request) {
  const configured = String(env.ADMIN_KEY || '');
  if (configured.length < MIN_ADMIN_KEY) return false;
  return sameSecret(request.headers.get(ADMIN_HEADER) || '', configured);
}

/** Every run in progress for one tournament, gone. @returns {number} how many. */
async function clearLiveRuns(env, tournamentId) {
  const listed = await env.BOARDS.list({ prefix: `live:${tournamentId}:` });
  await Promise.all(listed.keys.map(key => env.BOARDS.delete(key.name)));
  return listed.keys.length;
}

/** What is on the board right now, in four numbers. */
async function adminPing(env) {
  const [scores, index, live] = await Promise.all([
    readJSON(env, KEYS.scores, []),
    readJSON(env, KEYS.tournamentIndex, []),
    env.BOARDS.list({ prefix: 'live:' }),
  ]);
  return json({
    ok: true,
    scores: scores.length,
    tournaments: index.length,
    live: live.keys.length,
  });
}

/**
 * Every tournament on the board, with what hangs off it.
 *
 * Unlike the public listing this is not filtered by anything, because the point
 * of it is to see what is out there — including rows whose tournament has since
 * expired out of KV and left the index pointing at nothing.
 */
async function adminTournaments(env) {
  const index = await readJSON(env, KEYS.tournamentIndex, []);
  const rows = await Promise.all(index.map(async row => {
    const [stored, board, live] = await Promise.all([
      readJSON(env, KEYS.tournament(row.id), null),
      readJSON(env, KEYS.tournamentScores(row.id), []),
      env.BOARDS.list({ prefix: `live:${row.id}:` }),
    ]);
    return { ...row, scores: board.length, live: live.keys.length, expired: !stored };
  }));
  return json(rows);
}

/**
 * Re-apply the board's own rule to everything already on it.
 *
 * Deploying the one-row-per-runner rule does not tidy a board that was filled
 * under the old one — rows only collapse when that handle next posts, and a
 * handle that never plays again keeps its pile. This folds every existing row
 * back through merge(), which is the point: compaction cannot disagree with
 * what a new result would have done, because it is the same function.
 */
async function adminCompact(env) {
  const board = await readJSON(env, KEYS.scores, []);

  let next = [];
  for (const row of board) next = merge(next, row);

  await env.BOARDS.put(KEYS.scores, JSON.stringify(next));
  return json({ ok: true, before: board.length, after: next.length, removed: board.length - next.length });
}

/** Drop index rows whose tournament has expired, and the boards they left behind. */
async function adminSweep(env) {
  const index = await readJSON(env, KEYS.tournamentIndex, []);
  const alive = [];
  const dropped = [];
  for (const row of index) {
    if (await readJSON(env, KEYS.tournament(row.id), null)) alive.push(row);
    else {
      dropped.push(row.id);
      await env.BOARDS.delete(KEYS.tournamentScores(row.id));
      await clearLiveRuns(env, row.id);
    }
  }
  if (dropped.length) await env.BOARDS.put(KEYS.tournamentIndex, JSON.stringify(alive));
  return json({ ok: true, dropped });
}

/** A tournament off the board for everyone, host token or not. */
async function adminDeleteTournament(env, id) {
  const live = await clearLiveRuns(env, id);
  await env.BOARDS.delete(KEYS.tournament(id));
  await env.BOARDS.delete(KEYS.tournamentScores(id));
  const index = await readJSON(env, KEYS.tournamentIndex, []);
  await env.BOARDS.put(KEYS.tournamentIndex, JSON.stringify(index.filter(row => row.id !== id)));
  return json({ ok: true, id, live });
}

/** One result off one board. */
async function adminDropScore(env, key, entryId) {
  const board = await readJSON(env, key, []);
  const kept = board.filter(row => row.id !== entryId);
  await env.BOARDS.put(key, JSON.stringify(kept));
  return json({ ok: true, removed: board.length - kept.length });
}

/** A whole board, emptied. */
async function adminWipeBoard(env, key, { removeKey = false } = {}) {
  const board = await readJSON(env, key, []);
  if (removeKey) await env.BOARDS.delete(key);
  else await env.BOARDS.put(key, JSON.stringify([]));
  return json({ ok: true, removed: board.length });
}

/**
 * Every result posted under one handle, everywhere it was posted.
 *
 * A handle is a label, not an account, so this is a name sweep and nothing more
 * — anyone else who typed the same one loses their rows too. It is the only
 * honest way to do it on a board that has never known who anybody is.
 */
async function adminPurgeHandle(env, handle) {
  const wanted = String(handle || '').toUpperCase().slice(0, 16);
  if (!wanted) return fail(400, 'which handle?');
  let removed = 0;

  const board = await readJSON(env, KEYS.scores, []);
  const kept = board.filter(row => row.handle !== wanted);
  if (kept.length !== board.length) {
    removed += board.length - kept.length;
    await env.BOARDS.put(KEYS.scores, JSON.stringify(kept));
  }

  const index = await readJSON(env, KEYS.tournamentIndex, []);
  for (const row of index) {
    const key = KEYS.tournamentScores(row.id);
    const tournamentBoard = await readJSON(env, key, []);
    const tournamentKept = tournamentBoard.filter(entry => entry.handle !== wanted);
    if (tournamentKept.length !== tournamentBoard.length) {
      removed += tournamentBoard.length - tournamentKept.length;
      await env.BOARDS.put(key, JSON.stringify(tournamentKept));
    }
  }

  const listed = await env.BOARDS.list({ prefix: 'live:' });
  for (const key of listed.keys) {
    const entry = await env.BOARDS.get(key.name, 'json');
    if (entry && entry.handle === wanted) {
      await env.BOARDS.delete(key.name);
      removed++;
    }
  }

  return json({ ok: true, handle: wanted, removed });
}

async function adminRoute(env, parts, method) {
  if (parts[0] === 'ping' && method === 'GET') return adminPing(env);
  if (parts[0] === 'sweep' && method === 'POST') return adminSweep(env);
  if (parts[0] === 'compact' && method === 'POST') return adminCompact(env);

  if (parts[0] === 'scores' && method === 'DELETE') {
    if (parts.length === 1) return adminWipeBoard(env, KEYS.scores);
    if (parts.length === 2) return adminDropScore(env, KEYS.scores, parts[1]);
  }

  if (parts[0] === 'handles' && parts.length === 2 && method === 'DELETE') {
    return adminPurgeHandle(env, decodeURIComponent(parts[1]));
  }

  if (parts[0] === 'tournaments') {
    if (parts.length === 1 && method === 'GET') return adminTournaments(env);

    const id = (parts[1] || '').toUpperCase();
    if (parts.length === 2 && method === 'DELETE') return adminDeleteTournament(env, id);
    if (parts.length === 3 && method === 'DELETE') {
      if (parts[2] === 'live') {
        return json({ ok: true, removed: await clearLiveRuns(env, id) });
      }
      if (parts[2] === 'scores') {
        return adminWipeBoard(env, KEYS.tournamentScores(id), { removeKey: true });
      }
    }
    if (parts.length === 4 && parts[2] === 'scores' && method === 'DELETE') {
      return adminDropScore(env, KEYS.tournamentScores(id), parts[3]);
    }
  }

  return fail(404, 'no such endpoint');
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

  /*
   * Maintenance, before anything else.
   *
   * Ahead of the rate limit because clearing a board is a burst of writes by
   * nature and being throttled halfway through would leave it half cleared.
   * Without the key this branch is indistinguishable from a wrong address.
   */
  if (parts[0] === 'admin') {
    if (!isAdmin(env, request)) return fail(404, 'no such endpoint');
    return adminRoute(env, parts.slice(1), method);
  }

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
