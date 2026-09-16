/**
 * Enemy pixel art, painted procedurally into a 64x48 buffer.
 *
 * Each painter takes the offscreen context, the animation clock in seconds,
 * and the server's accent color. They animate off `time` alone, so they are
 * pure functions of the frame and can be called in any order.
 */
import { rand } from '../core/random.js';
import { shade } from './palette.js';

export const ENEMY_WIDTH = 64;
export const ENEMY_HEIGHT = 48;

/** Fill a rectangle. Shorthand, because these painters do nothing else. */
function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Fill a pixel-perfect circle, scanline by scanline. */
function disc(ctx, cx, cy, radius, color) {
  ctx.fillStyle = color;
  for (let dy = -radius; dy <= radius; dy++) {
    const halfWidth = Math.round(Math.sqrt(radius * radius - dy * dy));
    ctx.fillRect(cx - halfWidth, cy + dy, halfWidth * 2 + 1, 1);
  }
}

export const ENEMY_SPRITES = {
  /** Ordinary node: a server rack with blinking drive lights and a scan line. */
  rack(ctx, time, color) {
    rect(ctx, 19, 3, 26, 41, color);
    rect(ctx, 20, 4, 24, 39, '#17142b');
    rect(ctx, 20, 4, 24, 2, '#2b2750');

    for (let i = 0; i < 6; i++) {
      const y = 8 + i * 6;
      rect(ctx, 22, y, 20, 4, '#0b0918');
      const lit = Math.sin(time * (2.2 + i * 0.6) + i * 2.1) > 0;
      rect(ctx, 23, y + 1, 2, 2, lit ? (i % 3 === 0 ? '#ff4d6d' : '#b6ff3d') : '#2a2540');
      for (let x = 28; x < 41; x += 2) rect(ctx, x, y + 1, 1, 2, '#262142');
    }

    rect(ctx, 21, 44, 5, 2, color);
    rect(ctx, 38, 44, 5, 2, color);
    rect(ctx, 20, 4 + Math.floor((time * 18) % 39), 24, 1, 'rgba(255,255,255,.12)');
  },

  /** Ordinary node: a barred gate with a keyhole that pulses. */
  gate(ctx, time, color) {
    rect(ctx, 12, 4, 40, 40, color);
    rect(ctx, 14, 6, 36, 36, '#141129');

    for (let x = 17; x < 48; x += 5) {
      rect(ctx, x, 6, 2, 36, '#28234a');
      rect(ctx, x, 6, 1, 36, '#3b3566');
    }
    rect(ctx, 14, 21, 36, 6, '#1c1838');

    disc(ctx, 32, 24, 8, color);
    disc(ctx, 32, 24, 6, '#0b0918');

    const keyhole = Math.sin(time * 3) > 0 ? '#dfe6ff' : color;
    rect(ctx, 31, 20, 2, 3, keyhole);
    rect(ctx, 30, 23, 4, 1, keyhole);
    rect(ctx, 31, 24, 2, 4, keyhole);

    rect(ctx, 12, 4, 40, 1, shade(color, 0.45));
  },

  /** ANTIVIRUS: a shield with a flashing cross. */
  shield(ctx, time, color) {
    // The shield tapers below the shoulder line at y = 21.
    const halfWidthAt = y => {
      const local = y - 4;
      return local < 17 ? 16 : Math.round(16 - (local - 17) * 0.62);
    };

    for (let y = 4; y < 45; y++) {
      const w = halfWidthAt(y);
      if (w > 0) rect(ctx, 32 - w, y, w * 2, 1, color);
    }
    for (let y = 6; y < 43; y++) {
      const w = halfWidthAt(y) - 2;
      if (w > 0) rect(ctx, 32 - w, y, w * 2, 1, '#15122c');
    }

    const cross = Math.sin(time * 4) > 0 ? '#ff4d6d' : '#9e2540';
    rect(ctx, 29, 11, 6, 20, cross);
    rect(ctx, 22, 18, 20, 6, cross);

    rect(ctx, 17, 6 + Math.floor((time * 22) % 34), 30, 1, 'rgba(255,255,255,.18)');
  },

  /** ENCRYPTION KEY: a padlock body orbited by cipher bits. */
  key(ctx, time, color) {
    for (let i = 0; i < 14; i++) {
      const angle = time * 1.1 + (i * Math.PI * 2) / 14;
      const x = Math.round(32 + Math.cos(angle) * 23);
      const y = Math.round(25 + Math.sin(angle) * 19);
      rect(ctx, x - 1, y - 1, 2, 2, i % 2 ? '#3b3566' : color);
    }

    rect(ctx, 25, 8, 14, 2, color);
    rect(ctx, 25, 8, 2, 12, color);
    rect(ctx, 37, 8, 2, 12, color);
    rect(ctx, 20, 18, 24, 19, color);
    rect(ctx, 22, 20, 20, 15, '#15122c');

    // A grid of bits that churns deterministically, hashed from the frame.
    const frame = Math.floor(time * 8);
    for (let row = 0; row < 3; row++) {
      for (let bit = 0; bit < 9; bit++) {
        const lit = (((frame + bit * 7 + row * 13) * 2654435761) >>> 0) % 3 === 0;
        rect(ctx, 23 + bit * 2, 22 + row * 4, 1, 3, lit ? color : '#2a2548');
      }
    }
  },

  /** AI WATCHDOG: an eye that tracks, blinks, and is scanned by a red line. */
  eye(ctx, time, color) {
    const blinkPhase = time % 4.3;
    const openness = blinkPhase < 0.16 ? Math.abs(blinkPhase - 0.08) / 0.08 : 1;
    const halfHeightAt = x => Math.round(13 * (1 - (x / 25) ** 2) * openness);

    for (let x = -25; x <= 25; x++) {
      const h = halfHeightAt(x);
      if (h > 0) rect(ctx, 32 + x, 24 - h, 1, h * 2, '#15122c');
    }

    if (openness > 0.25) {
      // source-atop keeps the iris inside the eye shape as it looks around.
      ctx.globalCompositeOperation = 'source-atop';
      const irisX = Math.round(Math.sin(time * 0.9) * 9);
      const irisY = Math.round(Math.sin(time * 1.6) * 2);
      disc(ctx, 32 + irisX, 24 + irisY, 8, color);
      disc(ctx, 32 + irisX, 24 + irisY, 5, '#ff4d6d');
      disc(ctx, 32 + irisX, 24 + irisY, 2, '#07060f');
      rect(ctx, 35 + irisX, 20 + irisY, 2, 2, '#fff');
      ctx.globalCompositeOperation = 'source-over';
    }

    for (let x = -25; x <= 25; x++) {
      const h = halfHeightAt(x);
      rect(ctx, 32 + x, 24 - h - 1, 1, 1, color);
      rect(ctx, 32 + x, 24 + h, 1, 1, color);
    }

    rect(ctx, Math.floor((time * 30) % 64), 4, 1, 40, 'rgba(255,77,109,.2)');
  },
};

/** Eight jagged polylines, revealed one at a time as the firewall drops. */
export function makeCracks() {
  return Array.from({ length: 8 }, () => {
    let x = rand(20, 44);
    let y = rand(8, 40);
    const points = [[x, y]];
    for (let i = 0; i < 4; i++) {
      x += rand(-7, 7);
      y += rand(-6, 6);
      points.push([x, y]);
    }
    return points;
  });
}

/** Draw one crack as a chain of one-pixel segments. */
export function drawCrack(ctx, points) {
  ctx.fillStyle = '#07060f';
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let step = 0; step <= steps; step++) {
      const t = steps ? step / steps : 0;
      ctx.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1);
    }
  }
}
