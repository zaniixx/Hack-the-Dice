/**
 * Draws the target portrait.
 *
 * The enemy is painted into an offscreen buffer first so it can be composited
 * against: cracks and the hit flash are drawn with `source-atop`, which clips
 * them to the silhouette, and the whole buffer is then torn into horizontal
 * slices for the glitch effect. When it dies, the buffer's pixels become debris.
 */
import { clamp } from '../core/math.js';
import { rand, randInt } from '../core/random.js';
import { ENEMY_SPRITES, ENEMY_WIDTH, ENEMY_HEIGHT, makeCracks, drawCrack } from './enemy-sprites.js';

let ctx = null;

const buffer = document.createElement('canvas');
buffer.width = ENEMY_WIDTH;
buffer.height = ENEMY_HEIGHT;
const bufferCtx = buffer.getContext('2d', { willReadFrequently: true });

const view = {
  /** Countdown of the white hit flash, in seconds. */
  hitFlash: 0,
  /** True once the target has exploded, or before one exists. */
  destroyed: false,
  /** Exploded pixels still in flight. */
  debris: [],
  cracks: [],
};

export function initEnemyView(canvas) {
  ctx = canvas.getContext('2d');
}

/** Fresh target: no damage, no debris, a new crack pattern. */
export function resetEnemyView() {
  view.hitFlash = 0;
  view.destroyed = false;
  view.debris = [];
  view.cracks = makeCracks();
}

/** Show the empty-socket static without playing an explosion. */
export function markEnemyDestroyed() {
  view.destroyed = true;
}

export function flashEnemyHit() {
  view.hitFlash = 1;
}

export const isEnemyDestroyed = () => view.destroyed;
export const hasEnemyDebris = () => view.debris.length > 0;

/** Blow the current portrait apart, one particle per 2x2 block of pixels. */
export function explodeEnemy() {
  const pixels = bufferCtx.getImageData(0, 0, ENEMY_WIDTH, ENEMY_HEIGHT).data;
  view.debris = [];

  for (let y = 0; y < ENEMY_HEIGHT; y += 2) {
    for (let x = 0; x < ENEMY_WIDTH; x += 2) {
      const i = (y * ENEMY_WIDTH + x) * 4;
      if (pixels[i + 3] === 0) continue; // transparent: nothing to throw
      view.debris.push({
        x, y,
        // Fling outwards from the centre of the portrait.
        vx: (x - 32) * rand(1.5, 4) + rand(-15, 15),
        vy: (y - 24) * rand(1, 3) - rand(20, 60),
        life: rand(0.6, 1.4),
        color: `rgb(${pixels[i]},${pixels[i + 1]},${pixels[i + 2]})`,
      });
    }
  }
  view.destroyed = true;
}

/** Backdrop: vertical rails and a slowly scrolling horizontal grid. */
function drawBackdrop(time) {
  ctx.fillStyle = '#07060f';
  ctx.fillRect(0, 0, ENEMY_WIDTH, ENEMY_HEIGHT);
  ctx.fillStyle = '#110e22';
  for (let x = 2; x < ENEMY_WIDTH; x += 6) ctx.fillRect(x, 0, 1, ENEMY_HEIGHT);
  for (let y = Math.floor(time * 5) % 6; y < ENEMY_HEIGHT; y += 6) {
    ctx.fillRect(0, y, ENEMY_WIDTH, 1);
  }
}

/** Dead air: faint static where a target would be. */
function drawStatic() {
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? '#2a2548' : '#1a1733';
    ctx.fillRect(randInt(0, 63), randInt(0, 47), randInt(1, 3), 1);
  }
}

/** Compose the portrait in the buffer and blit it, glitching when hit. */
function drawPortrait(enemy, time) {
  bufferCtx.clearRect(0, 0, ENEMY_WIDTH, ENEMY_HEIGHT);
  ENEMY_SPRITES[enemy.sprite](bufferCtx, time, enemy.color);

  // Cracks appear in step with how much of the firewall is gone.
  const damage = clamp(1 - enemy.hp / enemy.max, 0, 1);
  const shown = Math.floor(damage * view.cracks.length);
  bufferCtx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < shown; i++) drawCrack(bufferCtx, view.cracks[i]);
  if (view.hitFlash > 0) {
    bufferCtx.fillStyle = `rgba(255,255,255,${Math.min(0.85, view.hitFlash)})`;
    bufferCtx.fillRect(0, 0, ENEMY_WIDTH, ENEMY_HEIGHT);
  }
  bufferCtx.globalCompositeOperation = 'source-over';

  const glitching = view.hitFlash > 0.05;
  if (glitching || Math.random() < 0.012) {
    // Tear into 3px slices and offset them sideways.
    const amplitude = glitching ? 2 + view.hitFlash * 7 : 2;
    for (let y = 0; y < ENEMY_HEIGHT; y += 3) {
      const offset = Math.random() < 0.45 ? Math.round(rand(-amplitude, amplitude)) : 0;
      ctx.drawImage(buffer, 0, y, ENEMY_WIDTH, 3, offset, y, ENEMY_WIDTH, 3);
    }
  } else {
    ctx.drawImage(buffer, 0, 0);
  }
}

function drawDebris(dt) {
  for (let i = view.debris.length - 1; i >= 0; i--) {
    const piece = view.debris[i];
    piece.life -= dt;
    if (piece.life <= 0) {
      view.debris.splice(i, 1);
      continue;
    }
    piece.vy += 70 * dt;
    piece.x += piece.vx * dt;
    piece.y += piece.vy * dt;
    ctx.fillStyle = piece.color;
    ctx.fillRect(Math.round(piece.x), Math.round(piece.y), 2, 2);
  }
}

/**
 * Draw one frame.
 *
 * @param {number} time  animation clock in seconds
 * @param {number} dt    seconds since the last frame
 * @param {?object} enemy the current target, or null between nodes
 */
export function drawEnemy(time, dt, enemy) {
  drawBackdrop(time);

  if (!enemy || view.destroyed) {
    if (!view.debris.length) drawStatic();
  } else {
    drawPortrait(enemy, time);
    view.hitFlash = Math.max(0, view.hitFlash - dt * 2.4);
  }

  drawDebris(dt);
}
