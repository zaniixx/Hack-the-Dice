/**
 * The boss cutscene.
 *
 * When a security protocol comes online the game stops and lets it introduce
 * itself: its portrait, animated by the same painter that draws it in the
 * fight, its name, the rule it is about to enforce, and a line of its own.
 *
 * It is a beat, not an obstacle — any key or click dismisses it, and it clears
 * itself after a few seconds for anyone who has already started reaching for
 * the dice.
 */
import { pick } from '../core/random.js';
import { corpName } from '../data/corps.js';
import { sfx } from '../audio/sfx.js';
import { ENEMY_SPRITES, ENEMY_WIDTH, ENEMY_HEIGHT } from '../render/enemy-sprites.js';
import { els } from './dom.js';

/** How long it stays up on its own. */
const HOLD_MS = 6000;
/** Characters per frame while the line types itself in. */
const TYPE_SPEED = 1.6;

let open = false;
let frame = null;
let timer = null;
let startedAt = 0;
let dismiss = null;

export const isCutsceneOpen = () => open;

function paint(boss, color) {
  const canvas = els.cutSprite;
  const ctx = canvas.getContext('2d');
  const time = (performance.now() - startedAt) / 1000;

  ctx.fillStyle = '#07060f';
  ctx.fillRect(0, 0, ENEMY_WIDTH, ENEMY_HEIGHT);
  ENEMY_SPRITES[boss.sprite](ctx, time, color);

  // A scanline wash, and a shiver on the first moments.
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  for (let y = (Math.floor(time * 8) % 3); y < ENEMY_HEIGHT; y += 3) {
    ctx.fillRect(0, y, ENEMY_WIDTH, 1);
  }
  canvas.style.transform = time < 0.4 && Math.random() < 0.5
    ? `translate(${Math.round((Math.random() - 0.5) * 6)}px, 0)`
    : 'none';

  frame = requestAnimationFrame(() => paint(boss, color));
}

function typeLine(text) {
  const target = els.cutLine;
  target.textContent = '';
  let shown = 0;

  const step = () => {
    if (!open) return;
    shown = Math.min(text.length, shown + TYPE_SPEED);
    target.textContent = text.slice(0, Math.floor(shown));
    if (shown < text.length) requestAnimationFrame(step);
  };
  step();

  // Typing is a flourish, not a gate: if frames are throttled — a background
  // tab, a slow phone — the line still ends up on screen.
  setTimeout(() => {
    if (open && target.textContent.length < text.length) target.textContent = text;
  }, 1400);
}

/** Take it down, and let the caller get on with the node. */
export function closeCutscene() {
  if (!open) return;
  open = false;

  if (frame) cancelAnimationFrame(frame);
  if (timer) clearTimeout(timer);
  frame = null;
  timer = null;

  removeEventListener('keydown', onKey, true);
  els.cutscene.hidden = true;
  els.cutscene.classList.remove('is-open');

  const done = dismiss;
  dismiss = null;
  done?.();
}

function onKey(event) {
  if (event.repeat) return;
  event.preventDefault();
  event.stopPropagation();
  closeCutscene();
}

/**
 * Show a protocol coming online.
 *
 * @param {object} options
 * @param {object} options.boss    the boss definition, from data/bosses.js
 * @param {object} options.enemy   the target as built for this node
 * @param {number} options.server  which server it is defending
 * @param {Function} [options.onDone] called once it has been dismissed
 */
export function showBossCutscene({ boss, enemy, server, onDone }) {
  if (!els.cutscene) {
    onDone?.();
    return;
  }

  open = true;
  startedAt = performance.now();
  dismiss = onDone;

  els.cutLabel.textContent = `${corpName(server)} — SECURITY PROTOCOL ONLINE`;
  els.cutName.textContent = boss.name;
  els.cutName.dataset.text = boss.name;
  els.cutRule.textContent = boss.rule;
  els.cutscene.style.setProperty('--tier', enemy.color);

  els.cutscene.hidden = false;
  els.cutscene.classList.add('is-open');

  sfx.bossOnline();
  paint(boss, enemy.color);
  typeLine(boss.lines && boss.lines.length ? `“${pick(boss.lines)}”` : '');

  addEventListener('keydown', onKey, true);
  timer = setTimeout(closeCutscene, HOLD_MS);
}

els.cutscene?.addEventListener('click', closeCutscene);
