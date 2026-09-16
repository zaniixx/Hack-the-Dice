/**
 * Leaderboard tables.
 *
 * Pure rendering: hand it entries, get HTML. Used by both the all-comers board
 * on the start screen and the per-tournament boards.
 */
import { fmt } from '../core/format.js';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../data/difficulty.js';
import { tierPill } from './difficulty-view.js';

const escape = text => String(text).replace(/[<>&"]/g,
  ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));

const shortDate = at => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Filter tabs: one per threat level, plus all-comers. */
export function difficultyTabsHTML(active) {
  const tab = (id, label, color) =>
    `<button class="tab ${active === id ? 'on' : ''}" style="--tier:${color}"
             data-action="board:${id}">${label}</button>`;

  return `<div class="tabs">
    ${tab('all', 'ALL', 'var(--ink)')}
    ${DIFFICULTY_ORDER.map(id => tab(id, DIFFICULTIES[id].name, DIFFICULTIES[id].color)).join('')}
  </div>`;
}

/**
 * A board.
 *
 * @param {object[]} entries      already sorted, best first
 * @param {object}   options
 * @param {string}   options.empty      note shown when there is nothing yet
 * @param {boolean}  options.showTier   include the threat level column
 * @param {?string}  options.highlight  entry id to mark as "you"
 */
export function boardHTML(entries, { empty = 'No runs recorded yet.', showTier = true, highlight = null } = {}) {
  if (!entries.length) return `<p class="empty-note">${empty}</p>`;

  const rows = entries.map((entry, index) => {
    const rank = index + 1;
    const mine = entry.id === highlight ? ' mine' : '';
    return `<tr class="rank-${Math.min(rank, 4)}${mine}">
      <td class="rank">${rank}</td>
      <td class="who">${escape(entry.handle)}</td>
      <td class="score">${fmt(entry.score)}</td>
      ${showTier ? `<td class="tier">${tierPill(entry.difficulty)}</td>` : ''}
      <td class="depth">S${entry.server} N${entry.node}</td>
      <td class="hack">${fmt(entry.biggest)}</td>
      <td class="when">${shortDate(entry.at)}</td>
    </tr>`;
  }).join('');

  return `<div class="board-scroll"><table class="board">
    <thead><tr>
      <th>#</th><th>Runner</th><th>Score</th>${showTier ? '<th>Threat</th>' : ''}
      <th>Depth</th><th>Biggest hack</th><th>When</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
