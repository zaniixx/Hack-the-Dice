/**
 * Input bindings: pointer, keyboard, and the toolkit's delegated clicks.
 *
 * Every handler here calls an action passed in by main.js rather than importing
 * game logic, so the input map can be read on its own and the game never
 * depends on how it was triggered.
 */
import { cycleSpeed, toggleMuted } from '../core/settings.js';
import { initAudio, setMuted } from '../audio/synth.js';
import { sfx } from '../audio/sfx.js';
import { toast } from './fx.js';
import { dieAt } from '../engine/dice-board.js';
import { screenToBoard, setBoardCursor } from '../render/board-view.js';
import { ItemKind } from '../data/catalog.js';
import { run, Phase } from '../game/state.js';
import { els } from './dom.js';
import { isModalOpen, hideModal } from './modal.js';
import { isStartScreenOpen } from './start-screen.js';
import { toggleSheet, closeSheet, openSheet, openSheetOf } from './sheets.js';
import { isCutsceneOpen } from './cutscene.js';
import { isTouchLayout, toggleFullscreen, canFullscreen } from './viewport.js';
import { syncSettingsButtons } from './hud.js';

/** Clicking the board rolls, or locks the die under the pointer. */
function bindBoard(actions) {
  els.boardCanvas.addEventListener('pointerdown', event => {
    initAudio();
    if (!run || isCutsceneOpen()) return;

    if (run.phase === Phase.READY) {
      actions.roll();
      return;
    }
    if (run.phase !== Phase.MANIP) return;

    const point = screenToBoard(event);
    const die = dieAt(point.x, point.y);
    if (die) actions.toggleLock(die);
  });

  els.boardCanvas.addEventListener('pointermove', event => {
    if (!run) return;
    const point = screenToBoard(event);
    const clickable =
      run.phase === Phase.READY || (run.phase === Phase.MANIP && !!dieAt(point.x, point.y));
    setBoardCursor(clickable);
  });
}

function bindButtons(actions) {
  els.rollButton.onclick = actions.roll;
  els.rerollButton.onclick = actions.reroll;
  els.executeButton.onclick = actions.execute;
  els.menuButton.onclick = actions.openMenu;
  els.shopRefreshButton.onclick = actions.refreshShop;

  els.nextNodeButton.onclick = () => {
    if (run.phase !== Phase.SHOP) return;
    sfx.zap();
    actions.nextNode();
  };

  els.seed.onclick = async () => {
    if (!run || !run.seed) return;
    try {
      await navigator.clipboard.writeText(run.seed);
      toast('SEED COPIED: ' + run.seed);
    } catch {
      toast('SEED: ' + run.seed);
    }
  };

  // The touch layout's sheets: the toolkit and the console log.
  els.rigButton.onclick = () => toggleSheet('rig');
  els.logButton.onclick = () => toggleSheet('log');
  els.sheetBackdrop.onclick = closeSheet;
  for (const button of document.querySelectorAll('[data-close-sheet]')) {
    button.onclick = closeSheet;
  }

  els.fullscreenButton.onclick = async () => {
    const entered = await toggleFullscreen();
    els.fullscreenButton.textContent = entered ? 'EXIT' : 'FULL';
  };
  if (!canFullscreen()) els.fullscreenButton.hidden = true;

  // Artifact slots are icon-only on a phone; tapping the row shows them named.
  els.artifactRow.onclick = () => {
    if (isTouchLayout()) openSheet('rig');
  };

  els.speedButton.onclick = () => {
    cycleSpeed();
    syncSettingsButtons();
  };
  els.soundButton.onclick = () => {
    initAudio();
    setMuted(toggleMuted());
    syncSettingsButtons();
  };

  els.abilityBar.addEventListener('click', event => {
    const button = event.target.closest('[data-abil]');
    if (button) actions.useAbility(button.dataset.abil);
  });
}

/** One delegated listener for every buy and sell button in the toolkit. */
function bindToolkit(actions) {
  els.toolkit.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    initAudio();

    const { buy, sellDie, sellArt, sellAbil } = button.dataset;
    if (buy !== undefined) actions.buy(+buy);
    else if (sellDie !== undefined) actions.sell(ItemKind.DIE, +sellDie);
    else if (sellArt !== undefined) actions.sell(ItemKind.ARTIFACT, +sellArt);
    else if (sellAbil !== undefined) actions.sell(ItemKind.ABILITY, +sellAbil);
  });
}

function bindKeyboard(actions) {
  addEventListener('keydown', event => {
    // The start screen has its own keys, and text fields to type into; a
    // cutscene swallows everything until it is dismissed.
    if (isStartScreenOpen() || isCutsceneOpen()) return;
    // Escape backs out of an open sheet before anything else.
    if (event.code === 'Escape' && openSheetOf()) {
      closeSheet();
      return;
    }
    if (isModalOpen()) {
      // The title and the run-over screen have no "back" to escape to.
      const dismissible = run.phase !== Phase.TITLE && run.phase !== Phase.OVER;
      if (event.code === 'Escape' && dismissible) hideModal();
      return;
    }
    if (!run || event.repeat) return;

    switch (true) {
      case event.code === 'Space':
        event.preventDefault();
        if (run.phase === Phase.READY) actions.roll();
        else if (run.phase === Phase.MANIP) actions.execute();
        break;
      case event.code === 'KeyR':
        actions.reroll();
        break;
      case event.code === 'KeyE':
        actions.execute();
        break;
      case event.code === 'Enter' && run.phase === Phase.SHOP:
        event.preventDefault();
        els.nextNodeButton.click();
        break;
      case /^Digit[1-3]$/.test(event.code):
        actions.useAbility(run.abilities[+event.code.slice(5) - 1]);
        break;
    }
  });
}

function bindDocument() {
  // Keep buttons from taking focus on click: the focus ring is for keyboard use.
  document.addEventListener('mousedown', event => {
    if (event.target.closest('button')) event.preventDefault();
  });
  // Browsers only allow audio to start inside a user gesture.
  document.addEventListener('pointerdown', () => initAudio(), { once: true });
}

/**
 * Wire up every input.
 *
 * @param {object} actions roll, reroll, execute, useAbility, toggleLock,
 *                         buy, sell, refreshShop, nextNode, openMenu
 */
export function bindInput(actions) {
  bindBoard(actions);
  bindButtons(actions);
  bindToolkit(actions);
  bindKeyboard(actions);
  bindDocument();
}
