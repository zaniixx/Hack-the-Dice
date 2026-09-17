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
python3 tools/serve.py
# then open http://localhost:8000/
```

Any static server will do, but this one sends `Cache-Control: no-store`. That
matters while developing: the game is ES modules, and a browser holding half of
them from an earlier version while fetching the rest fresh fails with a
missing-export error and a black screen. If that ever happens, hard-refresh
(ctrl-shift-R) — and the page will tell you so, because anything thrown before
the game boots is printed on screen rather than swallowed.

## What's in it

**Threat levels.** Four tiers, named after who is doing the hacking and ramped
green→red so the order reads before the words do: SCRIPT KIDDIE, PEN TESTER,
BLACK HAT, NATION STATE. A tier sets firewall strength, how fast firewalls ramp
per server, artifact slots, executes per node, rerolls per roll, starting scrap,
market prices and the score multiplier — all of it in `src/data/difficulty.js`,
and all of it spelled out on the cards so the player knows what they are
choosing. Because a tier scales the curve and not just the numbers, the gap
between SCRIPT KIDDIE and NATION STATE opens up as a run gets deep: by server 8
it is roughly ten to one.

**Four tiers of gear, and a fourth that only a deep run sees.** A tier unlocks
on the server of the same number, so climbing is better hardware and not only
bigger firewalls. Tier 4 opens on server 4: the D50 PENTACONTA for Bits, the
NOVA DIE for ×Mult, the CHRONO DIE that scores twice and pays every perDie
artifact twice with it, and SUDO and KERNEL EXPLOIT — the first abilities in the
game above tier 2, which until now left the ability slot with nothing new to
offer after server 3.

Tier 4 is worth roughly three times the best tier-3 pool, which is a gear step
rather than an answer: flat +Mult multiplies everything the artifacts do after
it, so a pool of +Mult dice compounds fast and the tier-4 versions are
deliberately small steps up from VIRUS and QUBIT rather than large ones.

**A difficulty curve that accelerates.** A rig compounds — MOORE'S LAW doubles
on every migration, BLOCKCHAIN compounds per node breached and SINGULARITY per
server — so firewalls that grew by a fixed multiple per server would be left
behind as soon as a build came together, which is what makes a roguelike stop
being a game once its early hurdles are passed. So the firewall curve
accelerates too: each server's step up is wider than the one before it
(`SERVER_STEP` and `SERVER_ACCEL` in `src/data/enemies.js`). Server 1 is
unchanged as an on-ramp; by server 6 a good build is spending three of its four
executes on a boss instead of one, and the numbers on screen are in the
billions by the time a run ends.

**Cyberartifact editions.** Slots are deliberately scarce — five by default,
four on NATION STATE, against nineteen artifacts worth owning — so what goes in
a slot matters more than how many you have. The black market answers that by
stamping some artifacts with an edition, and stamps get commoner the deeper a
run goes:

| Edition | What it adds |
| --- | --- |
| ENCRYPTED | +30 Bits on every Execute |
| OVERCLOCKED | +4 Mult on every Execute |
| PRISMATIC | ×1.5 Mult on every Execute |
| NEGATIVE | +1 artifact slot while installed |

A stamp rides on top of whatever the artifact already does, is priced into the
card, and is refunded when it is sold. NEGATIVE brings its own slot, so it is
the one purchase a full rig never refuses — and the reason a run can end six
artifacts deep instead of five.

**Leaderboards, shared between devices.** Every run signs in with a handle and
banks a score when it ends, whether it was traced or walked away from. Score is
nodes breached, servers owned and scrap harvested, multiplied by the tier —
deliberately not hacking power, which grows exponentially and would make one
lucky build unbeatable forever. Boards filter by tier.

The game is a static site, so there is nothing behind it to remember a score:
boards used to live on whichever browser played them, and a phone and a laptop
could not see each other's. [`worker/`](worker/) is the fix — one Cloudflare
Worker over one KV namespace, holding the leaderboard, the tournaments, their
boards and the runs in progress. Deploy it, put its URL in
[`src/services/config.js`](src/services/config.js), and every device that opens
the game is looking at the same standings. Leave it undeployed and everything
works exactly as before, in the browser. See [worker/README.md](worker/README.md)
for the three commands, and for what it does and does not promise about a score
posted by someone who wants to cheat.

**Eight boss protocols, in an order you do not know.** Node 5 of every server
is guarded by one, and each breaks a different rule of the game:

| Protocol | What it does |
| --- | --- |
| ANTIVIRUS | Quarantines one die after every roll |
| ENCRYPTION KEY | An Execute without a pair deals 10% damage |
| AI WATCHDOG | Dice showing 3 or less are absorbed |
| RATE LIMITER | Only your three highest dice score |
| PROXY WRAITH | Rebuilds 12% of its firewall after every Execute |
| RANSOMWARE VAULT | Every Execute costs 3 scrap; miss the fee and it halves the hit |
| SANDBOX | Your abilities have no charges on this node |
| REVENANT | The first time its firewall falls, it comes back at 40% |

Which one guards which server is shuffled from the run's seed. A fixed order
made a run predictable the second time you played it — you knew server 3 was
the WATCHDOG and could shop for it — so the order is drawn per seed instead,
a fresh shuffle for every eight servers, which means you meet all eight before
you meet any of them twice. Two players racing the same seed still meet the
same protocols in the same places, and a tournament host can ban any of them.

**An archive of what you have met.** ARCHIVE on the start screen lists every
die, ability, cyberartifact and edition in the game, with the ones this device
has come across filled in and the rest left as a dashed slot with a question
mark on it. Being offered something in the black market counts, bought or not:
what is worth remembering is that the thing exists. It is kept in the browser
like the profile is, because it is a record of what you have played rather than
a score anyone competes on — so it never goes near the shared board, and two
people on one machine share one archive.

**Corporations with personalities.** Each server belongs to a corp that names
its own nodes and talks back: OMNIDYNE files your intrusion as a learning
opportunity, HELIX CAPITAL calls your best hit a rounding error, NULLSEC
ORBITAL cannot find anyone who cares, and ARCHON AI has already simulated you
losing. They greet you, sneer at a feeble Execute, sound rattled by a big one,
and get a parting line when they lose a node, lose the server, or trace you.

**A soundtrack, and a voice for every boss.** The music is a step sequencer
built on the same two synth voices as the sound effects, playing on its own
quieter bus under a held pad, with a fill every fourth bar. It follows tension
rather than location: the market is warm, an ordinary node is steady, a boss is
lower and faster, and one execute left drops everything for a pulse. Moods
change on the bar line, never mid-phrase. Each boss protocol also has its own
sound — a scanner rejecting a die, a valve slamming shut, a vault counting your
scrap out — so a rule firing is recognisable without reading the log.

**The market is a popup, not a column.** The black market used to sit in the
toolkit, permanently on screen and greyed out for most of a run, which is a lot
of space for something you use between nodes. Now it opens over the board the
moment a node is breached, on every layout, and closes when the next node
starts. Escape, the backdrop, CLOSE or breaching the next node all get out of
it, and OPEN MARKET brings it back — but only between nodes: during a fight
there is no market, so there is no button offering one. The toolkit keeps what
the market is not — your dice pool, your abilities and your cyberartifacts —
with BREACH NODE below it rather than buried inside.

**The MIRROR DIE has no face of its own.** It rolls blank, stays blank through
the tumble, and then takes the highest value on the board: a line of marching
dashes runs from the die it is copying, that die gets brackets around it, and
the mirror flashes as the value lands on it. Change what the highest die is —
reroll, BIT SHIFT, CLONE, lock something out of a throw — and the mirror
follows within the frame, because the board watches what it is copying rather
than waiting to be told. A mirror that ends up copying a d20 wears two digits
instead of pips, since there is no such thing as nineteen pips.

**Boss cutscenes.** A protocol coming online stops the game and introduces
itself: its portrait animated by the same painter that draws it in the fight,
its name, the rule it is about to enforce, and a line of its own. Any key or
click dismisses it, and it clears itself after a few seconds.

**A tutorial that gets out of the way.** A first run is coached by rings around
the control that matters and one line about why. Each step clears itself the
moment the player does the thing, so anyone who already knows never waits for
it, and SKIP ends it for good. The menu can bring it back.

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
when it ends. With the shared board deployed, that race is between devices —
everyone in the room watches the same lobby from their own phone.

Without it, boards live on the device that played them: a runner copies their
result code after a run and the host merges it into the board by hand.

**On a phone or tablet** the game is a full-screen app: the shell is pinned to
the viewport so nothing scrolls or rubber-bands, zoom is off so a mistimed
double tap cannot wreck a roll, and the two panels that are not needed moment to
moment — the console log and the rig — become sheets that slide up over the
board. The market is the same popup it is everywhere else, filling the screen
because that is where the player is. There is a FULL button for real full
screen where the browser offers it, and adding the game to a home screen
removes the browser chrome entirely on iOS.

### Running it for several people

If the shared board is deployed (see [worker/](worker/)), everyone can simply
open the published site on their own phone and they are already on the same
leaderboard and in the same lobby.

To run it off your own machine instead, serve on the network rather than on
localhost, and the QR code carries a link that opens the game and joins the
tournament in one scan:

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
| `tools/audio-test.html` | The music and the sound effects, rendered into an `OfflineAudioContext` and measured: that every mood produces signal, that effects sit above the music, that each boss sound is audible, that nothing clips, and that mute means silence. A browser without a sound card never starts its audio clock, so this is the only way to check audio without ears. |
| `tools/fit-test.html` | The layout, at whatever size the window is: that nothing scrolls, that the app fits the viewport, that the board keeps room, and that the sheets park off screen and slide back in. Open it on a device, or resize the browser — the window size is the input. |

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
                        for the start screen and boards, and mobile.css for the
                        full-screen touch layout
  core/                 dependency-free helpers: math, random, seeded random,
                        bit packing, format, storage, settings, speed-aware sleep
  data/                 the game as data: dice, artifacts, artifact editions,
                        abilities, bosses, corps, nodes, difficulty tiers,
                        icons, tuning, effects
  audio/                synth.js (two voices, two buses), sfx.js (the sounds,
                        including one per boss) and music.js (the sequencer)
  engine/               dice-board.js — the 2.5D physics sandbox
  render/               canvas painters: sprites, the board, the enemy portrait,
                        and a small QR encoder
  game/                 rules and flow: state, scoring, turn, execute, shop,
                        session, boss-rules, voice, soundtrack, memory-leak,
                        difficulty, score, leaderboard, tournament, live-run,
                        save, archive
  services/             where persistence lives: store.js picks a backend,
                        local-store.js keeps boards in this browser,
                        remote-store.js talks to the shared one, config.js
                        is the single URL that decides which
  ui/                   the DOM: hud, log, fx, modals, screens, input, viewport,
                        sheets, market, tutorial, and the start screen with its
                        leaderboard, live board, archive and tournament views
assets/                 favicons and the social card the site links to
worker/                 the shared board: a Cloudflare Worker over one KV
                        namespace, and how to deploy it
tools/                  test pages, a no-cache dev server, and the press tools:
                        poster.html, trailer.html, social-card.html, icon.html,
                        capture_server.py, trailer-music.py
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

A die may also declare `retriggers`, which scores it a second time, and an
ability may arm a ×Mult on the coming Execute rather than touching the dice.

Adding content is a catalog entry plus, for artifacts and abilities, an 8×8 icon
in `src/data/icons.js`. Nothing else changes — including the tournament ban
screens, which are generated from the catalogs. Artifacts that need behaviour
outside scoring are marked `passive: true` with a comment pointing at the code
that implements them.

**Bosses are hooks, not special cases.** A boss declares any of `onNodeStart`,
`onSettled`, `absorbs`, `scoringDice`, `multiplier`, `afterExecute` and
`survivesBreach`, and `game/boss-rules.js` is the only place that asks for them.
Adding a ninth boss is an entry in `data/bosses.js` and a sprite painter in
`render/enemy-sprites.js`; no flow code changes, and the tournament ban list and
the code format pick it up on their own. (The code format is versioned for
exactly that reason: more bosses means more ban bits, so `CODE_VERSION` moved to
2 and codes made before that no longer decode.)

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

**The touch layout is one media query.** `styles/mobile.css` takes over below
1120px or on any coarse pointer: the shell is fixed to the viewport, the log and
toolkit panels become bottom sheets, and controls grow to thumb size. No markup
moves — `ui/sheets.js` only toggles two classes on `<body>`. The height comes
from `--app-height`, measured in `ui/viewport.js`, because a phone's `100vh`
counts browser chrome that is not there.

**Music is scheduled, not played.** `audio/music.js` writes notes a fraction of
a second ahead of the audio clock on a 25ms timer, so the beat does not wobble
when the game loop is busy scoring. A mood is a bar of sixteenths — which steps
get a kick, a hat, a bass note, an arpeggio note, a held pad — and
`game/soundtrack.js` maps the run to one, as a pure function that can be tested
without any audio.

**The synth can render offline.** `initAudio()` takes a context, so the whole
graph can be built on an `OfflineAudioContext` and rendered to samples. That is
how the mix is checked: music peaks around 0.22, effects around 0.44, each boss
sound between those, nothing clipping. Guessing at levels by ear is how a game
ends up inaudible on someone else's machine.

**The tutorial follows the run.** `ui/tutorial.js` is driven from the HUD's
repaint rather than driving the game itself, so it cannot get out of step with
what is on screen. Each step declares when it is relevant and when it is done;
a step whose moment has passed clears itself rather than waiting.

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

## Hosting

The game is live at **https://hackthedice.zanix.tech**, published from `main` by
[.github/workflows/pages.yml](.github/workflows/pages.yml). The repository is
the site — there is no build step — so the workflow uploads the checkout as-is
and GitHub Pages serves it. `CNAME` holds the custom domain and `.nojekyll`
keeps GitHub from running the files through Jekyll.

Three things had to be true once, and stay true:

1. **DNS.** A `CNAME` record for `hackthedice` pointing at `zaniixx.github.io.`
2. **Repository settings.** Settings → Pages → Source: **GitHub Actions**, with
   the custom domain set to `hackthedice.zanix.tech` and *Enforce HTTPS* ticked
   once the certificate is issued.
3. **The `CNAME` file stays in the repo root.** Deleting it unsets the domain on
   the next deploy.

Being on a real domain is what makes the tournament QR codes work off a local
network: a scanned code opens `https://hackthedice.zanix.tech/#join=…` on any
phone, anywhere, and the rules travel with it.

`press/` is gitignored, so the trailer and poster are not published with the
site — they belong on the jam page. Remove `/press` from `.gitignore` if you
want to link them directly.

### After a deploy

GitHub Pages sends `Cache-Control: max-age=600`, so a browser that was on the
site within ten minutes of a deploy can end up holding a mix of old and new
modules. The page catches that and says so rather than showing a black screen;
a hard refresh clears it.

## Press kit

`press/` holds the jam material — a 30-second 1080p trailer, a looping GIF, the
poster at two sizes, and the soundtrack — plus a README with the blurb and the
commands to rebuild any of it. It is all generated from the game: the trailer's
dice are thrown by the real physics and drawn by the real renderer, and the
bosses, threat levels and QR code are read from the catalogs, so the press
material cannot drift from the game.

The tools that make it live in `tools/`: `poster.html`, `trailer.html`,
`capture_server.py` (which the trailer posts frames to) and `trailer-music.py`
(a chiptune generator built on the standard library).

## Where this came from

This is a restructured version of a single-file HTML artifact: one `index.html`
holding ~220 lines of CSS and ~830 lines of JavaScript in one IIFE. The core
game's behaviour, balance and save format are unchanged; the start screen,
threat levels, leaderboards and tournaments were added on top. Republishing it
as a single-file artifact again would need a bundling step, which this project
deliberately does not have.
