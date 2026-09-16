/**
 * The tournament board as a race.
 *
 * Runs in progress sit on the same board as finished ones, ranked by the score
 * they would bank right now. As a runner breaches nodes they climb past people
 * who have already finished, and when they stop their score simply stops
 * moving — the row turns from live to final in place.
 *
 * Rows animate to their new positions with a FLIP: measure before the
 * re-render, measure after, and play the difference backwards.
 */
import { fmt } from '../core/format.js';
import { compareEntries } from '../services/store.js';

const escape = text => String(text).replace(/[<>&"]/g,
  ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));

const shortDate = at => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Finished results and runs in progress, ranked together. */
export function mergeBoard(finished, live) {
  return [
    ...finished.map(entry => ({ ...entry, live: false })),
    ...live.map(entry => ({ ...entry, live: true })),
  ].sort(compareEntries);
}

/**
 * The board.
 *
 * @param {object[]} rows       merged and sorted, best first
 * @param {?string} highlight   entry id to mark as the viewer's own
 */
export function raceBoardHTML(rows, { highlight = null } = {}) {
  if (!rows.length) {
    return '<p class="empty-note">No runs yet. Be the first.</p>';
  }

  const body = rows.map((entry, index) => {
    const rank = index + 1;
    const classes = [
      `rank-${Math.min(rank, 4)}`,
      entry.live ? 'live' : '',
      entry.id === highlight ? 'mine' : '',
    ].filter(Boolean).join(' ');

    return `<tr class="${classes}" data-row="${escape(entry.id)}">
      <td class="rank">${rank}</td>
      <td class="who">${escape(entry.handle)}${entry.live ? '<span class="live-tag">LIVE</span>' : ''}</td>
      <td class="score">${fmt(entry.score)}</td>
      <td class="depth">S${entry.server} N${entry.node}</td>
      <td class="hack">${fmt(entry.biggest)}</td>
      <td class="when">${entry.live ? 'running' : shortDate(entry.at)}</td>
    </tr>`;
  }).join('');

  return `<div class="board-scroll"><table class="board race">
    <thead><tr>
      <th>#</th><th>Runner</th><th>Score</th><th>Depth</th><th>Biggest hack</th><th>Status</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

/** Where every row sits right now, keyed by entry id. */
export function captureRowPositions(container) {
  const positions = new Map();
  for (const row of container.querySelectorAll('[data-row]')) {
    positions.set(row.dataset.row, row.getBoundingClientRect().top);
  }
  return positions;
}

/**
 * Play the change in standings: rows slide from where they were, and anyone who
 * gained places flashes as they arrive.
 */
export function animateRankChanges(container, before) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  for (const row of container.querySelectorAll('[data-row]')) {
    const previousTop = before.get(row.dataset.row);

    if (previousTop === undefined) {
      row.animate(
        [{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: 'steps(6)' });
      continue;
    }

    const delta = previousTop - row.getBoundingClientRect().top;
    if (!delta) continue;

    row.animate(
      [{ transform: `translateY(${delta}px)` }, { transform: 'none' }],
      { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });

    if (delta > 0) { // climbed
      row.animate(
        [{ background: 'rgba(182,255,61,.28)' }, { background: 'transparent' }],
        { duration: 700, easing: 'ease-out' });
    }
  }
}
