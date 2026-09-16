# Hack the Dice

A cyberpunk dice roguelike that runs entirely in the browser. Sign in, pick a
threat level, and roll a pool of dice at a corporate firewall: lock what you
like, reroll the rest, then execute — Bits × Mult becomes hacking power. Breach
five nodes to reach a boss protocol, beat it, and migrate to a harder server
with the rig you have built. Runs are scored onto a leaderboard, and a host can
set up a tournament with its own rules and its own board.

No build step, no dependencies, no network calls. Everything is generated at
runtime — sprites are painted pixel by pixel onto canvases, and every sound is
synthesised with the Web Audio API.

## Running it

The game uses native ES modules, so it needs to be served over HTTP —
`file://` will not work.

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

Any static server will do.

## What's in it

**Threat levels.** Four tiers, named after who is doing the hacking and ramped
green→red so the order reads before the words do: SCRIPT KIDDIE, PEN TESTER,
BLACK HAT, NATION STATE. A tier sets firewall strength, executes per node,
rerolls per roll, starting scrap, market prices and the score multiplier — all
of it in `src/data/difficulty.js`, and all of it spelled out on the cards so the
player knows what they are choosing.

**Leaderboards.** Every run signs in with a handle and banks a score when it
ends, whether it was traced or walked away from. Score is nodes breached,
servers owned and scrap harvested, multiplied by the tier — deliberately not
hacking power, which grows exponentially and would make one lucky build
unbeatable forever. Boards filter by tier.

**Seeded runs.** Every run is driven by a seed, shown in the top bar and
copyable with a click. Type one in to replay a run exactly — same dice, same
node names, same shop offers — or leave it blank for a fresh random seed. Only
things that change the outcome are seeded; sparks, screen shake and glitches
keep their own unseeded randomness, because they are drawn per frame and would
otherwise make two players on the same seed diverge immediately.

**Tournaments.** A host picks a threat level, optionally fixes a seed so
everyone rolls identical dice, and bans any bosses, dice, cyberartifacts or
abilities they like. They get back a five-character **op code** to read out, a
**QR code** to hold up, and a longer **invite code** to paste — all three name
the same tournament, because the whole rule set is packed into the code itself.
Each tournament keeps its own board.

**The lobby is a race.** While a tournament run is being played it publishes
itself, so the tournament board shows runs in progress alongside finished ones,
ranked by the score they would bank right now. Runners climb past each other as
they breach nodes, rows slide to their new places, and a run settles in place
when it ends. Several browser windows on one machine see each other live.

Because the store is browser-local (see below), boards live on the device that
played them. To pull results in from another device, a runner copies their
result code after a run and the host merges it into the board.

### Running it for several people

Serve on the network rather than on localhost, and the QR code carries a link
that opens the game and joins the tournament in one scan:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
# players scan the host's QR, or open http://<your-ip>:8000/ and type the op code
```

## Testing

Three browser-based test pages, served the same way:

| Page | What it covers |
| --- | --- |
| `tools/smoke-test.html` | Pure logic: formatting, combos, catalogs, artifact hooks, sprite generation, threat level data, score maths, tournament codes, and that thrown dice settle inside the board. |
| `tools/playthrough-test.html` | The real page, driven end to end: a node from roll to breach, the market, all three boss rules, the trace, a migration, special dice, abilities, the memory leak, and save/resume. |
| `tools/arcade-test.html` | The start screen and everything around a run: signing in, threat levels applying to a run, seeded runs replaying identically, the leaderboard, hosting a tournament with bans, those bans holding in the market and at the boss, the live lobby, result codes, and the run-over screen. |
| `tools/qr-test.html` | The QR encoder, against a decoder written independently in the test: round-trips the payload, checks the format information's BCH code, and checks each codeword block divides cleanly by its generator polynomial. |

Each prints a green list and a pass/fail total. The two full-page tests stash
and restore `localStorage`, so running them does not cost you your progress.

To run them headlessly, append `?ping` and the results are also fetched as
`/__t/<result>`, which shows up in the server's access log:

```sh
python3 -m http.server 8000 > server.log 2>&1 &
firefox --headless --screenshot /tmp/out.png "http://localhost:8000/tools/arcade-test.html?ping"
grep -ao '__t/[^ ]*' server.log
```

## Layout

```
index.html              markup only: the console shell and its element ids
src/
  main.js               composition root — wires everything, owns the frame loop
  styles/               one stylesheet per region of the console, plus arcade.css
                        for the start screen, boards and tournament screens
  core/                 dependency-free helpers: math, random, seeded random,
                        bit packing, format, storage, settings, speed-aware sleep
  data/                 the game as data: dice, artifacts, abilities, enemies,
                        difficulty tiers, icons, tuning constants, effects
  audio/                synth.js (two voices, one context) + sfx.js (the sounds)
  engine/               dice-board.js — the 2.5D physics sandbox
  render/               canvas painters: sprites, the board, the enemy portrait,
                        and a small QR encoder
  game/                 rules and flow: state, scoring, turn, execute, shop,
                        session, memory-leak, difficulty, score, leaderboard,
                        tournament, live-run, save
  services/             where persistence lives: store.js picks a backend,
                        local-store.js is the browser-local one
  ui/                   the DOM: hud, log, fx, modals, screens, input, and the
                        start screen with its leaderboard, live board and
                        tournament views
tools/                  the three test pages
```

## Architecture

**Dependencies point one way.** `core` → `data` → `engine`/`audio` → `render` →
`game` → `ui`, with `main.js` on top. `game` calls into `ui` to show things;
`ui` reads `game/state.js` but never the other way around. There are no import
cycles, and the module graph is checked by the test pages simply by loading.

**The game is data.** A die, an artifact, an ability or a threat level is an
entry in a catalog with optional hooks. The execute pipeline never asks what
something *is*:

```js
// src/data/dice.js
amp: {
  name: 'AMP DIE', faces: 6, cut: 1, color: '#ff3df0', cost: 9, tier: 1,
  desc: 'Rolls 1–6. A scoring 6 grants ×2 Mult.',
  lateMultiplier: die => (die.scoringValue === 6 ? 2 : null),
},
```

Adding content is a catalog entry plus, for artifacts and abilities, an 8×8 icon
in `src/data/icons.js`. Nothing else changes — including the tournament ban
screens, which are generated from the catalogs. Artifacts that need behaviour
outside scoring are marked `passive: true` with a comment pointing at the code
that implements them.

**Scoring hooks fire in a fixed order**, which is what makes builds predictable:
`perDie` as each die scores, then `bonus` for flat additions, then `multiplier`
last so it multiplies everything above it. `src/game/execute.js` documents the
full sequence.

**Decisions and presentation are separate.** `game/execute.js` works out what
happens and hands symbolic sources (`{ type: 'artifact', id }`) to
`ui/execute-view.js`, which knows that an artifact's payout should fly out of
that artifact's slot. No DOM code lives in the game layer.

**A phase gates everything.** `run.phase` (see `src/game/state.js`) decides what
input is accepted and what the HUD shows: `title → ready → rolling → manip →
scoring → (breach → shop | leakwait → over)`.

**Persistence is behind a seam.** Everything that outlives a run goes through
`services/store.js`, whose methods are async even though localStorage is not.
That is deliberate: it is where a networked backend would slot in, and the UI
already awaits it, so adding one would not ripple through the screens.

**Two streams of randomness.** `core/game-random.js` is the seeded one: dice
faces, shop offers, node names, which die the ANTIVIRUS takes. `core/random.js`
is everything cosmetic. A save stores the seed *and* the generator's state, so
resuming continues the sequence rather than starting it over.

**Codes are packed, not serialised.** `game/tournament.js` writes a tournament
as bits — two for the tier, one per possible ban, six per character of the name
— then base32 in an alphabet with no lookalike characters. That keeps an invite
code around 40 characters, which is what lets `render/qr.js` stay inside QR
version 6 at error correction L, where there is a single block of codewords and
no interleaving to get wrong.

**Live bindings.** `state.js` exports `run` and `dice-board.js` exports `dice`;
both are reassigned when a run starts or the pool changes. Import them and read
`run.scrap` at call time — never destructure them into a local, or you will hold
a stale object. This is the one sharp edge in the codebase.

**The start screen renders from strings.** `ui/start-screen.js` is a small view
router: views build HTML, one delegated click handler reads `data-action`
attributes, and a render token drops the output of any render that a newer
navigation has superseded. Anything typed is read back into the draft before a
re-render replaces the markup that holds it.

## Saves and stored data

Everything is in `localStorage`, on the device that played:

| Key | What |
| --- | --- |
| `htd_save_v1` | the run in progress |
| `htd_best_v1` | personal best |
| `htd_settings_v1` | animation speed and mute |
| `htd_profile_v1` | handle, last threat level, recent handles |
| `htd_scores_v1` | the all-comers leaderboard |
| `htd_tournaments_v1` | tournaments hosted or joined here |
| `htd_tournament_scores_v1` | per-tournament boards |
| `htd_live_runs_v1` | runs in progress, for the lobby; entries expire two minutes after their last heartbeat |

The save format is unchanged from the original single-file version, so existing
saves still load — they simply resume on the default threat level. A save
records the rig and how far the run got, never a node in progress, so reloading
mid-node restarts that node rather than rerolling a bad hand. Anything in a save
the catalogs no longer recognise is dropped on load rather than breaking it.

## Where this came from

This is a restructured version of a single-file HTML artifact: one `index.html`
holding ~220 lines of CSS and ~830 lines of JavaScript in one IIFE. The core
game's behaviour, balance and save format are unchanged; the start screen,
threat levels, leaderboards and tournaments were added on top. Republishing it
as a single-file artifact again would need a bundling step, which this project
deliberately does not have.
