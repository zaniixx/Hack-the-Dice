/**
 * A small QR encoder, written for one job: turning a tournament join code into
 * something a phone camera can read.
 *
 * Scope is deliberately narrow — versions 1 to 6 at error correction level L,
 * which are all single-block, so there is no block interleaving to get wrong.
 * That is enough for roughly 130 bytes, and tournament codes are built to stay
 * well inside it (see game/tournament.js).
 *
 * Modes: alphanumeric when every character is in the QR alphanumeric set (which
 * a bare tournament code always is), byte otherwise (a join URL, say).
 */

/** Data and error-correction codewords per version at level L, versions 1-6. */
const DATA_CODEWORDS = [19, 34, 55, 80, 108, 136];
const ECC_CODEWORDS = [7, 10, 15, 20, 26, 36];

/** Versions 2+ carry 7 remainder bits after the codewords. */
const REMAINDER_BITS = [0, 7, 7, 7, 7, 7];

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const MODE_ALPHANUMERIC = 0b0010;
const MODE_BYTE = 0b0100;

/** Character count indicator width, for versions 1-9. */
const COUNT_BITS = { [MODE_ALPHANUMERIC]: 9, [MODE_BYTE]: 8 };

const sizeOf = version => 17 + 4 * version;

// ---- GF(256) ----------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // the QR primitive polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

const gfMul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** The generator polynomial for `degree` error correction codewords. */
export function generatorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Reed-Solomon remainder: the error correction codewords for `data`. */
export function reedSolomon(data, eccLength) {
  const generator = generatorPoly(eccLength);
  const buffer = new Uint8Array(data.length + eccLength);
  buffer.set(data);

  for (let i = 0; i < data.length; i++) {
    const factor = buffer[i];
    if (!factor) continue;
    for (let j = 0; j < generator.length; j++) {
      buffer[i + j] ^= gfMul(generator[j], factor);
    }
  }
  return Array.from(buffer.slice(data.length));
}

// ---- Bit stream -------------------------------------------------------------

const isAlphanumeric = text => [...text].every(ch => ALPHANUMERIC.includes(ch));

function encodeData(text, mode, version) {
  const bits = [];
  const push = (value, count) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  const bytes = mode === MODE_BYTE ? [...new TextEncoder().encode(text)] : null;
  const length = mode === MODE_BYTE ? bytes.length : text.length;

  push(mode, 4);
  push(length, COUNT_BITS[mode]);

  if (mode === MODE_BYTE) {
    for (const byte of bytes) push(byte, 8);
  } else {
    // Alphanumeric packs character pairs into 11 bits, a lone tail into 6.
    for (let i = 0; i < text.length; i += 2) {
      const first = ALPHANUMERIC.indexOf(text[i]);
      if (i + 1 < text.length) push(first * 45 + ALPHANUMERIC.indexOf(text[i + 1]), 11);
      else push(first, 6);
    }
  }

  const capacityBits = DATA_CODEWORDS[version - 1] * 8;
  // Terminator, then pad to a byte, then the standard alternating filler.
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  }
  const padBytes = [0xec, 0x11];
  for (let i = 0; codewords.length < DATA_CODEWORDS[version - 1]; i++) {
    codewords.push(padBytes[i % 2]);
  }
  return codewords;
}

/** How many bits `text` needs in `mode`, excluding padding. */
function bitCost(text, mode) {
  const header = 4 + COUNT_BITS[mode];
  if (mode === MODE_BYTE) return header + new TextEncoder().encode(text).length * 8;
  return header + Math.floor(text.length / 2) * 11 + (text.length % 2) * 6;
}

/** Smallest supported version that fits, or null if the text is too long. */
function chooseVersion(text, mode) {
  const needed = bitCost(text, mode);
  for (let version = 1; version <= DATA_CODEWORDS.length; version++) {
    if (needed <= DATA_CODEWORDS[version - 1] * 8) return version;
  }
  return null;
}

// ---- Module placement -------------------------------------------------------

function blankMatrix(size) {
  return {
    size,
    modules: Array.from({ length: size }, () => new Array(size).fill(0)),
    /** Function patterns and format areas: never masked, never carry data. */
    reserved: Array.from({ length: size }, () => new Array(size).fill(false)),
  };
}

function drawFinder(qr, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const y = row + r;
      const x = col + c;
      if (y < 0 || y >= qr.size || x < 0 || x >= qr.size) continue;
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6))
        || (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      qr.modules[y][x] = inRing || inCore ? 1 : 0;
      qr.reserved[y][x] = true;
    }
  }
}

function drawAlignment(qr, row, col) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      qr.modules[row + r][col + c] =
        Math.max(Math.abs(r), Math.abs(c)) !== 1 ? 1 : 0;
      qr.reserved[row + r][col + c] = true;
    }
  }
}

function drawFunctionPatterns(qr, version) {
  const size = qr.size;

  drawFinder(qr, 0, 0);
  drawFinder(qr, 0, size - 7);
  drawFinder(qr, size - 7, 0);

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    const bit = i % 2 === 0 ? 1 : 0;
    qr.modules[6][i] = bit;
    qr.modules[i][6] = bit;
    qr.reserved[6][i] = true;
    qr.reserved[i][6] = true;
  }

  // Versions 2-6 have exactly one alignment pattern, opposite the finders.
  if (version >= 2) drawAlignment(qr, size - 7, size - 7);

  // Format information areas, plus the module that is always dark.
  for (let i = 0; i < 9; i++) {
    if (!qr.reserved[8][i]) { qr.reserved[8][i] = true; qr.modules[8][i] = 0; }
    if (!qr.reserved[i][8]) { qr.reserved[i][8] = true; qr.modules[i][8] = 0; }
  }
  for (let i = 0; i < 8; i++) {
    qr.reserved[8][size - 1 - i] = true;
    qr.reserved[size - 1 - i][8] = true;
  }
  qr.modules[size - 8][8] = 1;
  qr.reserved[size - 8][8] = true;
}

/** Walk the zigzag, two columns at a time from the right, placing each bit. */
function placeData(qr, codewords, remainderBits) {
  const bits = [];
  for (const codeword of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((codeword >> i) & 1);
  }
  for (let i = 0; i < remainderBits; i++) bits.push(0);

  let index = 0;
  let upward = true;
  for (let right = qr.size - 1; right > 0; right -= 2) {
    // The vertical timing pattern is not a data column.
    if (right === 6) right = 5;

    for (let step = 0; step < qr.size; step++) {
      const row = upward ? qr.size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (qr.reserved[row][col]) continue;
        qr.modules[row][col] = index < bits.length ? bits[index++] : 0;
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  r => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(qr, mask) {
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (!qr.reserved[row][col] && MASKS[mask](row, col)) {
        qr.modules[row][col] ^= 1;
      }
    }
  }
}

/** Format information: level L, the chosen mask, BCH(15,5) protected. */
export function formatBits(mask) {
  const data = (0b01 << 3) | mask; // 01 is error correction level L
  let remainder = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((remainder >> i) & 1) remainder ^= 0b10100110111 << (i - 10);
  }
  return ((data << 10) | remainder) ^ 0b101010000010010;
}

function drawFormat(qr, mask) {
  const bits = formatBits(mask);
  const size = qr.size;

  for (let i = 0; i < 15; i++) {
    const bit = (bits >> i) & 1;

    // Around the top-left finder.
    if (i < 6) qr.modules[8][i] = bit;
    else if (i === 6) qr.modules[8][7] = bit;
    else if (i === 7) qr.modules[8][8] = bit;
    else if (i === 8) qr.modules[7][8] = bit;
    else qr.modules[14 - i][8] = bit;

    // The second copy: seven bits up the bottom-left column, eight along the
    // top-right row. The module below that column is always dark and is not
    // part of the format information.
    if (i < 7) qr.modules[size - 1 - i][8] = bit;
    else qr.modules[8][size - 15 + i] = bit;
  }
}

/** The standard penalty score: lower masks are less likely to confuse a scanner. */
function penalty(qr) {
  const size = qr.size;
  const at = (r, c) => qr.modules[r][c];
  let score = 0;

  // Rule 1: runs of five or more of the same colour.
  for (let i = 0; i < size; i++) {
    let runRow = 1;
    let runCol = 1;
    for (let j = 1; j < size; j++) {
      runRow = at(i, j) === at(i, j - 1) ? runRow + 1 : 1;
      if (runRow === 5) score += 3;
      else if (runRow > 5) score += 1;

      runCol = at(j, i) === at(j - 1, i) ? runCol + 1 : 1;
      if (runCol === 5) score += 3;
      else if (runCol > 5) score += 1;
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const value = at(r, c);
      if (value === at(r, c + 1) && value === at(r + 1, c) && value === at(r + 1, c + 1)) {
        score += 3;
      }
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 patterns.
  const pattern = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const reverse = [...pattern].reverse();
  const matches = (get, i, j, candidate) =>
    candidate.every((bit, k) => get(i, j + k) === bit);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j + 11 <= size; j++) {
      if (matches((a, b) => at(a, b), i, j, pattern)) score += 40;
      if (matches((a, b) => at(a, b), i, j, reverse)) score += 40;
      if (matches((a, b) => at(b, a), i, j, pattern)) score += 40;
      if (matches((a, b) => at(b, a), i, j, reverse)) score += 40;
    }
  }

  // Rule 4: drift away from half dark.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += at(r, c);
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/**
 * The function-pattern map for a version: true where a module is a finder,
 * timing or format module rather than data. Exported so tests can decode a
 * matrix without guessing which modules carry payload.
 */
export function reservedMap(version) {
  const qr = blankMatrix(sizeOf(version));
  drawFunctionPatterns(qr, version);
  return qr.reserved;
}

/**
 * Encode `text` as a QR matrix.
 *
 * @returns {{size: number, modules: number[][], version: number, mask: number}}
 *          or null when the text is longer than version 6 at level L can hold
 */
export function qrMatrix(text) {
  const mode = isAlphanumeric(text) ? MODE_ALPHANUMERIC : MODE_BYTE;
  const version = chooseVersion(text, mode);
  if (!version) return null;

  const data = encodeData(text, mode, version);
  const codewords = [...data, ...reedSolomon(data, ECC_CODEWORDS[version - 1])];

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const qr = blankMatrix(sizeOf(version));
    drawFunctionPatterns(qr, version);
    placeData(qr, codewords, REMAINDER_BITS[version - 1]);
    applyMask(qr, mask);
    drawFormat(qr, mask);

    const score = penalty(qr);
    if (!best || score < best.score) best = { qr, mask, score };
  }

  return {
    size: best.qr.size,
    modules: best.qr.modules,
    version,
    mask: best.mask,
  };
}

/**
 * Render `text` as an inline SVG QR code.
 *
 * One path of rectangles on a light background, with the quiet zone a scanner
 * needs. Returns an empty string when the text will not fit.
 */
export function qrSVG(text, { moduleSize = 4, quiet = 4, dark = '#07060f', light = '#dfe6ff' } = {}) {
  const qr = qrMatrix(text);
  if (!qr) return '';

  const span = qr.size + quiet * 2;
  let path = '';
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (qr.modules[row][col]) path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }

  return `<svg class="qr" viewBox="0 0 ${span} ${span}" width="${span * moduleSize}"
    height="${span * moduleSize}" shape-rendering="crispEdges" role="img"
    aria-label="QR code for this tournament">
    <rect width="${span}" height="${span}" fill="${light}"/>
    <path d="${path}" fill="${dark}"/>
  </svg>`;
}
