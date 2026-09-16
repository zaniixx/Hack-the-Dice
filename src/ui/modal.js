/**
 * The full-screen dialog used for the title, the menu, and run-ending screens.
 *
 * Buttons are described as data: `{ text, cls, fn }`. Every button closes the
 * modal before running its action, and every click counts as the interaction
 * that unlocks audio.
 */
import { initAudio } from '../audio/synth.js';
import { els } from './dom.js';

export function isModalOpen() {
  return els.modal.classList.contains('open');
}

export function showModal(html, buttons) {
  els.modal.innerHTML = `<div class="mbox screen">${html}<div class="mbtns"></div></div>`;
  const row = els.modal.querySelector('.mbtns');

  let first = null;
  for (const button of buttons) {
    const el = document.createElement('button');
    el.className = 'btn ' + (button.cls || '');
    el.textContent = button.text;
    el.onclick = () => {
      initAudio();
      hideModal();
      button.fn?.();
    };
    row.appendChild(el);
    first ??= el;
  }

  els.modal.classList.add('open');
  first?.focus({ preventScroll: true });
}

export function hideModal() {
  els.modal.classList.remove('open');
  els.modal.innerHTML = '';
}
