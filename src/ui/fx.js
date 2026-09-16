/**
 * The effects layer: everything that flies across the screen.
 *
 * `#fx` is a fixed, click-through overlay, so effects can travel between
 * panels — a die on the board can throw its value at the scoreboard. Positions
 * are viewport coordinates, and animations run on the Web Animations API with a
 * timeout fallback so a dropped `finish` event can never stall the game.
 */
import { settings } from '../core/settings.js';
import { rawSleep, sleep } from '../core/time.js';
import { fmt } from '../core/format.js';
import { els } from './dom.js';

/** Viewport centre of an element. */
export function centerOf(el) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Viewport centre of an artifact's slot, falling back to the row itself. */
export function artifactToScreen(id) {
  const slot = els.artifactRow.querySelector(`[data-id="${id}"]`);
  return centerOf(slot || els.artifactRow);
}

/**
 * Throw a label from one point to another: it pops, hangs, then dives.
 * Resolves when it lands, so callers can update the target as it arrives.
 */
export function fly(text, from, to, { cls = '', dur = 560, rise = 20 } = {}) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'fly ' + cls;
    el.textContent = text;
    els.fx.appendChild(el);

    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const x0 = from.x - width / 2;
    const y0 = from.y - height / 2;
    const x1 = to.x - width / 2;
    const y1 = to.y - height / 2;

    const animation = el.animate([
      { transform: `translate(${x0}px,${y0}px) scale(.3)`, opacity: 0, easing: 'ease-out' },
      { transform: `translate(${x0}px,${y0 - rise}px) scale(1.4)`, opacity: 1, offset: 0.22 },
      { transform: `translate(${x0}px,${y0 - rise - 6}px) scale(1.1)`, opacity: 1, offset: 0.5, easing: 'cubic-bezier(.7,0,1,.6)' },
      { transform: `translate(${x1}px,${y1}px) scale(.6)`, opacity: 0.85 },
    ], { duration: dur / settings.speed, fill: 'forwards' });

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      el.remove();
      resolve();
    };
    animation.onfinish = finish;
    setTimeout(finish, dur / settings.speed + 400);
  });
}

/** A label that rises and fades where it stands. */
export function floatText(text, at, cls, dur = 900) {
  const el = document.createElement('div');
  el.className = 'fly ' + cls;
  el.textContent = text;
  els.fx.appendChild(el);

  const x = at.x - el.offsetWidth / 2;
  const y = at.y - el.offsetHeight / 2;
  const animation = el.animate([
    { transform: `translate(${x}px,${y}px) scale(1.5)`, opacity: 1 },
    { transform: `translate(${x}px,${y - 18}px) scale(1)`, opacity: 1, offset: 0.4 },
    { transform: `translate(${x}px,${y - 42}px) scale(1)`, opacity: 0 },
  ], {
    // Floating text is readability, not pacing: never speed it past 2x.
    duration: dur / Math.min(settings.speed, 2),
    easing: 'steps(10)',
    fill: 'forwards',
  });
  animation.onfinish = () => el.remove();
}

/**
 * The payload total: it slams into the middle of the board, holds, then dives
 * into the firewall bar. Awaited by the execute pipeline.
 */
export async function bigHit(total) {
  const el = document.createElement('div');
  el.className = 'fly bighit';
  el.textContent = fmt(total);
  els.fx.appendChild(el);

  const from = centerOf(els.boardWrap);
  const to = centerOf(els.firewallBar);
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const speed = settings.speed;
  const at = `translate(${from.x - width / 2}px,${from.y - height / 2}px)`;

  const slam = el.animate([
    { transform: at + ' scale(0)' },
    { transform: at + ' scale(1.5)', offset: 0.6 },
    { transform: at + ' scale(1)' },
  ], { duration: 380 / speed, fill: 'forwards', easing: 'steps(6)' });
  await Promise.race([slam.finished, rawSleep(380 / speed + 300)]);
  await sleep(260);

  const dive = el.animate([
    { transform: at + ' scale(1)' },
    { transform: `translate(${to.x - width / 2}px,${to.y - height / 2}px) scale(.35)` },
  ], { duration: 380 / speed, fill: 'forwards', easing: 'cubic-bezier(.6,0,.9,.6)' });
  await Promise.race([dive.finished, rawSleep(380 / speed + 300)]);
  el.remove();
}

/** Restart a CSS animation by removing the class and forcing a reflow. */
function replay(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

/** Punch a scoreboard number to acknowledge a change. */
export const bump = el => replay(el, 'bump');

/** Fire an artifact's slot so the player can see which one paid out. */
export function pulseArtifact(id) {
  const slot = els.artifactRow.querySelector(`[data-id="${id}"]`);
  if (slot) replay(slot, 'fire');
}

/** A short message for things the player tried that did not work. */
export function toast(message) {
  els.fx.querySelectorAll('.toast').forEach(el => el.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  els.fx.appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

/** Shake the whole console. Skipped when the player asked for less motion. */
export function shakeApp() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  replay(els.grid, 'shake');
}

/** Red strobe over the whole page: the trace has landed. */
export function flashAlarm() {
  replay(document.body, 'alarm');
}

/** Clear the strobe when a new run starts. */
export function clearAlarm() {
  document.body.classList.remove('alarm');
}
