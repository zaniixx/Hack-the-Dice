/**
 * Draws the dice board.
 *
 * The canvas is sized in board pixels and scaled up with CSS, so one board
 * pixel is 2 or 3 real pixels and nothing is ever interpolated. The circuit
 * trace background is generated once per size into an offscreen canvas.
 */
import { board, dice, particles, camera, resizeBoard, faceCap } from '../engine/dice-board.js';
import { rand, randInt } from '../core/random.js';
import { DICE, mirrorSource } from '../data/dice.js';
import { dieSprite, whiteSprite, BLANK_FACE } from './die-sprites.js';

const BACKGROUND = '#07060f';

/** How long a mirror die takes to show that it has copied something, in seconds. */
const MIRROR_PULSE_S = 0.55;

let canvas = null;
let ctx = null;
let container = null;
const backgroundCanvas = document.createElement('canvas');

/** Hand the view its canvas and the element whose size it should follow. */
export function initBoardView(boardCanvas, boardContainer) {
  canvas = boardCanvas;
  ctx = canvas.getContext('2d');
  container = boardContainer;
}

/**
 * Match the canvas to its container. Returns true when the board was resized,
 * which tells the caller its dice may need re-laying out.
 */
export function syncBoardSize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return false;

  // Two board pixels per screen pixel on phones, three on desktop.
  const pixel = width < 520 ? 2 : 3;
  const boardWidth = Math.max(120, Math.floor(width / pixel));
  const boardHeight = Math.max(80, Math.floor(height / pixel));

  const sameSize =
    board.width === boardWidth &&
    board.height === boardHeight &&
    board.pixel === pixel &&
    canvas.width === boardWidth;
  if (sameSize) return false;

  resizeBoardTo(boardWidth, boardHeight, pixel);
  return true;
}

function resizeBoardTo(width, height, pixel) {
  // The engine owns the logical size, and keeps the dice inside it.
  resizeBoard(width, height, pixel);

  canvas.width = width;
  canvas.height = height;
  canvas.style.width = width * pixel + 'px';
  canvas.style.height = height * pixel + 'px';
  ctx.imageSmoothingEnabled = false;
  buildBackground();
}

/** Screen position of a die's centre, for launching HUD effects from it. */
export function dieToScreen(die) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + (die.x * rect.width) / board.width,
    y: rect.top + ((die.y - die.z - die.lift) * rect.height) / board.height,
  };
}

/** Board position under a pointer event. */
export function screenToBoard(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) * board.width) / rect.width,
    y: ((event.clientY - rect.top) * board.height) / rect.height,
  };
}

/** Set the board cursor — a pointer only when there is something to click. */
export function setBoardCursor(interactive) {
  canvas.style.cursor = interactive ? 'pointer' : 'default';
}

/**
 * Paint the backdrop: a dot grid, a scatter of drunk-walked circuit traces
 * each ending in a solder pad, and a border.
 */
function buildBackground() {
  backgroundCanvas.width = board.width;
  backgroundCanvas.height = board.height;
  const bg = backgroundCanvas.getContext('2d');

  bg.fillStyle = BACKGROUND;
  bg.fillRect(0, 0, board.width, board.height);

  bg.fillStyle = '#120f24';
  for (let x = 6; x < board.width; x += 12) {
    for (let y = 6; y < board.height; y += 12) bg.fillRect(x, y, 1, 1);
  }

  const traceCount = Math.floor((board.width * board.height) / 1600);
  const stepX = [1, 0, -1, 0];
  const stepY = [0, 1, 0, -1];
  for (let i = 0; i < traceCount; i++) {
    let x = randInt(0, board.width);
    let y = randInt(0, board.height);
    let direction = randInt(0, 3);
    const length = randInt(8, 40);

    bg.fillStyle = Math.random() < 0.15 ? '#1f1b40' : '#141129';
    for (let step = 0; step < length; step++) {
      bg.fillRect(x, y, 1, 1);
      if (Math.random() < 0.08) direction = (direction + (Math.random() < 0.5 ? 1 : 3)) % 4;
      x += stepX[direction];
      y += stepY[direction];
    }
    bg.fillStyle = '#262150';
    bg.fillRect(x - 1, y - 1, 3, 3);
  }

  bg.fillStyle = '#1c1738';
  bg.fillRect(0, 0, board.width, 1);
  bg.fillRect(0, board.height - 1, board.width, 1);
  bg.fillRect(0, 0, 1, board.height);
  bg.fillRect(board.width - 1, 0, 1, board.height);
}

/** Corner brackets and a handle: the "locked" marker around a die. */
function drawLockBrackets(x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = color;
  const offset = 10;
  const len = 3;

  ctx.fillRect(x - offset, y - offset, len, 1);
  ctx.fillRect(x - offset, y - offset, 1, len);
  ctx.fillRect(x + offset - len + 1, y - offset, len, 1);
  ctx.fillRect(x + offset, y - offset, 1, len);
  ctx.fillRect(x - offset, y + offset, len, 1);
  ctx.fillRect(x - offset, y + offset - len + 1, 1, len);
  ctx.fillRect(x + offset - len + 1, y + offset, len, 1);
  ctx.fillRect(x + offset, y + offset - len + 1, 1, len);

  ctx.fillRect(x - 2, y - 15, 5, 3);
  ctx.fillRect(x - 1, y - 17, 1, 2);
  ctx.fillRect(x + 1, y - 17, 1, 2);
}

/** A crossed-out box: the ANTIVIRUS quarantine marker. */
function drawQuarantineMark(x, y) {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = '#ff4d6d';
  for (let i = -7; i <= 7; i++) {
    ctx.fillRect(x + i, y + i, 1, 1);
    ctx.fillRect(x + i, y - i, 1, 1);
  }
  ctx.fillRect(x - 9, y - 9, 19, 1);
  ctx.fillRect(x - 9, y + 9, 19, 1);
  ctx.fillRect(x - 9, y - 9, 1, 19);
  ctx.fillRect(x + 9, y - 9, 1, 19);
}

/**
 * The face to draw on a die.
 *
 * A mirror die has none of its own: it is blank in the air and blank on the
 * board until there is something to copy, and then it wears that instead.
 */
function faceOf(die) {
  if (!DICE[die.type].mirrors) return die.shownValue || die.value;
  return die.mirrorOf || BLANK_FACE;
}

/**
 * Catch a mirror die the moment what it copies changes, and start its pulse.
 *
 * Done by watching rather than by being told, so it fires however the board
 * changed — a reroll landing, BIT SHIFT, CLONE, a die being locked out of a
 * throw — without every one of those having to remember to say so.
 */
function trackMirrors(dt) {
  for (const die of dice) {
    if (!DICE[die.type].mirrors) continue;
    if (die.mirrorOf !== die.mirrorDrawn) {
      die.mirrorDrawn = die.mirrorOf;
      // Only a value arriving is worth announcing; losing one is not.
      die.mirrorPulse = die.mirrorOf ? MIRROR_PULSE_S : 0;
    }
    if (die.mirrorPulse > 0) die.mirrorPulse = Math.max(0, die.mirrorPulse - dt);
  }
}

/**
 * The line from the die being copied to the mirror copying it.
 *
 * Drawn as marching dashes so it reads as a value travelling along it, and only
 * while the pulse lasts — it is an explanation, not decoration.
 */
function drawMirrorBeam(source, die, strength) {
  const fromX = Math.round(source.x);
  const fromY = Math.round(source.y - source.z - source.lift);
  const toX = Math.round(die.x);
  const toY = Math.round(die.y - die.z - die.lift);

  const span = Math.hypot(toX - fromX, toY - fromY);
  if (span < 2) return;

  const march = (performance.now() / 55) % 4;
  ctx.fillStyle = `rgba(201,209,255,${0.15 + 0.6 * strength})`;
  for (let along = march; along < span; along += 4) {
    const t = along / span;
    ctx.fillRect(Math.round(fromX + (toX - fromX) * t), Math.round(fromY + (toY - fromY) * t), 1, 1);
  }

  // A bracket around the die being copied, so it is obvious which one it is.
  ctx.fillRect(fromX - 10, fromY - 10, 3, 1);
  ctx.fillRect(fromX - 10, fromY - 10, 1, 3);
  ctx.fillRect(fromX + 8, fromY + 8, 3, 1);
  ctx.fillRect(fromX + 10, fromY + 8, 1, 3);
}

/**
 * Draw one frame.
 *
 * @param {number} dt seconds since the last frame, real time
 * @param {object} options
 * @param {?Function} options.isDoomed  marks dice the boss will not let score
 */
export function drawBoard(dt, { isDoomed = null } = {}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(backgroundCanvas, 0, 0);

  // Impact shake, decaying over real time.
  const shake = camera.shake;
  const shakeX = shake > 0.3 ? Math.round(rand(-shake, shake)) : 0;
  const shakeY = shake > 0.3 ? Math.round(rand(-shake, shake)) : 0;
  camera.shake = Math.max(0, shake - dt * 10);
  ctx.translate(shakeX, shakeY);

  // Shadows first, so no die ever casts one onto another.
  for (const die of dice) {
    const scale = Math.max(0.35, Math.min(1, 1 - die.z / 90));
    ctx.fillStyle = `rgba(0,0,0,${0.6 * scale})`;
    const width = Math.round(14 * scale);
    ctx.fillRect(Math.round(die.x - width / 2 + die.z * 0.25), Math.round(die.y + 6), width, 3);
  }

  trackMirrors(dt);

  // The beams go under the dice, so a die is never drawn over by its own line.
  const source = mirrorSource(dice);
  if (source) {
    for (const die of dice) {
      if (!DICE[die.type].mirrors || !(die.mirrorPulse > 0)) continue;
      drawMirrorBeam(source, die, die.mirrorPulse / MIRROR_PULSE_S);
    }
  }

  // Painter's algorithm: lower on the board, and lower in the air, draws last.
  const order = [...dice].sort((a, b) => a.y + a.z * 2 - (b.y + b.z * 2));
  const blink = Math.floor(performance.now() / 250) % 2;

  for (const die of order) {
    const screenY = die.y - die.z - die.lift;
    const scale = 1 + die.z / 220; // height reads as a slight zoom

    // A mirror die swells for a moment as it takes the value on.
    const pulse = die.mirrorPulse > 0 ? die.mirrorPulse / MIRROR_PULSE_S : 0;
    const drawScale = scale * (1 + 0.22 * pulse * pulse);

    ctx.save();
    ctx.translate(Math.round(die.x), Math.round(screenY));
    ctx.rotate(die.angle);
    if (drawScale !== 1) ctx.scale(drawScale, drawScale);
    // faceCap so a worn battery is drawn with the charge it has left.
    ctx.drawImage(dieSprite(die.type, faceOf(die), faceCap(die)), -8, -8);
    if (die.flash > 0 || pulse > 0) {
      ctx.globalAlpha = Math.min(1, Math.max(die.flash, pulse * 0.85));
      ctx.drawImage(whiteSprite(die.type), -8, -8);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (die.quarantined) {
      drawQuarantineMark(die.x, screenY);
    } else if (isDoomed && isDoomed(die)) {
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(Math.round(die.x - 6), Math.round(screenY + 11), 13, 2);
    }
    if (die.locked) drawLockBrackets(die.x, screenY, blink ? '#3df2ff' : '#dfe6ff');
  }

  for (const particle of particles) {
    ctx.fillStyle = particle.color;
    ctx.fillRect(Math.round(particle.x), Math.round(particle.y), 1, 1);
  }
}
