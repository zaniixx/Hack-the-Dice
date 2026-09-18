/**
 * The wordmark, as pixels.
 *
 * The title used to be the body font with a CSS glitch layered over it, which
 * meant the letterforms were somebody else's and the "corruption" could only
 * ever slide whole copies of the word around. Corruption that means anything
 * has to happen to individual pixels, so the letters are drawn here instead.
 *
 * Eight glyphs is the whole alphabet this needs — HACK THE DICE reuses more
 * letters than it spends. They are 8 wide and 11 tall with two-pixel strokes,
 * heavy enough that a block can be punched out of one and the letter still
 * reads. render/logo-view.js is what animates them.
 */

export const LOGO_TEXT = 'HACK THE DICE';

export const GLYPH_WIDTH = 8;
export const GLYPH_HEIGHT = 11;
/** Blank columns between letters, and the width of a space. */
export const LETTER_GAP = 1;
export const SPACE_WIDTH = 5;

export const LOGO_GLYPHS = {
  H: [
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '########',
    '########',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
  ],
  A: [
    '..####..',
    '.######.',
    '##....##',
    '##....##',
    '##....##',
    '########',
    '########',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
  ],
  C: [
    '..######',
    '.#######',
    '##......',
    '##......',
    '##......',
    '##......',
    '##......',
    '##......',
    '##......',
    '.#######',
    '..######',
  ],
  K: [
    '##....##',
    '##...##.',
    '##..##..',
    '##.##...',
    '#####...',
    '#####...',
    '##.##...',
    '##..##..',
    '##...##.',
    '##....##',
    '##....##',
  ],
  T: [
    '########',
    '########',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
  ],
  E: [
    '########',
    '########',
    '##......',
    '##......',
    '######..',
    '######..',
    '##......',
    '##......',
    '##......',
    '########',
    '########',
  ],
  D: [
    '######..',
    '#######.',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '#######.',
    '######..',
  ],
  I: [
    '########',
    '########',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '########',
    '########',
  ],
};

/**
 * Garbage the corruption swaps a letter for.
 *
 * Deliberately letter-shaped rather than random noise: a block of static reads
 * as a rendering fault, while something that is almost a character reads as a
 * character that has been got wrong, which is the idea.
 */
export const GLYPH_JUNK = [
  [
    '#.#.#.#.',
    '.#.#.#.#',
    '#.#.#.#.',
    '########',
    '..####..',
    '########',
    '#.#.#.#.',
    '.#.#.#.#',
    '##....##',
    '.#.##.#.',
    '#.#..#.#',
  ],
  [
    '########',
    '#......#',
    '#.####.#',
    '#.#..#.#',
    '#.#..#.#',
    '#.####.#',
    '#......#',
    '########',
    '..#..#..',
    '.##..##.',
    '#.#..#.#',
  ],
  [
    '..#..#..',
    '.###.##.',
    '########',
    '##.##.##',
    '..####..',
    '########',
    '##....##',
    '.######.',
    '..#..#..',
    '.#.##.#.',
    '##.##.##',
  ],
];

/** Where each letter starts, and how wide the whole wordmark is. */
export function layoutLogo(text = LOGO_TEXT) {
  const cells = [];
  let x = 0;
  for (const char of text) {
    if (char === ' ') {
      x += SPACE_WIDTH;
      continue;
    }
    cells.push({ char, x });
    x += GLYPH_WIDTH + LETTER_GAP;
  }
  return { cells, width: Math.max(0, x - LETTER_GAP), height: GLYPH_HEIGHT };
}
