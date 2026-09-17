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
import { labelFor } from '../core/keybinds.js';
import { isTouchLayout, uiScale } from './viewport.js';

/**
 * A step points at something, appears when it is relevant, and finishes when
 * the player has done it. `dwell` is for the steps that only explain — they
 * clear themselves after a few seconds.
 */
const STEPS = [
  {
    title: 'YOUR POOL',
    text: () => `Five dice. Throw them at the firewall — tap ROLL, or press ${labelFor('throw')}.`,
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
    text: 'Breach a node and the market opens over the board. Spend scrap here, then breach the next node.',
    // The market is a popup on every layout now, so both point at the cards.
    target: () => els.shop,
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

/** How much two rectangles overlap, in square pixels. */
function overlapArea(a, b) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * The controls the note must not sit on top of.
 *
 * Step 2 rings the board and the obvious place for its note is directly below —
 * which is exactly where REROLL is. A note that covers the button it is telling
 * you to press is worse than no note, so the candidate positions below are
 * scored against these and the clearest one wins.
 */
function keepClear() {
  return [
    els.rollButton, els.rerollButton, els.executeButton, els.abilityBar,
    els.artifactRow, els.bits.closest('.scorebar'),
  ]
    .filter(Boolean)
    .map(boxOf)
    .filter(box => box.width && box.height);
}

/**
 * Where something is, in the units this overlay is positioned in.
 *
 * getBoundingClientRect answers in real screen pixels. The coach is laid out
 * inside the root, and the interface-size setting zooms the root — so at 130% a
 * CSS pixel here is worth 1.3 screen pixels, and a ring placed at the raw
 * numbers lands further from the thing it is ringing the further the interface
 * is scaled from 100%. Everything measured from the page has to come back
 * through here before it is written into a style.
 */
function boxOf(el) {
  const rect = el.getBoundingClientRect();
  const scale = uiScale() || 1;
  if (scale === 1) return rect;
  return {
    left: rect.left / scale,
    top: rect.top / scale,
    right: rect.right / scale,
    bottom: rect.bottom / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

/** The viewport, in those same units. */
const viewport = () => {
  const scale = uiScale() || 1;
  return { width: innerWidth / scale, height: innerHeight / scale };
};

/** Put the ring around the target and the note somewhere it fits. */
function place(step) {
  const target = step.target();
  if (!target) {
    hide();
    return;
  }

  const box = boxOf(target);
  if (!box.width || !box.height) {
    hide();
    return;
  }
  const view = viewport();

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
    const nearTop = box.top < view.height / 2;
    note.style.left = '12px';
    note.style.right = '12px';
    if (nearTop) note.style.bottom = '16px';
    else note.style.top = '16px';
    return;
  }

  const width = 360;
  note.style.width = `${width}px`;
  const height = note.offsetHeight || 150;

  const gap = 18;
  const clamp = (value, max) => Math.min(Math.max(12, value), Math.max(12, max));
  const centredLeft = clamp(box.left + box.width / 2 - width / 2, view.width - width - 12);
  const centredTop = clamp(box.top + box.height / 2 - height / 2, view.height - height - 12);

  // Below, above, right, left — in the order they usually read best.
  const candidates = [
    { left: centredLeft, top: box.bottom + gap },
    { left: centredLeft, top: box.top - gap - height },
    { left: box.right + gap, top: centredTop },
    { left: box.left - gap - width, top: centredTop },
  ];

  const blocked = [...keepClear(), { left: box.left - pad, top: box.top - pad,
    right: box.right + pad, bottom: box.bottom + pad }];

  let best = null;
  for (const spot of candidates) {
    // A candidate that falls off screen is no candidate at all.
    if (spot.left < 12 || spot.top < 12) continue;
    if (spot.left + width > view.width - 12 || spot.top + height > view.height - 12) continue;

    const rect = { left: spot.left, top: spot.top,
      right: spot.left + width, bottom: spot.top + height };
    const cost = blocked.reduce((total, other) => total + overlapArea(rect, other), 0);
    if (!best || cost < best.cost) best = { ...spot, cost };
    if (cost === 0) break; // nothing to improve on
  }

  // Everything overlaps something on a small window: take the least bad corner.
  const spot = best || { left: centredLeft, top: clamp(box.bottom + gap, view.height - height - 12) };
  note.style.left = `${spot.left}px`;
  note.style.top = `${spot.top}px`;
}

function show(step) {
  els.coachTitle.textContent = step.title;
  // A step whose wording depends on something — a key the player may have
  // moved — gives a function instead of a string.
  els.coachText.textContent = typeof step.text === 'function' ? step.text() : step.text;
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
