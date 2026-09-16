/**
 * The console log panel.
 *
 * Lines are typed out two characters at a time with a keyclick, which is the
 * panel's whole personality. Calls queue up, and the queue types itself out in
 * order; when more than two lines are waiting it stops pausing so the log can
 * never fall behind the action it is narrating.
 */
import { rawSleep } from '../core/time.js';
import { sfx } from '../audio/sfx.js';
import { els } from './dom.js';

const MAX_LINES = 70;
const CHARS_PER_TICK = 2;
const TICK_MS = 9;

const queue = [];
let typing = false;

/**
 * Write a line.
 *
 * @param {string} text
 * @param {string} tone  a color class: red, cyan, amber, mag, dim, white, lime
 */
export function log(text, tone = '') {
  queue.push({ text, tone });
  if (!typing) typeQueue();
}

export function clearLog() {
  els.log.innerHTML = '';
}

async function typeQueue() {
  typing = true;
  while (queue.length) {
    const { text, tone } = queue.shift();
    const line = document.createElement('div');
    line.className = 'ln ' + tone;
    els.log.appendChild(line);

    const catchingUp = queue.length > 2;
    for (let i = 0; i < text.length; i += CHARS_PER_TICK) {
      line.textContent = text.slice(0, i + CHARS_PER_TICK);
      if (catchingUp) continue;
      if (i % 6 === 0) sfx.key();
      await rawSleep(TICK_MS);
    }

    line.textContent = text;
    els.log.scrollTop = els.log.scrollHeight;
    while (els.log.children.length > MAX_LINES) els.log.firstChild.remove();
  }
  typing = false;
}
