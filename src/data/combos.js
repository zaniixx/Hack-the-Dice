/**
 * Pattern detection over the values a set of dice is scoring for.
 *
 * Used both by artifacts (HASH COLLISION, SEQUENCE BREAKER) and by the combo
 * readout above the board, so the preview can never disagree with the payout.
 */

/** How many pairs the values contain: three of a kind counts as one pair. */
export function countPairs(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return Object.values(counts).reduce((total, n) => total + Math.floor(n / 2), 0);
}

/** Length of the longest run of consecutive values, duplicates ignored. */
export function longestStraight(values) {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (!sorted.length) return 0;

  let best = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}
