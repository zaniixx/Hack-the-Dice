/**
 * Dragging cyberartifacts into order.
 *
 * Slot order decides what a rig is worth — each slot pays out in full before
 * the next one starts, so a +Mult artifact is only multiplied by the ×Mult
 * artifacts to its right (see game/execute.js). That makes the row a thing to
 * arrange rather than a list of what you happen to own, and this is how it gets
 * arranged.
 *
 * Pointer events rather than HTML5 drag-and-drop, because the latter does not
 * exist on touch and the market is played on phones. The row reorders live
 * underneath the pointer, so what you see while dragging is what you get when
 * you let go.
 */
import { els } from './dom.js';
import { sfx } from '../audio/sfx.js';

/** How far the pointer moves before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD_PX = 6;

let held = null;
let dragging = false;
/** When the last drag ended, so the tap it also looks like can be ignored. */
let endedAt = 0;

export const isDraggingArtifacts = () => dragging;

/** True just after a drag, for click handlers that must not treat it as a tap. */
export const justDragged = () => performance.now() - endedAt < 250;

/** The filled slots, left to right. Empty slots are not draggable. */
const filledSlots = () => [...els.artifactRow.querySelectorAll('.art[data-id]')];

/**
 * The slot the pointer is to the left of, which is where the held one belongs.
 * Null means past every filled slot — the far right of the row.
 */
function slotAfter(clientX) {
  for (const slot of filledSlots()) {
    if (slot === held.el) continue;
    const box = slot.getBoundingClientRect();
    if (clientX < box.left + box.width / 2) return slot;
  }
  return null;
}

/** Move the held slot to where the pointer says, if that is somewhere new. */
function reflow(clientX) {
  const before = slotAfter(clientX);
  if (before === held.el.nextElementSibling || before === held.el) return;

  // Past the last filled slot means before the first empty one, not after it.
  const target = before || els.artifactRow.querySelector('.art.empty');
  if (target) els.artifactRow.insertBefore(held.el, target);
  else els.artifactRow.appendChild(held.el);
  sfx.tick(2);
}

function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const slot = event.target.closest('.art[data-id]');
  if (!slot || !els.artifactRow.contains(slot)) return;
  if (filledSlots().length < 2) return; // nothing to reorder against

  held = { el: slot, id: slot.dataset.id, startX: event.clientX, startY: event.clientY };
}

function onPointerMove(event) {
  if (!held) return;

  if (!dragging) {
    const moved = Math.hypot(event.clientX - held.startX, event.clientY - held.startY);
    if (moved < DRAG_THRESHOLD_PX) return;
    dragging = true;
    held.el.classList.add('dragging');
    els.artifactRow.classList.add('reordering');
    els.artifactRow.setPointerCapture?.(event.pointerId);
  }

  event.preventDefault();
  reflow(event.clientX);
}

/**
 * Let go: read the order off the row and make it the rig's.
 *
 * The DOM is the source of truth here because it is what the player was looking
 * at while they dragged.
 */
function onPointerUp(event, onReorder) {
  if (!held) return;
  const wasDragging = dragging;
  const order = filledSlots().map(slot => slot.dataset.id);

  held.el.classList.remove('dragging');
  els.artifactRow.classList.remove('reordering');
  els.artifactRow.releasePointerCapture?.(event.pointerId);
  held = null;
  dragging = false;

  if (!wasDragging) return;
  endedAt = performance.now();
  sfx.lock(true);
  onReorder(order);
}

function cancel() {
  if (held) {
    held.el.classList.remove('dragging');
    els.artifactRow.classList.remove('reordering');
  }
  held = null;
  dragging = false;
}

/**
 * Wire the row up.
 *
 * @param {function(string[])} onReorder called with the artifact ids in their
 *        new order, once the player lets go of a drag
 */
export function bindArtifactDrag(onReorder) {
  const row = els.artifactRow;
  row.addEventListener('pointerdown', onPointerDown);
  row.addEventListener('pointermove', onPointerMove);
  row.addEventListener('pointerup', event => onPointerUp(event, onReorder));
  row.addEventListener('pointercancel', cancel);
  // A pointer that leaves without a button held is a drag that was interrupted.
  row.addEventListener('lostpointercapture', cancel);
}
