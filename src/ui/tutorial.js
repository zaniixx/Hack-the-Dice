/**
 * The first-run tutorial: coach marks that point at the next thing to do.
 *
 * It teaches by pointing, not by talking — a ring around the control that
 * matters and one line about why. Each step clears itself when the player does
 * the thing, so a player who already knows what they are doing never waits for
 * it. SKIP ends it for good, and the menu can bring it back.
 *
 * It follows the run rather than driving it: `syncTutorial` is called from the
 * HUD's repaint, so the tutorial cannot get out of step with the game.
 */
import { dice } from '../engine/dice-board.js';
import { store } from '../services/store.js';
import { run, Phase } from '../game/state.js';
import { els } from './dom.js';
import { isTouchLayout } from './viewport.js';

/**
 * A step points at something, appears when it is relevant, and finishes when
 * the player has done it. `dwell` is for the steps that only explain — they
 * clear themselves after a few seconds.
 */
const STEPS = [
  {
    title: 'YOUR POOL',
    text: 'Five dice. Throw them at the firewall — tap ROLL, or press Space.',
    target: () => els.rollButton,
    visible: () => run.phase === Phase.READY && !run.rolledOnce,
    complete: () => run.rolledOnce,
  },
  {
    title: 'KEEP WHAT IS GOOD',
    text: 'Click a die to lock it, then REROLL the rest. Two rerolls per execute.',
    target: () => els.boardCanvas,
    visible: () => run.phase === Phase.MANIP,
    complete: () => dice.some(die => die.locked) || run.phase === Phase.SCORING,
  },
  {
    title: 'COMMIT',
    text: 'Bits × Mult is your hacking power. EXECUTE sends it at the firewall.',
    target: () => els.executeButton,
    visible: () => run.phase === Phase.MANIP,
    complete: () => run.executes < run.maxExecutes || run.phase === Phase.SCORING,
  },
  {
    title: 'THE CLOCK',
    text: 'These are your executes. Run out before the firewall falls and the trace finds you.',
    target: () => els.executePips,
    visible: () => run.phase === Phase.READY,
    dwell: 5,
  },
  {
    title: 'THE MARKET',
    text: 'Breach a node and the black market opens. Spend scrap on dice, abilities and cyberartifacts.',
    target: () => (isTouchLayout() ? els.rigButton : els.shop),
    visible: () => run.phase === Phase.SHOP,
    dwell: 7,
  },
];

let index = 0;
let active = false;
let dwellTimer = null;

const coach = () => els.coach;

function hide() {
  if (coach()) coach().hidden = true;
}

/** Put the ring around the target and the note somewhere it fits. */
function place(step) {
  const target = step.target();
  if (!target) {
    hide();
    return;
  }

  const box = target.getBoundingClientRect();
  if (!box.width || !box.height) {
    hide();
    return;
  }

  const pad = 8;
  const ring = els.coachRing;
  ring.style.left = `${box.left - pad}px`;
  ring.style.top = `${box.top - pad}px`;
  ring.style.width = `${box.width + pad * 2}px`;
  ring.style.height = `${box.height + pad * 2}px`;

  const note = els.coachNote;
  note.style.left = '';
  note.style.top = '';
  note.style.right = '';
  note.style.bottom = '';

  if (isTouchLayout()) {
    // On a phone there is nowhere to tuck a note: pin it out of the way.
    const nearTop = box.top < innerHeight / 2;
    note.style.left = '12px';
    note.style.right = '12px';
    if (nearTop) note.style.bottom = '16px';
    else note.style.top = '16px';
    return;
  }

  const width = 360;
  const below = box.bottom + 18;
  const fitsBelow = below + 150 < innerHeight;
  note.style.width = `${width}px`;
  note.style.left = `${Math.min(Math.max(12, box.left + box.width / 2 - width / 2), innerWidth - width - 12)}px`;
  if (fitsBelow) note.style.top = `${below}px`;
  else note.style.top = `${Math.max(12, box.top - 172)}px`;
}

function show(step) {
  els.coachTitle.textContent = step.title;
  els.coachText.textContent = step.text;
  els.coachStep.textContent = `${index + 1} / ${STEPS.length}`;
  coach().hidden = false;
  place(step);
}

function clearDwell() {
  if (dwellTimer) clearTimeout(dwellTimer);
  dwellTimer = null;
}

/** Follow the run: show the step that fits, and move on when it is done. */
export function syncTutorial() {
  if (!active || !run || !coach()) return;

  const step = STEPS[index];
  if (!step) {
    finishTutorial();
    return;
  }

  // Completion is checked first: a step whose moment has passed — the player
  // rolled before it appeared — has to clear itself, not wait to be visible.
  if (step.complete && step.complete()) {
    advance();
    return;
  }

  if (!step.visible()) {
    hide();
    return;
  }

  show(step);

  // Steps that only explain clear themselves after a moment.
  if (step.dwell && !dwellTimer) {
    dwellTimer = setTimeout(advance, step.dwell * 1000);
  }
}

function advance() {
  clearDwell();
  index += 1;
  if (index >= STEPS.length) {
    finishTutorial();
    return;
  }
  syncTutorial();
}

/** Start from the top. Used for a first run, and by the menu. */
export function startTutorial() {
  clearDwell();
  index = 0;
  active = true;
  syncTutorial();
}

/** Show it only to someone who has not seen it. */
export async function maybeStartTutorial() {
  const profile = await store.getProfile();
  if (profile.tutorialDone) return;
  startTutorial();
}

/** End it, and remember that it has been seen. */
export async function finishTutorial() {
  clearDwell();
  active = false;
  hide();

  const profile = await store.getProfile();
  if (!profile.tutorialDone) await store.saveProfile({ ...profile, tutorialDone: true });
}

export const isTutorialActive = () => active;

// The ring is anchored to a live element, so it has to follow the layout.
addEventListener('resize', () => {
  if (active && !coach().hidden) syncTutorial();
});
els.coachSkip?.addEventListener('click', finishTutorial);
