# The shared board

The game is a static site. GitHub Pages will happily serve it to every device
you own, but it cannot remember anything, so every browser kept its own
leaderboard and its own tournaments and none of them could see each other.

This directory is the smallest thing that fixes that: one Cloudflare Worker over
one KV namespace, holding the leaderboard, the tournaments, their boards, and
the runs currently in progress. It is free at the scale this game runs at, and
the game works without it — leave it undeployed and boards stay browser-local,
exactly as they were.

## Deploying it

You need a free Cloudflare account. From this directory:

```sh
cd worker
npx wrangler login                          # opens a browser once
npx wrangler kv namespace create BOARDS     # prints an id
```

Paste that id into `wrangler.toml`, replacing `PASTE_YOUR_KV_NAMESPACE_ID_HERE`:

```toml
[[kv_namespaces]]
binding = "BOARDS"
id = "a1b2c3..."
```

Then deploy:

```sh
npx wrangler deploy
```

It prints a URL like `https://hack-the-dice-api.your-name.workers.dev`. Put that
in [`src/services/config.js`](../src/services/config.js):

```js
export const API_BASE = 'https://hack-the-dice-api.your-name.workers.dev';
```

Commit and push. The Pages deploy picks it up, and every device that opens the
game is now looking at the same board.

Check it any time with:

```sh
curl https://hack-the-dice-api.your-name.workers.dev/api/health
# {"ok":true,"scope":"global"}
```

## What it stores

| Key | What it holds |
| --- | --- |
| `scores` | the all-comers leaderboard, top 100 |
| `tournaments` | an index of tournaments, so listing is one read |
| `tournament:<id>` | one tournament's rules, expiring after 90 days |
| `tscores:<id>` | one tournament's board, top 100 |
| `live:<tournament>:<id>` | a run in progress, expiring 120s after its last heartbeat |
| `rate:<ip>:<minute>` | the write budget, expiring after two minutes |

Nothing else. No accounts, no email, no IP kept beyond the rate-limit minute.

## What it does not do

**It does not know who you are.** A handle is a label a player types, not an
identity, which is exactly what it was when boards were browser-local. Two
players can use the same one.

**It does not verify scores.** A determined person can post a fake result to an
open endpoint, and no amount of client-side cleverness changes that — the game
runs entirely in the player's browser, so anything it could sign, they could
sign. The board is an arcade cabinet, not a ranked ladder. What the Worker does
guarantee is that a posted result cannot be anything other than a score-shaped
row: every field is retyped and length-capped server-side, an existing entry
can never be edited, boards are trimmed to 100, and writes are rate-limited to
30 per IP per minute so nobody can fill the namespace.

If you ever want it stricter, the honest way is a server that runs the game
rules and replays the seed, not a secret in the client.

**Tournaments are owned by whoever made them.** Creating one mints a random
token kept in that browser's localStorage; changing or deleting it afterwards
needs the same token. Lose the browser and you lose the ability to edit it —
it still expires on its own after 90 days.

## Local development

```sh
npx wrangler dev
```

serves the API on `http://localhost:8787`. Point the game at it without editing
any file, from the browser console:

```js
localStorage.setItem('htd_api_base', 'http://localhost:8787')
```

That override beats `API_BASE` in `src/services/config.js`; clear the key to go
back. The test pages use the same hook to stand up an in-memory board of their
own — see `tools/fake-board.js`.
