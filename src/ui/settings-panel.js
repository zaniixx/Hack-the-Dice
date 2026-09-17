/**
 * The settings screen.
 *
 * A pop-up rather than another start-screen view, because it is wanted from two
 * places that are nothing like each other: the start screen, before a run, and
 * the menu, in the middle of one. Opening it over whatever is already there
 * means neither has to give up its place to show it.
 *
 * Most of what is in here is about the machine rather than the game. The
 * console is drawn at a fixed pixel size that suits a laptop and suits very
 * little else, so the first row is the one that makes it fit: a small phone can
 * take the whole thing down to 70%, and a large screen — or anyone who would
 * rather not squint at 8px pixel type — can take it to 150%.
 *
 * Every control writes through core/settings.js and then calls applySettings(),
 * so what is on the screen and what is in storage cannot drift apart.
 */
import {
  settings, setSetting, resetSettings, SPEEDS, SCALE_MIN, SCALE_MAX, SCALE_STEP,
} from '../core/settings.js';
import { store } from '../services/store.js';
import { canFullscreen, toggleFullscreen, maxUiScale, uiScale } from './viewport.js';
import { applySettings } from './appearance.js';
import { syncSettingsButtons } from './hud.js';
import { toast } from './fx.js';

let panel = null;
let open = false;

export const isSettingsOpen = () => open;

const escape = text => String(text).replace(/[&<>"]/g,
  ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

const percent = value => Math.round(value * 100) + '%';

// ---- Controls ---------------------------------------------------------------

/** A row: what it is, what it does, and the control that changes it. */
const row = (label, help, control) => `
  <div class="set-row">
    <span class="set-label">${escape(label)}<small>${escape(help)}</small></span>
    <div class="set-control">${control}</div>
  </div>`;

/** One of a short list of answers, all visible at once. */
const choice = (key, options, current) => options.map(([value, text]) =>
  `<button class="btn sm ${value === current ? 'on' : ''}"
           data-set="pick:${key}:${value}">${escape(text)}</button>`).join('');

/** A flag, as the two things it can be. `on` says which word means true. */
const toggle = (key, value, on = 'ON', off = 'OFF') => `
  <button class="btn sm ${value ? 'on' : ''}" data-set="flag:${key}:1">${escape(on)}</button>
  <button class="btn sm ${value ? '' : 'on'}" data-set="flag:${key}:0">${escape(off)}</button>`;

/**
 * A slider, with the number beside it.
 *
 * Steppers either side as well, because a slider is hard to land on an exact
 * value with a thumb and the size control is the one people will want to nudge.
 */
const slider = (key, value, { min = 0, max = 1, step = 0.05, format = percent }) => `
  <button class="btn sm" data-set="step:${key}:-1" aria-label="less">&minus;</button>
  <input class="set-slider" type="range" data-slider="${key}"
         min="${min}" max="${max}" step="${step}" value="${value}"
         aria-label="${escape(key)}">
  <button class="btn sm" data-set="step:${key}:1" aria-label="more">+</button>
  <output class="set-value" data-out="${key}">${format(value)}</output>`;

const RANGES = {
  uiScale: { min: SCALE_MIN, max: SCALE_MAX, step: SCALE_STEP },
  sfxVolume: { min: 0, max: 1, step: 0.05 },
  musicVolume: { min: 0, max: 1, step: 0.05 },
};

/** The size row, whose top end is whatever this screen can actually show. */
const scaleRange = () => ({ ...RANGES.uiScale, max: maxUiScale() });

// ---- The screen -------------------------------------------------------------

/**
 * What the size row says about itself.
 *
 * When the screen is the thing stopping it going further, that is worth saying:
 * otherwise a slider that will not move looks broken rather than honest.
 */
function sizeHelp() {
  const ceiling = maxUiScale();
  return ceiling < SCALE_MAX
    ? `Makes the whole console bigger or smaller. This screen fits ${percent(ceiling)}`
    : 'Makes the whole console bigger or smaller';
}

function bodyHTML() {
  const speedOptions = SPEEDS.map(speed => [speed, speed + '×']);

  return `
    <h4 class="set-sec">DISPLAY</h4>
    ${row('INTERFACE SIZE', sizeHelp(), slider('uiScale', uiScale(), scaleRange()))}
    ${row('CASE COLOUR', 'The shell around the screens; the screens stay dark',
    choice('theme', [['system', 'SYSTEM'], ['dark', 'DARK'], ['light', 'LIGHT']], settings.theme))}
    ${row('SCREEN EFFECTS', 'Scanlines and glow. Off is easier to read',
    toggle('effects', settings.effects))}
    ${canFullscreen()
    ? row('FULL SCREEN', 'Hides the browser, on the devices that allow it',
      '<button class="btn sm" data-set="fullscreen">TOGGLE</button>')
    : ''}

    <h4 class="set-sec">SOUND</h4>
    ${row('SOUND EFFECTS', 'Dice, hits, breaches',
    slider('sfxVolume', settings.sfxVolume, RANGES.sfxVolume))}
    ${row('MUSIC', 'The soundtrack, which follows the tension',
    slider('musicVolume', settings.musicVolume, RANGES.musicVolume))}
    ${row('MUTE EVERYTHING', 'The same switch as SND in the top bar',
    toggle('muted', settings.muted, 'MUTED', 'AUDIBLE'))}

    <h4 class="set-sec">GAME</h4>
    ${row('ANIMATION SPEED', 'A fast forward of the scoring, not a skip',
    choice('speed', speedOptions, settings.speed))}
    ${row('SCREEN SHAKE', 'The kick when dice land and firewalls break',
    toggle('shake', settings.shake))}
    ${row('TUTORIAL', 'Walks through a first node again on your next run',
    '<button class="btn sm" data-set="tutorial">SHOW AGAIN</button>')}

    <div class="set-foot">
      <button class="btn sm" data-set="reset">RESET EVERYTHING</button>
      <span class="set-note">Kept on this device.</span>
    </div>`;
}

function render() {
  if (!panel || !open) return;
  panel.querySelector('.set-body').innerHTML = bodyHTML();
}

// ---- Changing things --------------------------------------------------------

/** Write a setting, put it on the screen, and keep the top bar honest. */
function change(key, value, { redraw = true } = {}) {
  setSetting(key, value);
  applySettings();
  syncSettingsButtons();
  if (redraw) render();
}

function stepBy(key, direction) {
  const range = key === 'uiScale' ? scaleRange() : RANGES[key];
  if (!range) return;
  const from = key === 'uiScale' ? uiScale() : settings[key];
  const next = Math.min(range.max, Math.max(range.min, from + direction * range.step));
  change(key, Number(next.toFixed(4)));
}

function onClick(event) {
  const button = event.target.closest('[data-set]');
  if (!button) return;
  const [verb, key, raw] = button.dataset.set.split(':');

  switch (verb) {
    case 'close':
      closeSettings();
      return;

    /*
     * Values come back out of the DOM as strings, and the settings they land in
     * are numbers, booleans and strings. Storing "2" where 2 was meant would
     * fail every comparison that reads it back — quietly, because nothing here
     * throws on a setting it does not recognise.
     */
    case 'pick':
      change(key, Number.isNaN(Number(raw)) ? raw : Number(raw));
      return;

    case 'flag':
      change(key, raw === '1');
      return;

    case 'step':
      stepBy(key, Number(raw));
      return;

    case 'fullscreen':
      void toggleFullscreen();
      return;

    case 'tutorial':
      void (async () => {
        const profile = await store.getProfile();
        await store.saveProfile({ ...profile, tutorialDone: false });
        toast('TUTORIAL WILL RUN ON YOUR NEXT RUN');
      })();
      return;

    case 'reset':
      resetSettings();
      applySettings();
      syncSettingsButtons();
      render();
      toast('SETTINGS RESET');
      return;

    default:
  }
}

/**
 * A slider being dragged.
 *
 * The value is applied on every movement so the size setting can be seen
 * changing, but the panel is not redrawn — replacing the slider under a thumb
 * that is still on it ends the drag.
 */
function onInput(event) {
  const key = event.target.dataset.slider;
  if (!key) return;
  change(key, Number(event.target.value), { redraw: false });
  const out = panel.querySelector(`[data-out="${key}"]`);
  if (out) out.textContent = percent(key === 'uiScale' ? uiScale() : settings[key]);
}

/** A slider let go of: now it is safe to redraw the panel around it. */
function onChange(event) {
  if (event.target.dataset.slider) render();
}

function onKeydown(event) {
  if (!open || event.key !== 'Escape') return;
  event.stopPropagation();
  closeSettings();
}

function build() {
  panel = document.createElement('div');
  panel.id = 'settings';
  panel.className = 'settings';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Settings');
  panel.innerHTML = `
    <div class="set-box screen">
      <div class="set-head">
        <span class="set-title">SETTINGS</span>
        <button class="btn sm" data-set="close">CLOSE</button>
      </div>
      <div class="set-body"></div>
    </div>`;

  panel.addEventListener('click', event => {
    // The backdrop is the panel itself; a click that lands on it closes.
    if (event.target === panel) closeSettings();
    else onClick(event);
  });
  panel.addEventListener('input', onInput);
  panel.addEventListener('change', onChange);
  document.body.appendChild(panel);
  addEventListener('keydown', onKeydown, true);
}

// ---- Open and close ---------------------------------------------------------

export function openSettings() {
  if (!panel) build();
  open = true;
  panel.hidden = false;
  render();
  panel.querySelector('[data-set="close"]')?.focus({ preventScroll: true });
}

export function closeSettings() {
  open = false;
  if (panel) panel.hidden = true;
}
