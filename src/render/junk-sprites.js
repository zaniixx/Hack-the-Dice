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
 * LEGO BRICK — a 2x2 brick, studs up.
 *
 * It rolls 1 to 4 and it has four pegs, so the value is how many are lit. An
 * unlit peg is not drawn dim, it is not drawn at all: at this size a dim peg
 * and a lit one are the same peg, and then the die has no readable value.
 */
function paintLego(ctx, { value, color, light, dark, edge }) {
  // Studs on top.
  ctx.fillStyle = edge;
  row(ctx, 3, 0, 4, 3);
  row(ctx, 9, 0, 4, 3);
  ctx.fillStyle = light;
  row(ctx, 4, 1, 2, 1);
  row(ctx, 10, 1, 2, 1);

  // Body.
  ctx.fillStyle = edge;
  row(ctx, 1, 3, 14, 12);
  ctx.fillStyle = color;
  row(ctx, 2, 4, 12, 10);
  ctx.fillStyle = light;
  row(ctx, 2, 4, 12, 1);
  ctx.fillStyle = dark;
  row(ctx, 2, 13, 12, 1);

  // Pegs, lit up to the value and simply absent past it.
  const pegs = [[4, 6], [9, 6], [4, 10], [9, 10]];
  for (let i = 0; i < Math.min(value, 4); i++) {
    const [x, y] = pegs[i];
    ctx.fillStyle = edge;
    row(ctx, x - 1, y - 1, 5, 4);
    ctx.fillStyle = light;
    row(ctx, x, y, 3, 2);
  }
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
