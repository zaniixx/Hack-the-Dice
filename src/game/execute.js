/**
 * The execute: turning a settled board into damage.
 *
 * The pipeline is deliberately slow and ordered, because the order is the game.
 * Effects are applied one at a time and each is animated on its way to the
 * scoreboard, so a player can watch a build pay out and understand why.
 *
 *   1. each die scores Bits, plus whatever its type adds
 *   2. artifacts with a perDie hook fire alongside each die
 *   3. RECURSIVE LOOP retriggers the best die
 *   4. artifacts add flat bonuses
 *   5. dice that carry a late ×Mult (AMP, QUBIT) resolve
 *   6. artifacts apply ×Mult
 *   7. OVERDRIVE, then the boss's cipher shield
 *   8. Bits × Mult lands on the firewall
 *
 * Nothing here touches the DOM: ui/execute-view.js does the showing.
 */
import { fmt, fmtM } from '../core/format.js';
import { sleep, rawSleep } from '../core/time.js';
import { DICE } from '../data/dice.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { EffectType, bits, xMult } from '../data/effects.js';
import { MEMORY_LEAK_RATE } from '../data/rules.js';
import { sfx } from '../audio/sfx.js';
import { dice, unlockAll } from '../engine/dice-board.js';
import { flashEnemyHit } from '../render/enemy-view.js';
import { log } from '../ui/log.js';
import { shakeApp } from '../ui/fx.js';
import { updateUI, updateFirewall, resetScoreboard } from '../ui/hud.js';
import { executeView, Source } from '../ui/execute-view.js';
import { run, Phase, hasArtifact } from './state.js';
import { applyScoringValues, isAbsorbed, allowedDice } from './scoring.js';
import { startLeak, isLeakDraining } from './memory-leak.js';
import { breachNode, traced } from './session.js';
import { bossMultipliers, bossAfterExecute, bossSurvivesBreach } from './boss-rules.js';
import { corpSays } from './voice.js';

/** A hit worth at least this share of the firewall shakes the console. */
const SHAKE_THRESHOLD = 0.15;

/**
 * The running total for one execute, and the context artifacts read.
 *
 * `pending` collects the flight animations: the pipeline waits for all of them
 * before reading the final numbers, so nothing is totalled while still in the air.
 */
function createTally() {
  return {
    bits: 0,
    mult: 1,
    scored: [],
    firstExecute: run.firstExecute,
    run,
    pending: [],
    lateMultipliers: [],
  };
}

/** Apply one effect to the tally and launch its animation. */
function applyEffect(tally, effect, source) {
  let total;
  if (effect.type === EffectType.BITS) {
    tally.bits += effect.value;
    total = tally.bits;
  } else if (effect.type === EffectType.MULT) {
    tally.mult += effect.value;
    total = tally.mult;
  } else {
    tally.mult *= effect.value;
    total = tally.mult;
  }
  tally.pending.push(executeView.flyEffect(effect, source, total));
}

/** Score one die: its value, its own special effect, then the perDie artifacts. */
async function scoreDie(die, tally, index) {
  // Later dice resolve faster, so a big pool does not drag.
  const delay = Math.max(120, 320 - index * 28);
  const def = DICE[die.type];

  executeView.highlightDie(die, index);
  applyEffect(tally, bits(die.scoringValue), Source.die(die));

  for (const effect of def.onScore?.(die) || []) {
    await sleep(delay * 0.4);
    applyEffect(tally, effect, Source.die(die));
  }

  // Dice that multiply wait until the flat bonuses are in.
  const late = def.lateMultiplier?.(die);
  if (late) tally.lateMultipliers.push({ die, value: late });

  for (const id of run.artifacts) {
    const artifact = ARTIFACTS[id];
    if (!artifact.perDie) continue;
    for (const effect of artifact.perDie(tally, die)) {
      await sleep(delay * 0.45);
      executeView.pulseArtifact(id);
      applyEffect(tally, effect, Source.artifact(id));
    }
  }

  await sleep(delay * 0.6);
}

/** Run one artifact hook across every installed artifact, in slot order. */
async function runArtifactPhase(tally, hook, pause) {
  for (const id of run.artifacts) {
    const artifact = ARTIFACTS[id];
    if (!artifact[hook]) continue;
    for (const effect of artifact[hook](tally)) {
      executeView.pulseArtifact(id);
      applyEffect(tally, effect, Source.artifact(id));
      await sleep(pause);
    }
  }
}

/** Whatever the boss protocol does to the finished payload. */
async function applyBossRule(tally) {
  const effects = bossMultipliers(tally);
  for (const effect of effects) {
    applyEffect(tally, effect, Source.enemy());
    await sleep(260);
  }
  if (effects.length) await sleep(120);
}

/** Score every die on the board, skipping the ones the boss took out. */
/** The boss's own sound for turning a die away. */
const REFUSAL_SOUND = {
  QUARANTINED: () => sfx.quarantine(),
  ABSORBED: () => sfx.absorb(),
  'RATE LIMITED': () => sfx.throttle(),
};

/** Why a die is not allowed to score, or null when it is. */
function refusalFor(die, enemy, allowed) {
  if (die.quarantined) return 'QUARANTINED';
  if (isAbsorbed(die, enemy)) return 'ABSORBED';
  if (!allowed.has(die)) return 'RATE LIMITED';
  return null;
}

async function scoreBoard(tally, enemy) {
  let index = 0;
  const allowed = allowedDice(dice, enemy);

  // Left to right, so the payout reads in the order the dice are laid out.
  for (const die of [...dice].sort((a, b) => a.x - b.x)) {
    const refusal = refusalFor(die, enemy, allowed);
    if (refusal) {
      executeView.rejectDie(die, refusal);
      REFUSAL_SOUND[refusal]();
      await sleep(refusal === 'QUARANTINED' ? 280 : 240);
      continue;
    }
    tally.scored.push(die);
    await scoreDie(die, tally, index++);
  }

  if (hasArtifact('recursive') && tally.scored.length) {
    const best = tally.scored.reduce((a, b) => (b.scoringValue > a.scoringValue ? b : a));
    executeView.pulseArtifact('recursive');
    executeView.announceDie(best, 'LOOP');
    await sleep(220);
    await scoreDie(best, tally, index++);
  }
}

/** Land the payload on the firewall and record the damage. */
async function landPayload(tally, enemy) {
  const total = Math.floor(tally.bits * tally.mult);
  executeView.showTotals(tally.bits, tally.mult, total);

  // Chord thickness tells the player how close this came to a breach.
  const ratio = total / Math.max(1, enemy.hp);
  sfx.chord(ratio >= 1 ? 3 : ratio >= 0.5 ? 2 : ratio >= 0.2 ? 1 : 0);
  await executeView.slamTotal(total);

  const before = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - total);
  run.stats.dmg += before - enemy.hp;
  run.stats.biggest = Math.max(run.stats.biggest, total);

  flashEnemyHit();
  sfx.hit();
  if (total >= enemy.max * SHAKE_THRESHOLD) shakeApp();
  executeView.showDamage(total);
  updateFirewall();
  log(`> ${fmt(tally.bits)} bits × ${fmtM(tally.mult)} mult = ${fmt(total)} hacking power`, 'amber');

  // The corp has opinions about how that went.
  const share = total / Math.max(1, enemy.max);
  if (share < 0.05) corpSays('weak', { always: false });
  else if (share >= 0.35) corpSays('hurt', { always: false });

  return total;
}

/** Out of executes: give MEMORY LEAK its chance before the trace lands. */
async function waitForLeak() {
  run.phase = Phase.LEAK_WAIT;
  updateUI();
  log('> no executes left: memory leak still draining...', 'amber');

  while (isLeakDraining() && run.enemy.hp > 0 && run.phase === Phase.LEAK_WAIT) {
    await rawSleep(100);
  }
  // The leak may have breached the node, which moves the phase on without us.
  return run.phase === Phase.LEAK_WAIT && run.enemy.hp > 0;
}

async function resolveExecute() {
  applyScoringValues(dice);
  const enemy = run.enemy;
  const tally = createTally();

  resetScoreboard();
  log(`> execute ${run.maxExecutes - run.executes + 1}: injecting payload`, 'white');

  await scoreBoard(tally, enemy);
  await runArtifactPhase(tally, 'bonus', 230);

  for (const late of tally.lateMultipliers) {
    late.die.flash = 1;
    applyEffect(tally, xMult(late.value), Source.die(late.die));
    await sleep(230);
  }

  await runArtifactPhase(tally, 'multiplier', 260);

  if (run.overdrive) {
    applyEffect(tally, xMult(2, 'OVERDRIVE ×2'), Source.abilities());
    await sleep(260);
  }
  if (enemy.boss) await applyBossRule(tally);

  // Every effect has to have landed before the totals mean anything.
  await Promise.all(tally.pending);

  const total = await landPayload(tally, enemy);

  // A boss gets the last word on its own firewall: PROXY WRAITH rebuilds it,
  // REVENANT refuses the killing blow once.
  bossAfterExecute();
  const clungOn = bossSurvivesBreach();
  if (clungOn) {
    shakeApp();
    executeView.announceEnemy('RESTORED', 'c-red');
  }
  updateFirewall();

  run.firstExecute = false;
  run.overdrive = false;
  if (hasArtifact('memleak') && total > 0) startLeak(total * MEMORY_LEAK_RATE);
  run.executes--;
  unlockAll();

  if (enemy.hp <= 0) {
    await sleep(200);
    await breachNode();
    return;
  }

  if (run.executes <= 0) {
    if (hasArtifact('memleak') && isLeakDraining()) {
      const stillAlive = await waitForLeak();
      if (!stillAlive) return;
    }
    await traced();
    return;
  }

  const percent = Math.ceil((enemy.hp / enemy.max) * 100);
  const plural = run.executes > 1 ? 's' : '';
  log(`> firewall at ${percent}%: ${run.executes} execute${plural} left`,
    run.executes === 1 ? 'red' : 'dim');

  run.phase = Phase.READY;
  updateUI();
}

/** Commit the board. Locks input until the payload has landed. */
export async function executePayload() {
  if (!run || run.phase !== Phase.MANIP) return;

  run.phase = Phase.SCORING;
  updateUI();
  try {
    await resolveExecute();
  } catch (error) {
    // A failed animation must never strand the player mid-execute.
    console.error(error);
    if (run.phase === Phase.SCORING) {
      run.phase = Phase.READY;
      updateUI();
    }
  }
}
