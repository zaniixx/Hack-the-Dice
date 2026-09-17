var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var MAX_BOARD_SIZE = 100;
var TOURNAMENT_TTL_S = 60 * 60 * 24 * 90;
var LIVE_TTL_S = 120;
var MAX_BODY_BYTES = 4096;
var RATE_LIMIT = 30;
var KEYS = {
  scores: "scores",
  tournament: /* @__PURE__ */ __name((id) => `tournament:${id}`, "tournament"),
  tournamentIndex: "tournaments",
  tournamentScores: /* @__PURE__ */ __name((id) => `tscores:${id}`, "tournamentScores"),
  live: /* @__PURE__ */ __name((tournament, id) => `live:${tournament}:${id}`, "live")
};
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};
var json = /* @__PURE__ */ __name((body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS }
}), "json");
var fail = /* @__PURE__ */ __name((status, message) => json({ error: message }, status), "fail");
async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("body too large");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object") throw new Error("malformed body");
    return value;
  } catch {
    throw new Error("malformed body");
  }
}
__name(readBody, "readBody");
async function withinRateLimit(env, request) {
  const ip = request.headers.get("CF-Connecting-IP") || "anon";
  const key = `rate:${ip}:${Math.floor(Date.now() / 6e4)}`;
  const used = Number(await env.BOARDS.get(key)) || 0;
  if (used >= RATE_LIMIT) return false;
  await env.BOARDS.put(key, String(used + 1), { expirationTtl: 120 });
  return true;
}
__name(withinRateLimit, "withinRateLimit");
async function readJSON(env, key, fallback) {
  const value = await env.BOARDS.get(key, "json");
  return value === null || value === void 0 ? fallback : value;
}
__name(readJSON, "readJSON");
var compareEntries = /* @__PURE__ */ __name((a, b) => b.score - a.score || b.server - a.server || b.node - a.node || b.biggest - a.biggest, "compareEntries");
var str = /* @__PURE__ */ __name((value, max) => String(value ?? "").slice(0, max), "str");
var num = /* @__PURE__ */ __name((value) => Number.isFinite(+value) ? Math.max(0, Math.floor(+value)) : 0, "num");
var cleanEntry = /* @__PURE__ */ __name((entry) => ({
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
  reason: entry.reason === "abandoned" ? "abandoned" : "traced",
  at: num(entry.at) || Date.now()
}), "cleanEntry");
function merge(board, entry) {
  const without = board.filter((row) => row.id !== entry.id);
  return [...without, entry].sort(compareEntries).slice(0, MAX_BOARD_SIZE);
}
__name(merge, "merge");
async function getScores(env, url) {
  const difficulty = url.searchParams.get("difficulty");
  const limit = Math.min(MAX_BOARD_SIZE, num(url.searchParams.get("limit")) || MAX_BOARD_SIZE);
  const board = await readJSON(env, KEYS.scores, []);
  const filtered = difficulty ? board.filter((row) => row.difficulty === difficulty) : board;
  return json(filtered.slice(0, limit));
}
__name(getScores, "getScores");
async function postScore(env, request) {
  const entry = cleanEntry(await readBody(request));
  if (!entry.id || !entry.handle) return fail(400, "a result needs an id and a handle");
  const board = await readJSON(env, KEYS.scores, []);
  await env.BOARDS.put(KEYS.scores, JSON.stringify(merge(board, entry)));
  return json(entry, 201);
}
__name(postScore, "postScore");
var cleanTournament = /* @__PURE__ */ __name((t) => ({
  id: str(t.id, 8).toUpperCase(),
  name: str(t.name, 40).toUpperCase(),
  host: str(t.host, 16).toUpperCase(),
  code: str(t.code, 200),
  difficulty: str(t.difficulty, 24),
  seed: str(t.seed, 12).toUpperCase(),
  created: num(t.created) || Date.now(),
  secret: str(t.secret, 64)
}), "cleanTournament");
var published = /* @__PURE__ */ __name((tournament) => {
  const { secret, ...rest } = tournament;
  return rest;
}, "published");
async function putTournament(env, request, id) {
  const body = cleanTournament({ ...await readBody(request), id });
  if (!body.id || !body.code) return fail(400, "a tournament needs an id and a code");
  const existing = await readJSON(env, KEYS.tournament(body.id), null);
  if (existing && existing.secret && existing.secret !== body.secret) {
    return fail(403, "that op code belongs to another host");
  }
  await env.BOARDS.put(
    KEYS.tournament(body.id),
    JSON.stringify(body),
    { expirationTtl: TOURNAMENT_TTL_S }
  );
  const index = await readJSON(env, KEYS.tournamentIndex, []);
  const next = [published(body), ...index.filter((row) => row.id !== body.id)].slice(0, 200);
  await env.BOARDS.put(KEYS.tournamentIndex, JSON.stringify(next));
  return json(published(body));
}
__name(putTournament, "putTournament");
async function deleteTournament(env, request, id) {
  const stored = await readJSON(env, KEYS.tournament(id), null);
  if (!stored) return json({ ok: true });
  const secret = new URL(request.url).searchParams.get("secret") || "";
  if (stored.secret && stored.secret !== secret) return fail(403, "not your tournament");
  await env.BOARDS.delete(KEYS.tournament(id));
  await env.BOARDS.delete(KEYS.tournamentScores(id));
  const index = await readJSON(env, KEYS.tournamentIndex, []);
  await env.BOARDS.put(KEYS.tournamentIndex, JSON.stringify(index.filter((row) => row.id !== id)));
  return json({ ok: true });
}
__name(deleteTournament, "deleteTournament");
async function postTournamentScore(env, request, id) {
  const entry = cleanEntry({ ...await readBody(request), tournament: id });
  if (!entry.id || !entry.handle) return fail(400, "a result needs an id and a handle");
  const board = await readJSON(env, KEYS.tournamentScores(id), []);
  const isNew = !board.some((row) => row.id === entry.id);
  await env.BOARDS.put(KEYS.tournamentScores(id), JSON.stringify(merge(board, entry)));
  return json({ entry, isNew }, isNew ? 201 : 200);
}
__name(postTournamentScore, "postTournamentScore");
async function listLiveRuns(env, tournamentId) {
  const listed = await env.BOARDS.list({ prefix: `live:${tournamentId}:` });
  const rows = await Promise.all(listed.keys.map((key) => env.BOARDS.get(key.name, "json")));
  return json(rows.filter(Boolean).sort(compareEntries));
}
__name(listLiveRuns, "listLiveRuns");
async function putLiveRun(env, request, id) {
  const entry = cleanEntry(await readBody(request));
  if (!entry.id || !entry.tournament) return fail(400, "a live run needs an id and a tournament");
  await env.BOARDS.put(
    KEYS.live(entry.tournament, id),
    JSON.stringify({ ...entry, updatedAt: Date.now() }),
    { expirationTtl: LIVE_TTL_S }
  );
  return json(entry);
}
__name(putLiveRun, "putLiveRun");
async function deleteLiveRun(env, request, id) {
  const tournament = new URL(request.url).searchParams.get("tournament") || "";
  if (tournament) await env.BOARDS.delete(KEYS.live(tournament, id));
  return json({ ok: true });
}
__name(deleteLiveRun, "deleteLiveRun");
function segmentsOf(url) {
  return url.pathname.split("/").filter(Boolean).slice(1);
}
__name(segmentsOf, "segmentsOf");
async function route(request, env) {
  const url = new URL(request.url);
  const parts = segmentsOf(url);
  const method = request.method;
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (!env.BOARDS) return fail(500, "the BOARDS KV namespace is not bound");
  if (method !== "GET" && !await withinRateLimit(env, request)) {
    return fail(429, "slow down");
  }
  if (parts[0] === "health") return json({ ok: true, scope: "global" });
  if (parts[0] === "scores" && parts.length === 1) {
    if (method === "GET") return getScores(env, url);
    if (method === "POST") return postScore(env, request);
  }
  if (parts[0] === "live" && parts.length === 2) {
    if (method === "PUT") return putLiveRun(env, request, parts[1]);
    if (method === "DELETE") return deleteLiveRun(env, request, parts[1]);
  }
  if (parts[0] === "tournaments") {
    if (parts.length === 1 && method === "GET") {
      return json(await readJSON(env, KEYS.tournamentIndex, []));
    }
    const id = (parts[1] || "").toUpperCase();
    if (parts.length === 2) {
      if (method === "GET") {
        const stored = await readJSON(env, KEYS.tournament(id), null);
        return stored ? json(published(stored)) : fail(404, "no such tournament");
      }
      if (method === "PUT") return putTournament(env, request, id);
      if (method === "DELETE") return deleteTournament(env, request, id);
    }
    if (parts.length === 3 && parts[2] === "scores") {
      if (method === "GET") return json(await readJSON(env, KEYS.tournamentScores(id), []));
      if (method === "POST") return postTournamentScore(env, request, id);
    }
    if (parts.length === 3 && parts[2] === "live" && method === "GET") {
      return listLiveRuns(env, id);
    }
  }
  return fail(404, "no such endpoint");
}
__name(route, "route");
var index_default = {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      const clientFault = message === "body too large" || message === "malformed body";
      return fail(clientFault ? 400 : 500, message);
    }
  }
};

// ../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-jlgrZV/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = index_default;

// ../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-jlgrZV/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
