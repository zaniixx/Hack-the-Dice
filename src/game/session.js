/**
 * The run lifecycle: starting, resuming, loading a node, breaching it, moving
 * up a server, and being traced.
 *
 * This is the module that decides what happens next; the rest of game/ handles
 * one step of it.
 */
import { fmt } from '../core/format.js';
import { sleep } from '../core/time.js';
import { pick } from '../core/random.js';
import {
  BOSS_NODE, MIN_DICE, CACHE_SCRAP_BONUS, INTEREST_PER_SCRAP, MAX_INTEREST,
} from '../data/rules.js';
import {
  BOSSES, NODE_NAMES, NODE_SPRITES, SERVER_COLORS, corpName,
} from '../data/enemies.js';
import { difficultyOf } from '../data/difficulty.js';
import { ABILITIES, isKnownAbility } from '../data/abilities.js';
import { isKnownArtifact, artifactsStackingOn } from '../data/artifacts.js';
import { isKnownDie, STARTING_DICE } from '../data/dice.js';
import { definitionOf } from '../data/catalog.js';
import { initAudio } from '../audio/synth.js';
import { sfx } from '../audio/sfx.js';
import { setDicePool } from '../engine/dice-board.js';
import {
  resetEnemyView, markEnemyDestroyed, explodeEnemy,
} from '../render/enemy-view.js';
import { els } from '../ui/dom.js';
import { log, clearLog } from '../ui/log.js';
import { fly, centerOf, bump, shakeApp, flashAlarm, clearAlarm } from '../ui/fx.js';
import { updateUI, resetScoreboard, setEnemyOverlay } from '../ui/hud.js';
import { hideModal } from '../ui/modal.js';
import { showMenuScreen, showMigrationScreen, showTracedScreen } from '../ui/screens.js';
import { openStartScreen, rememberResult } from '../ui/start-screen.js';
import { run, Phase, createRun, hasArtifact, isBusy } from './state.js';
import { saveRun, loadSavedRun, clearSavedRun, loadBest, recordBest } from './save.js';
import { openShop, generateShop } from './shop.js';
import { resetLeak, stopLeak } from './memory-leak.js';
import { firewallHP, executesPerNode } from './difficulty.js';
import { bossForNode, setActiveTournament, decodeTournament } from './tournament.js';
import { submitRun } from './leaderboard.js';
import { runScore } from './score.js';

/** Grow every artifact that counts this kind of event. */
function advanceStacks(event) {
  for (const id of artifactsStackingOn(event)) {
    if (hasArtifact(id)) run.stacks[id] = (run.stacks[id] || 0) + 1;
  }
}

/**
 * Build the target for the current server and node.
 *
 * Node 5 is guarded by a boss protocol — unless a tournament banned every one
 * of them, in which case it is an ordinary node with a boss-sized firewall.
 */
function createEnemy() {
  const bossKey = run.node === BOSS_NODE ? bossForNode(run.server) : null;
  const max = firewallHP(run.server, run.node);

  return {
    name: bossKey ? BOSSES[bossKey].name : pick(NODE_NAMES),
    hp: max,
    max,
    boss: bossKey,
    sprite: bossKey ? BOSSES[bossKey].sprite : pick(NODE_SPRITES),
    color: SERVER_COLORS[(run.server - 1) % SERVER_COLORS.length],
  };
}

/** Load the current node and hand control to the player. */
export function beginNode() {
  run.enemy = createEnemy();

  run.executes = executesPerNode() + (hasArtifact('ghost') ? 1 : 0);
  run.maxExecutes = run.executes;
  run.rerolls = 0;
  run.charges = {};
  for (const id of run.abilities) run.charges[id] = ABILITIES[id].charges;

  run.firstExecute = true;
  run.overdrive = false;
  run.rolledOnce = false;
  run.shop = [];
  run.phase = Phase.READY;

  resetLeak();
  resetEnemyView();
  setEnemyOverlay('');
  setDicePool(run.dice);
  resetScoreboard();

  const enemy = run.enemy;
  log(`> connecting to ${corpName(run.server)}::${enemy.name}`, 'dim');
  if (enemy.boss) {
    log(`> !! security protocol online: ${enemy.name}`, 'red');
    log(`> ${BOSSES[enemy.boss].rule}`, 'red');
    sfx.alarm();
  }
  log(`> firewall integrity ${fmt(enemy.max)} — ${run.executes} executes before trace`, 'cyan');

  saveRun();
  updateUI();
}

/** Scrap paid out for a breach, before interest. */
function breachReward(wasBoss) {
  // Deeper nodes pay more, bosses pay a bounty, and every unused execute pays 2.
  const base = 4 + run.node + (wasBoss ? 10 : 0);
  const unusedExecutes = run.executes * 2;
  const serverScale = 1 + 0.5 * (run.server - 1);

  const reward = Math.round((base + unusedExecutes) * serverScale);
  return hasArtifact('cache') ? Math.round(reward * CACHE_SCRAP_BONUS) : reward;
}

/** The firewall is down: blow up the target and pay the player. */
export async function breachNode() {
  if (run.phase === Phase.BREACH) return;
  run.phase = Phase.BREACH;
  stopLeak();

  explodeEnemy();
  sfx.breach();
  setTimeout(() => sfx.chord(3), 120);
  shakeApp();
  setEnemyOverlay('BREACHED');
  updateUI();

  run.stats.nodes++;
  advanceStacks('breach');

  const wasBoss = !!run.enemy.boss;
  log(`> ${run.enemy.name} breached`, 'lime');

  const reward = breachReward(wasBoss);
  const interest = Math.min(MAX_INTEREST, Math.floor(run.scrap / INTEREST_PER_SCRAP));
  const total = reward + interest;

  const unused = run.executes;
  const executeBonus = unused
    ? `, including a bonus for ${unused} unused execute${unused > 1 ? 's' : ''}`
    : '';
  const interestNote = interest ? `, ${interest} interest` : '';
  log(`> harvested ${total} data scrap${executeBonus}${interestNote}`, 'amber');

  await sleep(600);
  run.scrap += total;
  run.stats.scrap += total; // banked for the leaderboard score
  await fly(`+${total} SCRAP`, centerOf(els.enemyCanvas), centerOf(els.scrap), { cls: 'c-x', dur: 800 });
  sfx.coin();
  updateUI();
  bump(els.scrap);

  if (wasBoss) {
    await sleep(400);
    migrateServer();
    return;
  }
  run.node++;
  openShop();
}

/** A boss fell: move the run up to the next, harder server. */
function migrateServer() {
  const previousCorp = corpName(run.server);
  run.server++;
  run.node = 1;
  advanceStacks('migration');
  recordBest();
  sfx.boot();

  // The new server opens in its market, so the player can spend before diving in.
  run.phase = Phase.SHOP;
  run.shopRefreshes = 0;
  generateShop();
  setDicePool(run.dice);
  saveRun();
  updateUI();

  showMigrationScreen({
    fromCorp: previousCorp,
    server: run.server,
    onContinue: () => log(`> migration complete: ${corpName(run.server)} online`, 'mag'),
  });
}

/** Out of executes: the trace lands and the run ends. */
export async function traced() {
  run.phase = Phase.OVER;
  updateUI();

  sfx.alarm();
  flashAlarm();
  log('> trace complete: connection severed', 'red');

  const isBest = recordBest();
  clearSavedRun();
  const result = await bankRun('traced');

  // Let the alarm play before the verdict.
  setTimeout(() => showRunOver({ ...result, isBest }), 1100);
}

/**
 * Put the run on the leaderboards.
 *
 * Both endings bank: dying and walking away score the same, so a good run is
 * never lost to a player who would rather stop than be traced.
 */
async function bankRun(reason) {
  log(`> run banked: ${fmt(runScore(run))} points for ${run.handle}`, 'amber');
  const result = await submitRun(run, { reason });
  rememberResult(result.entry); // so the player can hand its code to a host
  return result;
}

/** The run-over screen, with where the score placed. */
function showRunOver({ entry, rank, tournamentRank, isBest = false }) {
  showTracedScreen({
    server: run.server,
    node: run.node,
    stats: run.stats,
    isBest,
    entry,
    rank,
    tournamentRank,
    tournament: run.tournament,
    onRestart: showTitle,
    onLeaderboard: () => showTitle(run.tournament ? 'tournaments' : 'leaderboard'),
  });
}

/**
 * Walk away from a run in progress. The score still counts, and the player is
 * returned to the start screen to pick a name and a threat level again.
 */
export async function abandonRun() {
  const worthBanking = run && (run.stats.nodes > 0 || run.stats.dmg > 0);
  if (worthBanking) await bankRun('abandoned');

  clearSavedRun();
  run.phase = Phase.OVER;
  showTitle();
}

/**
 * Begin a run.
 *
 * @param {object} options
 * @param {string} options.handle      the runner's name, shown on the boards
 * @param {string} options.difficulty  threat level id
 * @param {?object} options.tournament tournament to play under, or null
 */
export function startNewRun({ handle, difficulty, tournament = null } = {}) {
  hideModal();
  clearSavedRun();
  setActiveTournament(tournament);
  createRun({ handle, difficulty, tournament });
  clearLog();
  clearAlarm();

  initAudio();
  sfx.boot();
  log(`> handshake accepted. welcome back, ${run.handle}.`, 'mag');
  log(`> threat level: ${difficultyOf(run.difficulty).name}`, 'cyan');
  if (tournament) log(`> tournament rules in force: ${tournament.name}`, 'amber');
  log('> tip: lock high dice, reroll low ones, then execute.', 'dim');
  beginNode();
}

/**
 * Restore a saved run.
 *
 * Anything the catalogs no longer recognise is dropped, so a save from an older
 * build loads instead of breaking.
 */
export function resumeRun(saved) {
  // Saves written before threat levels existed resume on the default tier.
  setActiveTournament(saved.tournament ? decodeTournament(saved.tournament.code) : null);
  createRun({
    handle: saved.handle,
    difficulty: saved.difficulty,
    tournament: saved.tournament,
  });
  clearLog();

  Object.assign(run, {
    server: saved.server,
    node: saved.node,
    scrap: saved.scrap,
    dice: saved.dice.filter(isKnownDie),
    artifacts: (saved.artifacts || []).filter(isKnownArtifact),
    abilities: (saved.abilities || []).filter(isKnownAbility),
    stacks: saved.stacks || {},
    stats: saved.stats || run.stats,
  });
  if (run.dice.length < MIN_DICE) run.dice = STARTING_DICE.slice(0, MIN_DICE);

  log(`> session restored: ${corpName(run.server)}`, 'mag');

  if (saved.at !== 'shop') {
    beginNode();
    return;
  }

  run.shop = (saved.shop || []).filter(item => definitionOf(item));
  if (!run.shop.length) generateShop();
  run.phase = Phase.SHOP;
  run.enemy = null;
  resetEnemyView();
  setEnemyOverlay('');
  markEnemyDestroyed(); // no target yet: show the empty socket, not a portrait
  setDicePool(run.dice);
  updateUI();
  log('> black market uplink open.', 'mag');
}

/** The arcade start screen: sign in, pick a threat level, or browse boards. */
export function showTitle(view) {
  openStartScreen({
    view,
    saved: loadSavedRun(),
    best: loadBest(),
    onStart: startNewRun,
    onResume: resumeRun,
  });
}

/** The in-game menu: the rules, and a way out of a run. */
export function openMenu() {
  const busy = isBusy();
  showMenuScreen({
    busy,
    canRestart: !busy && run.phase !== Phase.TITLE,
    onRestart: abandonRun,
  });
}
