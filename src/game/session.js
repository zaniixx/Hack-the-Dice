/**
 * The run lifecycle: starting, resuming, loading a node, breaching it, moving
 * up a server, and being traced.
 *
 * This is the module that decides what happens next; the rest of game/ handles
 * one step of it.
 */
import { fmt } from '../core/format.js';
import { sleep } from '../core/time.js';
import { gamePick, seedRun, restoreRng } from '../core/game-random.js';
import {
  BOSS_NODE, MIN_DICE, CACHE_SCRAP_BONUS, INTEREST_PER_SCRAP, MAX_INTEREST,
} from '../data/rules.js';
import { NODE_SPRITES } from '../data/enemies.js';
import { BOSSES } from '../data/bosses.js';
import { corpFor, corpName, serverColor } from '../data/corps.js';
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
import { maybeStartTutorial, startTutorial } from '../ui/tutorial.js';
import { showBossCutscene } from '../ui/cutscene.js';
import { run, Phase, createRun, hasArtifact, isBusy } from './state.js';
import { saveRun, loadSavedRun, clearSavedRun, loadBest, recordBest } from './save.js';
import { openShop, generateShop } from './shop.js';
import { resetLeak, stopLeak } from './memory-leak.js';
import { startLiveRun, publish as publishLiveRun, stopLiveRun } from './live-run.js';
import { firewallHP, executesPerNode } from './difficulty.js';
import { bossForNode, setActiveTournament, decodeTournament } from './tournament.js';
import { submitRun } from './leaderboard.js';
import { bossOnNodeStart } from './boss-rules.js';
import { corpSays, corpLine } from './voice.js';
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
    name: bossKey ? BOSSES[bossKey].name : gamePick(corpFor(run.server).nodes),
    hp: max,
    max,
    boss: bossKey,
    sprite: bossKey ? BOSSES[bossKey].sprite : gamePick(NODE_SPRITES),
    color: serverColor(run.server),
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
    showBossCutscene({ boss: BOSSES[enemy.boss], enemy, server: run.server });
  }
  log(`> firewall integrity ${fmt(enemy.max)} — ${run.executes} executes before trace`, 'cyan');

  // The protocol sets its own terms before anyone rolls.
  bossOnNodeStart();
  // A corp introduces itself once per server, not once per node.
  if (run.node === 1) corpSays('greet');

  saveRun();
  publishLiveRun(); // the lobby sees the runner arrive at the node
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
  corpSays('breach');

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
  publishLiveRun(); // a breach is a place change: the lobby should feel it
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
  const partingShot = corpLine('owned', run.server);
  corpSays('owned');

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
    partingShot,
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
  const partingShot = corpLine('traced', run.server);
  corpSays('traced');
  const result = await bankRun('traced');

  // Let the alarm play before the verdict.
  setTimeout(() => showRunOver({ ...result, isBest, partingShot }), 1100);
}

/**
 * Put the run on the leaderboards.
 *
 * Both endings bank: dying and walking away score the same, so a good run is
 * never lost to a player who would rather stop than be traced.
 */
async function bankRun(reason) {
  stopLiveRun(); // it stops being a runner in progress and becomes a result
  log(`> run banked: ${fmt(runScore(run))} points for ${run.handle}`, 'amber');
  const result = await submitRun(run, { reason });
  rememberResult(result.entry); // so the player can hand its code to a host
  return result;
}

/** The run-over screen, with where the score placed. */
function showRunOver({ entry, rank, tournamentRank, isBest = false, partingShot = '' }) {
  showTracedScreen({
    partingShot,
    server: run.server,
    node: run.node,
    stats: run.stats,
    isBest,
    entry,
    rank,
    tournamentRank,
    tournament: run.tournament,
    onRestart: showTitle,
    onLeaderboard: () => (run.tournament
      ? showTitle('tournament', run.tournament.id)
      : showTitle('leaderboard')),
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
 * @param {string} options.seed        a seed to play, or blank for a fresh one
 */
export function startNewRun({ handle, difficulty, tournament = null, seed = '' } = {}) {
  hideModal();
  clearSavedRun();
  setActiveTournament(tournament);

  // A tournament that fixes a seed overrides the player's: everyone rolls the
  // same dice, which is what turns a tournament into a race.
  const runSeed = seedRun((tournament && tournament.seed) || seed);
  createRun({ handle: handle || 'ANON', difficulty, tournament, seed: runSeed });
  clearLog();
  clearAlarm();

  initAudio();
  sfx.boot();
  log(`> handshake accepted. welcome back, ${run.handle}.`, 'mag');
  log(`> threat level: ${difficultyOf(run.difficulty).name}`, 'cyan');
  log(`> seed: ${runSeed}`, 'dim');
  if (tournament) log(`> tournament rules in force: ${tournament.name}`, 'amber');
  log('> tip: lock high dice, reroll low ones, then execute.', 'dim');
  beginNode();
  startLiveRun();
  maybeStartTutorial(); // only for someone who has not seen it
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
  // Pick the stream back up where it stopped, rather than re-seeding it.
  restoreRng(saved.seed || '', saved.rng);
  createRun({
    handle: saved.handle,
    difficulty: saved.difficulty,
    tournament: saved.tournament,
    seed: saved.seed || '',
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
export function showTitle(view, tournamentId = null) {
  openStartScreen({
    view,
    tournamentId,
    saved: loadSavedRun(),
    best: loadBest(),
    onStart: startNewRun,
    onResume: resumeRun,
  });
}

/** The in-game menu: the rules, a replay of the tutorial, and a way out. */
export function openMenu() {
  const busy = isBusy();
  showMenuScreen({
    busy,
    canRestart: !busy && run.phase !== Phase.TITLE,
    onRestart: abandonRun,
    onTutorial: startTutorial,
  });
}
