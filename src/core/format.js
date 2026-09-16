/**
 * Number formatting for the HUD.
 *
 * Hacking power grows exponentially across servers, so raw numbers stop being
 * readable fast. `fmt` switches to short scale suffixes past 100k and to
 * exponential notation once it runs out of suffixes.
 */

const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
const SUFFIX_THRESHOLD = 100000;

/** Format a whole number: 1234 -> "1,234", 1.2e6 -> "1.20M". */
export function fmt(n) {
  if (!isFinite(n)) return '∞';
  n = Math.floor(n);
  if (Math.abs(n) < SUFFIX_THRESHOLD) return n.toLocaleString('en-US');

  let unit = 0;
  let value = n;
  while (Math.abs(value) >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  if (Math.abs(value) >= 1000) return n.toExponential(2).replace('e+', 'e');

  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return value.toFixed(digits) + UNITS[unit];
}

/** Format a multiplier, which is small and fractional far more often. */
export function fmtM(multiplier) {
  if (!isFinite(multiplier)) return '∞';
  if (multiplier >= SUFFIX_THRESHOLD) return fmt(multiplier);
  if (multiplier >= 100) return String(Math.round(multiplier));
  return String(Math.round(multiplier * 100) / 100);
}
