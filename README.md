# Hack the Dice

A cyberpunk dice roguelike that runs entirely in the browser. Roll a pool of
dice at a corporate firewall, lock what you like, reroll the rest, and execute:
Bits × Mult becomes hacking power. Breach five nodes to reach a boss protocol,
beat it, and migrate to a harder server with the rig you have built.

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

## Testing

Two browser-based test pages, served the same way:

| Page | What it covers |
| --- | --- |
| `tools/smoke-test.html` | Pure logic: formatting, combos, catalogs, artifact hooks, sprite generation, and that thrown dice settle inside the board. |
| `tools/playthrough-test.html` | The real page, driven end to end: a node from roll to breach, the market, all three boss rules, the trace, a migration, special dice, abilities, the memory leak, and save/resume. |

Both print a green list and a pass/fail total. The playthrough test stashes and
restores `localStorage`, so running it does not cost you your saved run.

To run either headlessly, append `?ping` to the playthrough test's URL and its
results are also fetched as `/__t/<result>`, which shows up in the server's
access log:

```sh
python3 -m http.server 8000 > server.log 2>&1 &
firefox --headless --screenshot /tmp/out.png "http://localhost:8000/tools/playthrough-test.html?ping"
grep -ao '__t/[^ ]*' server.log
```

## Layout

```
index.html              markup only: the console shell and its element ids
src/
  main.js               composition root — wires everything, owns the frame loop
  styles/               one stylesheet per region of the console
  core/                 dependency-free helpers: math, random, format, storage,
                        settings, speed-aware sleep
  data/                 the game as data: dice, artifacts, abilities, enemies,
                        icons, tuning constants, effect constructors
  audio/                synth.js (two voices, one context) + sfx.js (the sounds)
  engine/               dice-board.js — the 2.5D physics sandbox
  render/               canvas painters: sprites, the board, the enemy portrait
  game/                 rules and flow: state, scoring, turn, execute, shop,
                        session, memory-leak, save
  ui/                   the DOM: hud, log, fx, modals, screens, input
tools/                  the two test pages
```

## Architecture

**Dependencies point one way.** `core` → `data` → `engine`/`audio` → `render` →
`game` → `ui`, with `main.js` on top. `game` calls into `ui` to show things;
`ui` reads `game/state.js` but never the other way around. There are no import
cycles, and the module graph is checked by both test pages simply by loading.

**The game is data.** A die, an artifact or an ability is an entry in a catalog
with optional hooks. The execute pipeline never asks what something *is*:

```js
// src/data/dice.js
amp: {
  name: 'AMP DIE', faces: 6, cut: 1, color: '#ff3df0', cost: 9, tier: 1,
  desc: 'Rolls 1–6. A scoring 6 grants ×2 Mult.',
  lateMultiplier: die => (die.scoringValue === 6 ? 2 : null),
},
```

Adding content is a catalog entry plus, for artifacts and abilities, an 8×8 icon
in `src/data/icons.js`. Nothing else changes. Artifacts that need behaviour
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

**Live bindings.** `state.js` exports `run` and `dice-board.js` exports `dice`;
both are reassigned when a run starts or the pool changes. Import them and read
`run.scrap` at call time — never destructure them into a local, or you will hold
a stale object. This is the one sharp edge in the codebase.

## Saves

Progress is stored in `localStorage` under `htd_save_v1`, with the personal best
in `htd_best_v1` and preferences in `htd_settings_v1`. The format is unchanged
from the original single-file version, so existing saves still load. A save
records the rig and how far the run got — never a node in progress, so reloading
mid-node restarts that node rather than rerolling a bad hand.

Anything in a save the catalogs no longer recognise is dropped on load rather
than breaking it.
