/**
 * A turn at a node: roll, lock, reroll, bend the dice with abilities.
 *
 * Everything here happens before the player commits. The moment they execute,
 * game/execute.js takes over.
 */
import { ABILITIES } from '../data/abilities.js';
import { gamePick } from '../core/game-random.js';
import { rerollsPerRoll } from './difficulty.js';
import { initAudio } from '../audio/synth.js';
import { sfx } from '../audio/sfx.js';
import { dice, throwDice, unlockAll, popDie } from '../engine/dice-board.js';
import { log } from '../ui/log.js';
import { toast } from '../ui/fx.js';
import { updateUI, resetScoreboard, showScorePreview } from '../ui/hud.js';
import { run, Phase } from './state.js';
import { applyScoringValues, eligibleDice, comboTags } from './scoring.js';

/** Throw the whole pool. Every roll starts a fresh set of rerolls. */
export function rollDice() {
  if (!run || run.phase !== Phase.READY) return;
  initAudio(); // the player just interacted: it is safe to start audio

  run.rerolls = rerollsPerRoll();
  run.overdrive = false;
  run.rolledOnce = true;
  unlockAll();
  resetScoreboard();

  throwDice(dice, { fullThrow: true });
  run.phase = Phase.ROLLING;
  updateUI();
}

/** Throw everything the player has not locked. */
export function rerollDice() {
  if (!run || run.phase !== Phase.MANIP) return;

  if (run.rerolls <= 0) {
    toast('NO REROLLS LEFT');
    sfx.buzz();
    return;
  }
  const loose = dice.filter(die => !die.locked);
  if (!loose.length) {
    toast('ALL DICE LOCKED');
    sfx.buzz();
    return;
  }

  run.rerolls--;
  // A reroll clears quarantine; ANTIVIRUS will pick a new victim on landing.
  for (const die of dice) die.quarantined = false;

  throwDice(loose, { fullThrow: false });
  run.phase = Phase.ROLLING;
  updateUI();
}

/** Called once the board has come to rest. Hands control back to the player. */
export function onDiceSettled() {
  if (run.phase !== Phase.ROLLING) return;
  run.phase = Phase.MANIP;

  if (run.enemy.boss === 'antivirus' && dice.length) {
    const victim = gamePick(dice);
    victim.quarantined = true;
    log(`> antivirus quarantined a die showing ${victim.value}`, 'red');
    sfx.buzz();
  }

  updateUI();
  refreshPreview();
}

/** Recompute what the board is currently worth and show it. */
export function refreshPreview() {
  if (!run || run.phase !== Phase.MANIP) return;

  applyScoringValues(dice);
  const values = eligibleDice(dice, run.enemy).map(die => die.scoringValue);
  const bitsTotal = values.reduce((total, value) => total + value, 0);
  showScorePreview(bitsTotal, comboTags(values));
}

/** Lock or unlock a die so the next reroll leaves it alone. */
export function toggleLock(die) {
  die.locked = !die.locked;
  die.lift = 3;
  sfx.lock(die.locked);
}

/** Fire an ability. A cancelled ability costs nothing. */
export function useAbility(id) {
  if (!run || !id) return;

  if (run.phase !== Phase.MANIP) {
    toast('ROLL FIRST, THEN USE ABILITIES');
    return;
  }
  if (!(run.charges[id] > 0)) {
    toast('NO CHARGES LEFT THIS NODE');
    sfx.buzz();
    return;
  }

  const cancelled = ABILITIES[id].use({ dice, run, log, notify: toast, popDie }) === false;
  if (cancelled) {
    sfx.buzz();
    return;
  }

  run.charges[id]--;
  sfx.zap();
  updateUI();
  refreshPreview();
}
