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
import { openMarket, closeMarket, isMarketOpen } from './market.js';
import { bindArtifactDrag, justDragged } from './artifact-drag.js';
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

  // Both breach buttons do the same thing: the one below the toolkit, and the
  // one in the market popup that is covering it.
  const breach = () => {
    if (run.phase !== Phase.SHOP) return;
    closeMarket();
    sfx.zap();
    actions.nextNode();
  };
  els.nextNodeButton.onclick = breach;
  els.marketBreachButton.onclick = breach;

  els.marketButton.onclick = () => {
    initAudio();
    openMarket();
  };
  els.marketCloseButton.onclick = closeMarket;
  // Clicking the backdrop, but not the panel itself, closes it.
  els.market.addEventListener('pointerdown', event => {
    if (event.target === els.market) closeMarket();
  });

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
  // Dragging one into a new slot also ends in a click, which is not a tap.
  els.artifactRow.onclick = () => {
    if (justDragged()) return;
    if (isTouchLayout()) openSheet('rig');
  };

  els.artifactRow.style.touchAction = 'none'; // a drag must not scroll the page
  bindArtifactDrag(actions.reorderArtifacts);

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

/**
 * One delegated listener for every buy and sell button.
 *
 * Buying happens in the market popup and selling in the toolkit, but they are
 * the same kind of click, so both roots share a handler.
 */
function bindToolkit(actions) {
  const onClick = event => {
    const button = event.target.closest('button');
    if (!button) return;
    initAudio();

    const { buy, sellDie, sellArt, sellAbil } = button.dataset;
    if (buy !== undefined) actions.buy(+buy);
    else if (sellDie !== undefined) actions.sell(ItemKind.DIE, +sellDie);
    else if (sellArt !== undefined) actions.sell(ItemKind.ARTIFACT, +sellArt);
    else if (sellAbil !== undefined) actions.sell(ItemKind.ABILITY, +sellAbil);
  };

  els.toolkit.addEventListener('click', onClick);
  els.market.addEventListener('click', onClick);
}

function bindKeyboard(actions) {
  addEventListener('keydown', event => {
    // The start screen has its own keys, and text fields to type into; a
    // cutscene swallows everything until it is dismissed.
    if (isStartScreenOpen() || isCutsceneOpen()) return;
    // Escape backs out of whatever is layered over the game, nearest first.
    if (event.code === 'Escape' && openSheetOf()) {
      closeSheet();
      return;
    }
    if (event.code === 'Escape' && isMarketOpen()) {
      closeMarket();
      return;
    }
    if (isModalOpen()) {
      // The title and the run-over screen have no "back" to escape to.
      const dismissible = run.phase !== Phase.TITLE && run.phase !== Phase.OVER;
      if (event.code === 'Escape' && dismissible) hideModal();
      return;
    }
    if (!run || event.repeat) return;
    // Mid-sequence: those keys are being typed at something else.
    if (isTypingShellSequence()) return;

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
      case event.code === 'KeyM' && run.phase === Phase.SHOP:
        if (isMarketOpen()) closeMarket();
        else openMarket();
        break;
      case /^Digit[1-3]$/.test(event.code):
        actions.useAbility(run.abilities[+event.code.slice(5) - 1]);
        break;
    }
  });
}

/**
 * The sequence that attaches the development console, and the rolling buffer of
 * the last few keys it is matched against.
 *
 * The console is not part of the game and is not loaded with it: the module is
 * fetched the first time this matches, so a session that never types it never
 * pays for it. Typing into a field is ignored, which keeps a seed or a handle
 * from tripping it by accident.
 *
 * Keys are also given a gap limit, so a digit pressed now and another pressed a
 * minute later are not treated as part of the same thing.
 */
const SHELL_SEQUENCE = '1241320++'; //this reminds me of UNI
const SHELL_KEY_GAP_MS = 1500;

let shellBuffer = '';
let shellLastKey = 0;

/**
 * True once the keys so far could only be the opening sequence.
 *
 * The game's own keys stand down while that is true, so typing it does not fire
 * abilities on the way through. It starts at two characters rather than one,
 * because a single `1` has to stay the ability hotkey it has always been.
 */
const isTypingShellSequence = () =>
  shellBuffer.length > 1 && SHELL_SEQUENCE.startsWith(shellBuffer);

/** Registered before the game's own keys, so it sees each one first. */
function watchForShell() {
  addEventListener('keydown', async event => {
    if (event.key.length !== 1) return;
    if (event.target.closest?.('input, textarea')) {
      shellBuffer = '';
      return;
    }

    const now = performance.now();
    if (now - shellLastKey > SHELL_KEY_GAP_MS) shellBuffer = '';
    shellLastKey = now;

    shellBuffer = (shellBuffer + event.key).slice(-SHELL_SEQUENCE.length);
    // Keep only what can still become the sequence, so a stray key resets it.
    while (shellBuffer && !SHELL_SEQUENCE.startsWith(shellBuffer)) {
      shellBuffer = shellBuffer.slice(1);
    }
    if (shellBuffer !== SHELL_SEQUENCE) return;

    shellBuffer = '';
    const shell = await import('./root-shell.js');
    shell.toggleRootShell();
  });
}

function bindDocument() {
  // Keep buttons from taking focus on click: the focus ring is for keyboard use.
  document.addEventListener('mousedown', event => {
    if (event.target.closest('button')) event.preventDefault();
  });

  /*
   * Nothing here is a file to drag onto the desktop or text to drag into
   * another window. CSS stops the selection that native dragging needs, but
   * -webkit-user-drag is WebKit's alone, so images still lift away in Firefox
   * without this. A field the player is typing in keeps its own behaviour.
   */
  document.addEventListener('dragstart', event => {
    if (!event.target.closest?.('input, textarea, [contenteditable]')) event.preventDefault();
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
  watchForShell(); // first, so it sees a key before the game acts on it
  bindBoard(actions);
  bindButtons(actions);
  bindToolkit(actions);
  bindKeyboard(actions);
  bindDocument();
}
