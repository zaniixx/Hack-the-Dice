# Hack the Dice

**A cyberpunk dice roguelike. It runs in a browser tab. There is nothing to install.**

### ▶ [hackthedice.zanix.tech](https://hackthedice.zanix.tech)

You are breaking into a corporation, and the only thing you have is dice.

Roll a pool of them at a firewall. Keep the ones you like, throw the rest again,
and when you are done, execute: everything you kept turns into **Bits**, your
gear turns that into a **Mult**, and Bits × Mult is how hard the firewall gets
hit. Breach five nodes and something is waiting at the fifth. Beat it and you
move to a deeper server, keeping the rig you have built, against a firewall that
has grown faster than you have.

Then it traces you, because it always does. The only question is how far you got
first.

---

## A run

**Roll.** Five dice to start, up to eight if you buy them. You get a couple of
rerolls, and locking a die keeps it out of the throw — the whole game is deciding
which half of a bad roll is worth keeping.

**Execute.** Your dice pay out one at a time, left to right, and so does your
rig. The number at the end is what lands on the firewall. You only get a few
executes per node, so a wasted one is real.

**Shop.** Breach a node and the black market opens: new dice, one-shot
abilities, and cyberartifacts that rewrite how scoring works. Scrap is tight and
slots are tighter.

**Repeat, four times.** Then node five, where a boss protocol is waiting.

**Migrate.** Beat it and the next server opens — better gear on sale, and
firewalls that pulled ahead while you were shopping.

Somewhere in there it catches you. Your score banks either way, so walking away
from a good run counts the same as being dragged out of a bad one.

---

## What you are building with

**Nineteen dice.** The ordinary ones just get bigger, d6 up to a fifty-sided
monster. The interesting ones do not. The **MIRROR DIE** rolls blank and copies
the highest thing on the board. The **CHRONO DIE** scores twice. The **QUBIT**
and the **NOVA** multiply instead of adding.

And then there is the stuff off a desk, which is cheap and strange and usually
worse in one way that matters: a **TOSSED COIN** that only ever lands on 1 or 6,
an **AA BATTERY** that loses a face every node until it is spent, **CHEWED GUM**
that a reroll can only ever improve, a **LEGO BRICK** that pays nothing at all
unless it lands studs up.

**Twenty-six cyberartifacts**, and this is where runs are won or thrown away.
They pay out left to right and each one finishes before the next starts — so an
artifact that adds Mult is only multiplied by the ones sitting to its *right*.
Put BOTNET before QUANTUM CORE and five dice deal 240; swap them and the same
rig deals 140. You drag them into order yourself, and you can get it wrong.

Slots are scarce on purpose — five, and only four at the top difficulty — so the
market sweetens the deal by stamping some artifacts with an **edition**:

| Edition | What it adds |
| --- | --- |
| ENCRYPTED | +30 Bits, every Execute |
| OVERCLOCKED | +4 Mult, every Execute |
| PRISMATIC | ×1.5 Mult, every Execute |
| NEGATIVE | Brings its own slot |

**Fifteen abilities**, fired between the roll and the execute — the moment you
can see exactly how badly you need one.

---

## What is guarding it

Eight boss protocols. Each one breaks a different rule of the game:

| Protocol | What it does to you |
| --- | --- |
| **ANTIVIRUS** | Quarantines one die after every roll |
| **ENCRYPTION KEY** | An Execute without a pair deals 10% damage |
| **AI WATCHDOG** | Eats every die showing 3 or less |
| **RATE LIMITER** | Only your three highest dice count |
| **PROXY WRAITH** | Rebuilds 12% of its firewall after every Execute |
| **RANSOMWARE VAULT** | Every Execute costs scrap; miss the fee and it halves the hit |
| **SANDBOX** | Your abilities have no charges here |
| **REVENANT** | Comes back at 40% the first time you kill it |

Which one guards which server is shuffled per run, so you cannot shop for the
one you know is coming. You will meet all eight before you meet any of them
twice.

Behind them are six corporations, and they talk back. OMNIDYNE files your
intrusion as a learning opportunity. HELIX CAPITAL calls your best hit a
rounding error. NULLSEC ORBITAL cannot find anyone who cares. ARCHON AI has
already simulated you losing.

---

## How hard do you want it

| | |
| --- | --- |
| **SCRIPT KIDDIE** | Borrowed exploits, copied from a forum. Loud, lucky, mostly harmless. |
| **PEN TESTER** | Authorised, methodical, and on the clock. The standard engagement. |
| **BLACK HAT** | No authorisation, no safety net, and a market that smells desperation. |
| **NATION STATE** | Advanced persistent threat. Unlimited budget, zero margin for error. |

It is not only bigger numbers. A tier changes how many executes you get, how
many rerolls, how many artifact slots, what the market charges, and how fast
firewalls grow. By the deep servers the gap between the top and the bottom is
about ten to one.

---

## Playing against other people

**Leaderboards.** Every run banks a score under your handle. Boards are split by
threat level, so a NATION STATE run is not competing with a tourist.

**Tournaments.** Set a threat level, optionally fix a seed so everyone rolls
identical dice, and ban whatever you like — bosses, dice, artifacts, abilities.
You get back a five-character code to read out, a QR code to hold up, and a link
to paste. All three are the same tournament, because the rules travel inside the
code itself. Scan it with a phone camera and you are in; nothing gets typed.

**The lobby is a race.** A tournament run publishes itself while it is being
played, so the board shows runs in progress next to finished ones, ranked by
what they would score right now. Rows shuffle as people climb past each other.
Everyone in the room watches the same board from their own phone.

**Seeded runs.** Every run has a seed, shown in the top bar and copyable with a
click. Paste one in to replay a run exactly — same dice, same nodes, same shop
offers — or leave it blank and take what you are given.

---

## It is still being built

It is `v0.x` for a reason. Things are unbalanced, things are missing, and some
of it is probably annoying in ways I cannot see any more, because I have played
it a thousand times and you have not.

**So play a run, then tell me what is wrong with it.** That is genuinely the
most useful thing anyone can do with it right now.

[Open an issue](https://github.com/zaniixx/Hack-the-Dice/issues/new), or say it
however you like. Bugs, balance, "this bit is boring", "I had no idea what to do
on the second screen" — all of it helps, and the vague ones often help most.

---

<sub>Built by **zaniix** — Abdullah M Radhi. No engine, no assets, no
dependencies: every sprite is painted pixel by pixel and every sound is
synthesised as it plays. If you want to know how: the build notes are in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and the diagrams are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).</sub>

<sub>Copyright © 2026 zaniixx. All rights reserved — see [LICENSE](LICENSE). The
repository is public so the game can be played and the code read, not so it can
be reused.</sub>
