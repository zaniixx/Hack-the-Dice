/**
 * The found junk, drawn as the objects it actually is.
 *
 * Everything else in the pool is a die, and a die is a rounded cube with pips
 * on it — render/die-sprites.js draws all of those from one shape. These are
 * not dice. A coin drawn as a tinted cube showing six pips is a cube, and no
 * amount of colour fixes that, so each of these paints its own 16x16 instead.
 *
 * Two rules they all follow, because the board is full of real dice and these
 * have to sit next to them without looking like a different game:
 *
 *   - lit from the top left, the same as the cube shading
 *   - a hard #07060f edge, so they read against the board at any rotation
 *
 * They are drawn upright. The board rotates them as it tumbles them, which is
 * what makes a battery roll rather than flip.
 */

/** Fill a run of pixels. Every shape here is built out of these. */
const row = (ctx, x, y, width, height = 1) => ctx.fillRect(x, y, width, height);

/**
 * A filled disc, by half-widths per row.
 *
 * Hand-tuned rather than computed: a 14px circle from a distance formula comes
 * out lumpy at this size, and a coin that is not round is not a coin.
 */
const DISC = [3, 5, 6, 7, 7, 7, 7, 7, 7, 7, 7, 6, 5, 3];

function disc(ctx, fill, inset = 0) {
  ctx.fillStyle = fill;
  DISC.forEach((half, i) => {
    const w = (half - inset) * 2;
    if (w > 0) row(ctx, 8 - (half - inset), i + 1, w);
  });
}

/**
 * TOSSED COIN — a struck disc.
 *
 * The shape carries the joke and the numeral carries the value. A portrait at
 * sixteen pixels is four grey blobs and nobody can read it mid-throw, so the
 * face is simply the number struck into the metal — which is what the die is
 * actually telling you.
 */
function paintCoin(ctx, { value, color, light, dark, edge, digits }) {
  disc(ctx, edge);
  disc(ctx, color, 1);

  // Struck rim: lit along the top left, shadowed along the bottom right.
  ctx.fillStyle = light;
  row(ctx, 6, 2, 4);
  row(ctx, 4, 3, 2);
  row(ctx, 3, 4, 1, 2);
  ctx.fillStyle = dark;
  row(ctx, 6, 13, 4);
  row(ctx, 11, 12, 2);
  row(ctx, 12, 10, 1, 2);

  ctx.fillStyle = edge;
  digits(ctx, value);
}

/**
 * AA BATTERY — a cell on end, with the charge it has left.
 *
 * Two things have to be readable at once, so they get separate halves: the
 * number it rolled is struck across the label, and the charge is a bar of five
 * cells underneath it that empties as the battery wears. A spent one is visibly
 * spent several nodes before it stops working, which is the warning.
 */
function paintBattery(ctx, { value, cap, color, light, dark, edge, digits }) {
  // Positive terminal.
  ctx.fillStyle = edge;
  row(ctx, 6, 0, 4, 2);
  ctx.fillStyle = light;
  row(ctx, 7, 0, 2, 1);

  // Casing.
  ctx.fillStyle = edge;
  row(ctx, 2, 1, 12, 15);
  ctx.fillStyle = color;
  row(ctx, 3, 2, 10, 13);
  ctx.fillStyle = light;
  row(ctx, 3, 2, 1, 13);
  ctx.fillStyle = dark;
  row(ctx, 12, 2, 1, 13);

  // The number, struck across the label.
  ctx.fillStyle = edge;
  ctx.save();
  ctx.translate(0, -2);
  digits(ctx, value);
  ctx.restore();

  /*
   * Charge: five cells, one per two faces, emptying from the right.
   *
   * An empty cell is left as the bare well rather than drawn in a dim colour.
   * Dimmed, all five read as lit at this size and the charge never appears to
   * move, which is the one thing this bar exists to show.
   */
  const lit = Math.max(0, Math.min(5, Math.ceil(cap / 2)));
  ctx.fillStyle = edge;
  row(ctx, 3, 11, 10, 4);
  ctx.fillStyle = light;
  for (let i = 0; i < lit; i++) row(ctx, 4 + i * 2, 12, 1, 2);
}

/**
 * A stud seen from the side: a short cylinder standing on top of the brick.
 */
const studSide = (ctx, x, y, { light, edge }) => {
  ctx.fillStyle = edge;
  row(ctx, x, y, 4, 3);
  ctx.fillStyle = light;
  row(ctx, x + 1, y + 1, 2, 1);
};

/**
 * A stud seen from above: a ring, lit on top and shadowed underneath.
 *
 * Four pixels across is the smallest a stud can be and still read as round
 * rather than as a square pip, which matters on the one face where four of them
 * are the whole point.
 */
const studTop = (ctx, x, y, { light, dark, edge }) => {
  ctx.fillStyle = edge;
  row(ctx, x + 1, y, 2, 1);
  row(ctx, x, y + 1, 4, 2);
  row(ctx, x + 1, y + 3, 2, 1);
  ctx.fillStyle = light;
  row(ctx, x + 1, y + 1, 2, 1);
  ctx.fillStyle = dark;
  row(ctx, x + 1, y + 2, 2, 1);
};

/** The brick's body: an outlined block, lit along the top, shadowed below. */
const block = (ctx, x, y, w, h, { color, light, dark, edge }) => {
  ctx.fillStyle = edge;
  row(ctx, x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = color;
  row(ctx, x, y, w, h);
  ctx.fillStyle = light;
  row(ctx, x, y, w, 1);
  ctx.fillStyle = dark;
  row(ctx, x, y + h - 1, w, 1);
};

/**
 * LEGO BRICK — a 2x2 brick, and the way it happened to land.
 *
 * Every other die in the pool shows a number. A brick does not have numbers on
 * it; it has studs, and which of them you can see is decided by which way up it
 * came to rest. So that is the face: four landings, drawn as four different
 * silhouettes, and the studs you can count are the value.
 *
 *   1  on its end, one stud showing        a narrow tower
 *   2  on its side, studs pointing right   low and wide, bumps off one edge
 *   3  tipped up on an edge, three showing the fourth stud hidden behind
 *   4  flat, studs up, all four            seen from above, and the one that pays
 *
 * The count and the landing agree on purpose. A player who has seen the brick
 * land studs up does not have to be told it was a four, and does not have to
 * remember that a four is the roll with the Mult on it — the reason is on the
 * face, which is the only way a rule like this is worth having.
 */
function paintLego(ctx, palette) {
  const { value, color, light, dark, edge } = palette;

  if (value <= 1) {
    /*
     * Upside down: it landed on its studs and you are looking at the underside.
     *
     * Drawn tall and narrow first, and it came out as a battery — which is a
     * real problem when there is an actual AA battery in the pool. Wide and low
     * with the hollow underside showing is unmistakably a brick, and one stud
     * peeking over the back edge says which way up without a word.
     */
    studSide(ctx, 6, 1, palette);
    block(ctx, 1, 4, 13, 10, palette);
    ctx.fillStyle = dark;
    row(ctx, 3, 6, 9, 7);
    ctx.fillStyle = edge;
    row(ctx, 6, 8, 3, 3);
    return;
  }

  if (value === 2) {
    // On its side, studs pointing right, the way a brick usually settles. The
    // studs are drawn the full height of the wall they are on, because two
    // small tabs off the edge read as damage rather than as studs.
    block(ctx, 1, 4, 10, 10, palette);
    ctx.fillStyle = edge;
    row(ctx, 11, 4, 4, 4);
    row(ctx, 11, 10, 4, 4);
    ctx.fillStyle = light;
    row(ctx, 11, 5, 3, 1);
    row(ctx, 11, 11, 3, 1);
    // The seam along the middle of the wall, so it is a brick lying down and
    // not a plain block with two lugs on it.
    ctx.fillStyle = dark;
    row(ctx, 2, 9, 9, 1);
    return;
  }

  if (value === 3) {
    /*
     * Tipped up on an edge: two studs near, one behind, the fourth out of
     * sight. The back one sits between the front two and overlaps them, which
     * is what makes it read as further away — spaced evenly across the top it
     * looked like a stud floating above the brick.
     */
    studSide(ctx, 6, 2, palette);
    studSide(ctx, 2, 5, palette);
    studSide(ctx, 10, 5, palette);
    block(ctx, 2, 8, 12, 6, palette);
    return;
  }

  /*
   * Flat, studs up, seen from above — all four studs, and the Mult.
   *
   * It is the only face drawn from overhead, which is what makes it obvious
   * across a board at a glance: three silhouettes are brick-shaped and this one
   * is a square with four circles in it. The face that pays should be the face
   * you can pick out without counting.
   */
  block(ctx, 1, 1, 14, 14, palette);
  ctx.fillStyle = dark;
  row(ctx, 1, 8, 14, 1);
  row(ctx, 8, 1, 1, 14);
  studTop(ctx, 3, 3, palette);
  studTop(ctx, 10, 3, palette);
  studTop(ctx, 3, 10, palette);
  studTop(ctx, 10, 10, palette);
}

/**
 * CHEWED GUM — a lump that has been sat on.
 *
 * The only thing on the board with no straight edge anywhere, which is what
 * makes it obvious among fourteen cubes. The pips are pressed into it and
 * outlined, because a dark pip on a mid-pink lump is not a pip at any size.
 */
function paintGum(ctx, { value, color, light, dark, edge }) {
  const LUMP = [0, 3, 5, 6, 7, 7, 7, 7, 7, 6, 6, 5, 4, 2];

  ctx.fillStyle = edge;
  LUMP.forEach((half, i) => half && row(ctx, 8 - half, i + 1, half * 2));
  ctx.fillStyle = color;
  LUMP.forEach((half, i) => half > 1 && row(ctx, 9 - half, i + 1, (half - 1) * 2));

  // Wet, not dry.
  ctx.fillStyle = light;
  row(ctx, 5, 3, 3);
  row(ctx, 4, 4, 2);

  // Pressed in: a dark well with a lit rim on its underside, so each pip reads
  // as a dent rather than a dot.
  const pips = [[7, 7], [5, 4], [10, 10], [4, 9], [11, 5], [7, 11]];
  for (let i = 0; i < Math.min(value, pips.length); i++) {
    const [x, y] = pips[i];
    ctx.fillStyle = edge;
    row(ctx, x, y, 2, 2);
    ctx.fillStyle = light;
    row(ctx, x, y + 2, 2, 1);
  }
}

/**
 * LOADED DIE — an ordinary die, if you are not looking closely.
 *
 * It has to pass for a cube at a glance, so the tell is one corner: the weight,
 * shaded into the body rather than cut out of it. Drawn in the edge colour it
 * read as a bite taken out of the die, which is a different object entirely.
 */
function paintLoaded(ctx, { value, color, light, dark, edge }) {
  ctx.fillStyle = edge;
  row(ctx, 1, 0, 14, 16);
  ctx.fillStyle = color;
  row(ctx, 2, 1, 12, 14);
  ctx.fillStyle = light;
  row(ctx, 2, 1, 12, 2);
  ctx.fillStyle = dark;
  row(ctx, 2, 12, 12, 3);

  // The weight, poured into the low corner and shaded, not punched through.
  ctx.fillStyle = dark;
  row(ctx, 11, 11, 3, 1);
  row(ctx, 10, 12, 4, 3);

  // Pips for 4, 5 and 6 — the only numbers it has.
  const LAYOUTS = {
    4: [[4, 4], [9, 4], [4, 9], [9, 9]],
    5: [[4, 3], [9, 3], [7, 7], [4, 11], [9, 11]],
    6: [[4, 3], [9, 3], [4, 7], [9, 7], [4, 11], [9, 11]],
  };
  ctx.fillStyle = edge;
  for (const [x, y] of LAYOUTS[value] || LAYOUTS[6]) row(ctx, x, y, 2, 2);
}

/**
 * FUZZY DICE — the pair off a mirror, cord and all.
 *
 * The fur is a broken outline rather than scattered pixels: dotted along every
 * edge it reads as pile, sprinkled at random it reads as a rendering fault.
 */
function paintFuzzy(ctx, { value, color, light, dark, edge }) {
  // Cord and knot.
  ctx.fillStyle = edge;
  row(ctx, 7, 0, 2, 3);
  ctx.fillStyle = light;
  row(ctx, 7, 0, 1, 2);

  // Body, inset to leave room for the pile around it.
  ctx.fillStyle = edge;
  row(ctx, 3, 3, 10, 12);
  ctx.fillStyle = color;
  row(ctx, 4, 4, 8, 10);
  ctx.fillStyle = light;
  row(ctx, 4, 4, 8, 2);
  ctx.fillStyle = dark;
  row(ctx, 4, 12, 8, 2);

  // Pile: every other pixel along all four edges.
  ctx.fillStyle = color;
  for (let x = 4; x < 12; x += 2) {
    row(ctx, x, 2, 1);
    row(ctx, x + 1, 15, 1);
  }
  for (let y = 5; y < 14; y += 2) {
    row(ctx, 2, y, 1);
    row(ctx, 13, y + 1, 1);
  }

  // Pips, in the layout a real die would use so the value still reads.
  const LAYOUTS = {
    1: [[7, 8]],
    2: [[5, 5], [9, 10]],
    3: [[5, 5], [7, 8], [9, 10]],
    4: [[5, 5], [9, 5], [5, 10], [9, 10]],
    5: [[5, 5], [9, 5], [7, 8], [5, 10], [9, 10]],
    6: [[5, 5], [9, 5], [5, 8], [9, 8], [5, 11], [9, 11]],
  };
  ctx.fillStyle = edge;
  for (const [x, y] of LAYOUTS[value] || LAYOUTS[6]) row(ctx, x, y, 2, 2);
}

/**
 * Which die draws itself, keyed by id.
 *
 * Keyed here rather than carried on the definition because data/dice.js sits
 * below render/ and must not reach up into it — the same reason MARKINGS in
 * die-sprites.js is a lookup and not a field.
 */
export const JUNK_BODIES = {
  coin: paintCoin,
  battery: paintBattery,
  lego: paintLego,
  gum: paintGum,
  loaded: paintLoaded,
  fuzzy: paintFuzzy,
};
