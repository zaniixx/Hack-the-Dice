/**
 * The dice board: a small 2.5D physics sandbox.
 *
 * Dice live in board pixels, not screen pixels — a fixed low-resolution space
 * that the renderer scales up, which is what keeps the pixel art crisp at any
 * window size. `z` is height above the board; gravity pulls it down, bounces
 * scrub velocity, and a die is `settled` once it has stopped moving and snapped
 * its rotation to a quarter turn.
 *
 * This module owns simulation only. It never touches the DOM, and it never
 * reads game state: the caller decides what a settled board means.
 */
import { DICE } from '../data/dice.js';
import { rand, randInt } from '../core/random.js';
import { gameInt } from '../core/game-random.js';
import { clamp } from '../core/math.js';
import { settings } from '../core/settings.js';
import { sfx } from '../audio/sfx.js';

// ---- Tuning -----------------------------------------------------------------

const GRAVITY = 460;          // board pixels per second squared
const DIE_RADIUS = 8;         // half a die sprite, used against the walls
const COLLIDE_DISTANCE = 15;  // centre distance at which two dice touch
const BOUNCE_RETAIN = 0.42;   // share of vertical speed kept per bounce
const WALL_RETAIN = 0.6;
const BOUNCE_MIN_SPEED = 45;  // slower than this and a die just stops
const MAX_PARTICLES = 320;
/** A roll that has not settled by now is forced to stop. */
export const MAX_ROLL_SECONDS = 4;
const TRAY_GAP = 22;

/** Logical board size, in board pixels, and the screen scale of one. */
export const board = { width: 200, height: 150, pixel: 3 };

/** Dice currently on the board. Rebuilt whenever the pool changes. */
export let dice = [];

/** Dust and spark particles. Positions are board pixels. */
export const particles = [];

/** Impact shake, in board pixels. The renderer consumes and decays it. */
export const camera = { shake: 0 };

let timeSinceThrow = 0;

// ---- Dice -------------------------------------------------------------------

/**
 * A die entity.
 *
 * value        the face this die will score with once settled
 * shownValue   the face being drawn, which flickers while tumbling
 * angle/spin   rotation and angular velocity, in radians
 * lift/flash   short-lived highlight, used when a die scores or is altered
 * scoringValue what it contributes this execute — the same as `value` except
 *              for mirror dice, which copy the highest value on the board
 * mirrorOf     for a mirror die, the value it is currently copying, or null
 *              while there is nothing to copy; see game/scoring.js
 */
function createDie(type) {
  const faces = DICE[type].faces;
  const value = faces === 6 ? gameInt(1, 6) : faces;
  return {
    type,
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    angle: 0, spin: 0,
    value,
    shownValue: value,
    scoringValue: value,
    mirrorOf: null,
    flickerTimer: 0,
    locked: false,
    quarantined: false,
    settled: true,
    lift: 0,
    flash: 0,
  };
}

/** Replace the board's dice with a fresh set for `types`, and tray them up. */
export function setDicePool(types) {
  dice = types.map(createDie);
  layoutTray();
}

/** Line the dice up along the bottom of the board, at rest. */
export function layoutTray() {
  const count = dice.length;
  if (!count) return;

  const gap = Math.min(TRAY_GAP, (board.width - 24) / Math.max(1, count - 1 || 1));
  const startX = board.width / 2 - (gap * (count - 1)) / 2;
  const trayY = board.height - Math.ceil(32 / board.pixel) - 9;

  dice.forEach((die, i) => {
    die.x = startX + i * gap;
    die.y = trayY;
    die.z = 0;
    die.vx = die.vy = die.vz = die.spin = 0;
    die.angle = 0;
    die.settled = true;
  });
}

/**
 * Throw dice into the air with new values.
 *
 * A full throw arcs up the board from the tray; a reroll is a shorter toss in
 * place, so locked dice stay visually where the player left them.
 */
/**
 * The highest face this particular die can show.
 *
 * Normally the catalog's answer, but a die can be worn down — an AA BATTERY
 * loses a face every node it survives. The engine has no idea why that happens
 * and no business knowing, so the game hands it a resolver at startup and this
 * asks. With nobody registered it is simply the catalog, which is what every
 * test page and every die but one wants.
 */
let wearOf = null;

/** Called once by the composition root. See game/session.js for the rule. */
export const resolveFaceCap = resolver => { wearOf = resolver; };

export const faceCap = die => {
  const worn = wearOf ? wearOf(die.type) : null;
  return Number.isFinite(worn) ? worn : DICE[die.type].faces;
};

/**
 * What a die lands on.
 *
 * A die type may bring its own `roll`, which is how a TOSSED COIN manages to
 * be a coin and a LOADED DIE manages to never disappoint. It is handed the die
 * — including the value it was already showing, which is what lets CHEWED GUM
 * ratchet upwards instead of starting over. Everything here stays on the
 * seeded stream, so a seed still replays exactly.
 */
function rollValue(die) {
  const def = DICE[die.type];
  const cap = faceCap(die);
  const rolled = def.roll ? def.roll(die, cap, gameInt) : gameInt(1, cap);
  return Math.max(1, Math.min(cap, Math.round(rolled)));
}

export function throwDice(list, { fullThrow }) {
  for (const die of list) {
    // The face is seeded; everything below it — the arc, the spin, the
    // tumbling faces on the way down — is cosmetic and stays unseeded.
    die.value = rollValue(die);
    die.settled = false;
    die.flickerTimer = 0;
    die.quarantined = false;
    // A mirror die lands blank and takes a value from the board afterwards.
    die.mirrorOf = null;

    if (fullThrow) {
      die.vx = rand(-90, 90);
      die.vy = -rand(80, 160) * (board.height / 160);
      die.vz = rand(95, 145);
      die.z = Math.max(die.z, 2);
    } else {
      die.vx = rand(-70, 70);
      die.vy = rand(-70, 70);
      die.vz = rand(85, 125);
      die.z = Math.max(die.z, 1);
    }
    die.spin = rand(-16, 16);
  }

  timeSinceThrow = 0;
  sfx.rattle();
}

/** True once every die has come to rest. */
export const allSettled = () => dice.every(die => die.settled);

/** Seconds of simulation since the last throw. */
export const secondsSinceThrow = () => timeSinceThrow;

/** Drop everything where it is — the escape hatch for a roll that won't settle. */
export function forceSettleAll() {
  for (const die of dice) {
    const quarter = DICE[die.type].faces === 6 ? Math.PI / 2 : Math.PI * 2;
    die.settled = true;
    die.z = 0;
    die.vx = die.vy = die.vz = die.spin = 0;
    die.shownValue = die.value;
    die.angle = Math.round(die.angle / quarter) * quarter;
  }
}

/** Clear per-execute markers so the next roll starts clean. */
export function unlockAll() {
  for (const die of dice) {
    die.locked = false;
    die.quarantined = false;
  }
}

/** Hop and sparkle: shows the player that a die was just changed. */
export function popDie(die) {
  die.lift = 6;
  die.flash = 1;
  spawnDust(die.x, die.y, DICE[die.type].color, 8);
}

/** The die under a board-space point, or null. Nearest wins on overlap. */
export function dieAt(x, y) {
  let hit = null;
  let bestDistance = Infinity;
  for (const die of dice) {
    const dx = x - die.x;
    const dy = y - (die.y - die.z);
    if (Math.abs(dx) >= 11 || Math.abs(dy) >= 11) continue;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      hit = die;
    }
  }
  return hit;
}

// ---- Board size -------------------------------------------------------------

/**
 * Resize the logical board, keeping the dice inside it.
 * Returns true when the size actually changed.
 */
export function resizeBoard(width, height, pixel) {
  if (board.width === width && board.height === height && board.pixel === pixel) return false;

  board.width = width;
  board.height = height;
  board.pixel = pixel;
  for (const die of dice) {
    die.x = clamp(die.x, 9, width - 9);
    die.y = clamp(die.y, 10, height - 10);
  }
  return true;
}

// ---- Particles --------------------------------------------------------------

/** Kick up `count` specks of dust at a board position. */
export function spawnDust(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    if (particles.length > MAX_PARTICLES) break;
    particles.push({
      x, y,
      vx: rand(-40, 40),
      vy: rand(-35, 8),
      life: rand(0.25, 0.55),
      color: Math.random() < 0.55 ? color : '#5d5780',
    });
  }
}

/** Advance particles. Driven by real time, so speeding up the game keeps dust honest. */
export function stepParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += 80 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

// ---- Simulation -------------------------------------------------------------

function onLanding(die, strength) {
  spawnDust(die.x, die.y + 5, DICE[die.type].color, 2 + Math.round(strength * 6));
  // Turned off by a player who finds it uncomfortable, or whose phone would
  // rather not redraw the whole board twice as often.
  if (settings.shake) camera.shake = Math.max(camera.shake, strength * 2.2);
  sfx.impact(strength);
}

function onWallHit(die) {
  if (Math.hypot(die.vx, die.vy) > 60) {
    spawnDust(die.x, die.y, '#3a3462', 3);
    sfx.clack();
  }
}

/** Gravity, bounce, friction and the tumbling face flicker, for one die. */
function stepDie(die, dt) {
  die.lift = Math.max(0, die.lift - dt * 30);
  die.flash = Math.max(0, die.flash - dt * 3);
  if (die.settled) return;

  const faces = DICE[die.type].faces;

  die.vz -= GRAVITY * dt;
  die.z += die.vz * dt;
  if (die.z <= 0) {
    die.z = 0;
    if (die.vz < -BOUNCE_MIN_SPEED) {
      const strength = Math.min(1, -die.vz / 170);
      onLanding(die, strength);
      die.vz = -die.vz * BOUNCE_RETAIN;
      die.spin = die.spin * 0.6 + rand(-5, 5) * strength;
      die.vx *= 0.82;
      die.vy *= 0.82;
    } else {
      die.vz = 0;
    }
  }

  // Friction is far higher on the ground than in the air.
  const grounded = die.z === 0 && die.vz === 0;
  const drag = grounded ? Math.pow(0.03, dt) : Math.pow(0.75, dt);
  die.vx *= drag;
  die.vy *= drag;
  die.spin *= grounded ? Math.pow(0.01, dt) : Math.pow(0.9, dt);

  die.x += die.vx * dt;
  die.y += die.vy * dt;
  die.angle += die.spin * dt;

  // Walls.
  if (die.x < DIE_RADIUS) {
    die.x = DIE_RADIUS;
    if (die.vx < 0) { die.vx = -die.vx * WALL_RETAIN; onWallHit(die); }
  }
  if (die.x > board.width - DIE_RADIUS) {
    die.x = board.width - DIE_RADIUS;
    if (die.vx > 0) { die.vx = -die.vx * WALL_RETAIN; onWallHit(die); }
  }
  if (die.y < DIE_RADIUS + 2) {
    die.y = DIE_RADIUS + 2;
    if (die.vy < 0) { die.vy = -die.vy * WALL_RETAIN; onWallHit(die); }
  }
  if (die.y > board.height - DIE_RADIUS - 2) {
    die.y = board.height - DIE_RADIUS - 2;
    if (die.vy > 0) { die.vy = -die.vy * WALL_RETAIN; onWallHit(die); }
  }

  const speed = Math.hypot(die.vx, die.vy);
  const moving = !grounded || speed > 6 || Math.abs(die.spin) > 1.2;

  if (moving) {
    // While it tumbles, show a face that is not necessarily the real one — a
    // mirror die has none to show, so it stays blank the whole way down.
    if (DICE[die.type].mirrors) return;
    die.flickerTimer -= dt;
    if (die.flickerTimer <= 0) {
      die.flickerTimer = 0.06 + Math.random() * 0.04;
      die.shownValue = !grounded || speed > 30 ? randInt(1, Math.min(faces, faceCap(die))) : die.value;
    }
    return;
  }

  // Coming to rest: show the real face and snap to a quarter turn.
  die.shownValue = die.value;
  die.vx = die.vy = 0;
  die.spin = 0;
  const quarter = faces === 6 ? Math.PI / 2 : Math.PI * 2;
  const target = Math.round(die.angle / quarter) * quarter;
  die.angle += (target - die.angle) * Math.min(1, dt * 14);
  if (Math.abs(target - die.angle) < 0.02) {
    die.angle = target % (Math.PI * 2);
    die.settled = true;
  }
}

/** Push apart any two dice that overlap, and trade some momentum. */
function resolveCollisions() {
  for (let i = 0; i < dice.length; i++) {
    const a = dice[i];
    for (let j = i + 1; j < dice.length; j++) {
      const b = dice[j];
      if (Math.abs(a.z - b.z) > 9) continue; // one is flying well over the other
      if (a.locked && b.locked) continue;

      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);
      if (distance >= COLLIDE_DISTANCE) continue;

      if (distance < 0.01) {
        dx = rand(-1, 1);
        dy = rand(-1, 1);
        distance = Math.hypot(dx, dy) || 1;
      }
      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = COLLIDE_DISTANCE - distance;

      // A locked die is immovable: its partner takes the whole correction.
      const weightA = a.locked ? 0 : b.locked ? 1 : 0.5;
      const weightB = b.locked ? 0 : a.locked ? 1 : 0.5;
      a.x -= nx * overlap * weightA;
      a.y -= ny * overlap * weightA;
      b.x += nx * overlap * weightB;
      b.y += ny * overlap * weightB;

      const closingSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (closingSpeed < 0) {
        const impulse = -closingSpeed * 0.9;
        a.vx -= impulse * nx * weightA * 2;
        a.vy -= impulse * ny * weightA * 2;
        b.vx += impulse * nx * weightB * 2;
        b.vy += impulse * ny * weightB * 2;
        if (impulse > 50) sfx.clack();
      }

      // A real shove wakes a settled die back up.
      if (overlap > 0.6) {
        if (weightA && !b.settled) a.settled = false;
        if (weightB && !a.settled) b.settled = false;
      }
    }
  }
}

/** Advance the simulation by `dt` seconds. */
export function stepPhysics(dt) {
  timeSinceThrow += dt;
  for (const die of dice) stepDie(die, dt);
  resolveCollisions();
}
