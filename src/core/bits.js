/**
 * A bit-level writer and reader, plus base32 in the readable alphabet.
 *
 * Tournament codes are read aloud, typed on phones and scanned from a screen,
 * so every bit counts: packing the rules into bits and then into base32 is what
 * keeps a code short enough to fit in a small QR.
 */
import { READABLE_ALPHABET } from './game-random.js';

export class BitWriter {
  constructor() {
    this.bits = [];
  }

  /** Append `count` bits of `value`, most significant first. */
  write(value, count) {
    for (let i = count - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
    return this;
  }

  /** Append a string in `charset`, with a length prefix of `lengthBits`. */
  writeText(text, charset, lengthBits, maxLength) {
    const symbolBits = Math.ceil(Math.log2(charset.length));
    const clipped = [...String(text).slice(0, maxLength)]
      .map(ch => Math.max(0, charset.indexOf(ch)));

    this.write(clipped.length, lengthBits);
    for (const index of clipped) this.write(index, symbolBits);
    return this;
  }

  /** Pad to a whole base32 symbol and encode. */
  toBase32() {
    const bits = [...this.bits];
    while (bits.length % 5) bits.push(0);

    let out = '';
    for (let i = 0; i < bits.length; i += 5) {
      let value = 0;
      for (let j = 0; j < 5; j++) value = (value << 1) | bits[i + j];
      out += READABLE_ALPHABET[value];
    }
    return out;
  }
}

export class BitReader {
  constructor(bits) {
    this.bits = bits;
    this.at = 0;
  }

  /** Decode base32 back into a reader. Throws on an unknown symbol. */
  static fromBase32(text) {
    const bits = [];
    for (const ch of text.toUpperCase()) {
      const value = READABLE_ALPHABET.indexOf(ch);
      if (value < 0) throw new Error('bad symbol: ' + ch);
      for (let i = 4; i >= 0; i--) bits.push((value >> i) & 1);
    }
    return new BitReader(bits);
  }

  read(count) {
    if (this.at + count > this.bits.length) throw new Error('code ended early');
    let value = 0;
    for (let i = 0; i < count; i++) value = (value << 1) | this.bits[this.at++];
    return value;
  }

  readText(charset, lengthBits) {
    const symbolBits = Math.ceil(Math.log2(charset.length));
    const length = this.read(lengthBits);
    let text = '';
    for (let i = 0; i < length; i++) text += charset[this.read(symbolBits)];
    return text;
  }
}

/** Pack a list of ids into one bit per id, in `order`. */
export const packFlags = (writer, order, selected) => {
  for (const id of order) writer.write(selected.includes(id) ? 1 : 0, 1);
  return writer;
};

/** Read flags back into the ids that were set. */
export const unpackFlags = (reader, order) =>
  order.filter(() => reader.read(1) === 1);
