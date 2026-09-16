/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb color towards a limit. */
export function shade(hex, amount) {
  const packed = parseInt(hex.slice(1), 16);
  let r = packed >> 16;
  let g = (packed >> 8) & 255;
  let b = packed & 255;

  if (amount > 0) {
    r += (255 - r) * amount;
    g += (255 - g) * amount;
    b += (255 - b) * amount;
  } else {
    r *= 1 + amount;
    g *= 1 + amount;
    b *= 1 + amount;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
