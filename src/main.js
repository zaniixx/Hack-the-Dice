/**
 * Composition root.
 *
 * Wires the modules together, owns the animation frame, and starts the game.
 * This is the only module that knows about all the others: everything below it
 * depends downwards, and the loop here is what turns those pieces into a game.
 */
import { settings } from './core/settings.js';

import {
  dice, setDicePool, stepPhysics, stepParticles, layoutTray,
  allSettled, forceSettleAll, secondsSinceThrow, MAX_ROLL_SECONDS,
} from './engine/dice-board.js';
import { initBoardView, syncBoardSize, drawBoard } from './render/board-view.js';
import { initEnemyView, resetEnemyView, markEnemyDestroyed, drawEnemy } from './render/enemy-view.js';
import { els } from './ui/dom.js';
import { trackViewportHeight, blockZoomGestures } from './ui/viewport.js';
import { updateUI, syncSettingsButtons } from './ui/hud.js';
import { bindInput } from './ui/input.js';
import { run, Phase, createRun } from './game/state.js';
import { rollDice, rerollDice, onDiceSettled, useAbility, toggleLock } from './game/turn.js';
import { executePayload } from './game/execute.js';
import { buyItem, sellItem, refreshShop } from './game/shop.js';
import { beginNode, breachNode, showTitle, openMenu } from './game/session.js';
import { tickMemoryLeak } from './game/memory-leak.js';
import { allowedDice, isAbsorbed } from './game/scoring.js';
import { stopLiveRun } from './game/live-run.js';

/** Longest frame the simulation will accept, so a stalled tab cannot teleport dice. */
const MAX_FRAME_SECONDS = 0.05;

let lastTime = performance.now();

/**
 * Physics runs slightly faster when the player speeds the game up, so dice
 * settle sooner without the simulation becoming unstable.
 */
function physicsScale() {
  if (settings.speed >= 4) return 1.8;
  if (settings.speed >= 2) return 1.4;
  return 1;
}

/** Hand control back to the player once the dice have stopped. */
function checkSettled() {
  if (run.phase !== Phase.ROLLING) return;
  if (allSettled()) {
    onDiceSettled();
    return;
  }
  if (secondsSinceThrow() > MAX_ROLL_SECONDS) {
    forceSettleAll();
    onDiceSettled();
  }
}

/**
 * A test for dice this node's boss will not let score, or null when nothing
 * will be refused. The board underlines them while the player is deciding.
 */
function doomedDiceTest() {
  if (!run || run.phase !== Phase.MANIP || !run.enemy || !run.enemy.boss) return null;
  const allowed = allowedDice(dice, run.enemy);
  return die => isAbsorbed(die, run.enemy) || !allowed.has(die);
}

function frame(now) {
  const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;

  // Long frames are split in two, so a fast die cannot pass through a wall.
  const physicsDt = dt * physicsScale();
  const steps = physicsDt > 0.02 ? 2 : 1;
  for (let i = 0; i < steps; i++) stepPhysics(physicsDt / steps);
  stepParticles(dt);

  if (run) checkSettled();

  drawBoard(dt, { isDoomed: doomedDiceTest() });
  drawEnemy(now / 1000, dt, run?.enemy);

  if (tickMemoryLeak(dt).firewallDown) breachNode();

  requestAnimationFrame(frame);
}

/** Dice sit in the tray whenever they are not part of a live roll. */
function diceAreTrayed() {
  if (!run) return true;
  return run.phase === Phase.TITLE
    || run.phase === Phase.SHOP
    || (run.phase === Phase.READY && !run.rolledOnce);
}

let resizeQueued = false;

/**
 * Resize on the next frame rather than inside the observer callback.
 *
 * Resizing the canvas from inside the callback makes the observer fire again
 * in the same delivery cycle, which browsers report as a ResizeObserver loop.
 * Deferring keeps the DOM writes out of that cycle.
 */
function onContainerResize() {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    if (!syncBoardSize()) return;
    if (diceAreTrayed()) layoutTray();
  });
}

function start() {
  // Before anything measures itself: the layout depends on --app-height.
  trackViewportHeight();
  blockZoomGestures();

  syncSettingsButtons();
  createRun();

  initBoardView(els.boardCanvas, els.boardWrap);
  initEnemyView(els.enemyCanvas);
  syncBoardSize();
  new ResizeObserver(onContainerResize).observe(els.boardWrap);

  setDicePool(run.dice);
  resetEnemyView();
  markEnemyDestroyed(); // no target until the first node loads
  updateUI();

  bindInput({
    roll: rollDice,
    reroll: rerollDice,
    execute: executePayload,
    useAbility,
    toggleLock,
    buy: buyItem,
    sell: sellItem,
    refreshShop,
    nextNode: beginNode,
    openMenu,
  });

  // Leaving mid-run takes the runner out of the lobby straight away, rather
  // than leaving a ghost there until the heartbeat expires.
  addEventListener('pagehide', stopLiveRun);

  requestAnimationFrame(frame);
  showTitle();

  // Tells the boot-error reporter in index.html to stand down.
  window.__htdBooted = true;
}

start();
