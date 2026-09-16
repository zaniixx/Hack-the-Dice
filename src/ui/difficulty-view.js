/**
 * Threat level pickers and pills.
 *
 * The colour ramp carries the meaning — lime, cyan, amber, red, in that order —
 * so the tiers read as a difficulty ladder before the names are even scanned.
 * Every card also spells out exactly what changes, taken from the tier data.
 */
import { DIFFICULTIES, DIFFICULTY_ORDER, difficultyOf, difficultySummary } from '../data/difficulty.js';

/** A small coloured pill naming a threat level. */
export function tierPill(id) {
  const tier = difficultyOf(id);
  return `<span class="tier-pill" style="--tier:${tier.color}">${tier.name}</span>`;
}

/**
 * The four threat levels as selectable cards.
 *
 * @param {string} selected  id of the chosen tier
 * @param {string} action    data-action prefix, so the same cards can drive the
 *                           start screen and the tournament host form
 */
export function difficultyCardsHTML(selected, action = 'difficulty') {
  return `<div class="tier-grid">${DIFFICULTY_ORDER.map(id => {
    const tier = DIFFICULTIES[id];
    const bullets = difficultySummary(id).map(text => `<li>${text}</li>`).join('');
    return `<button class="tier-card ${id === selected ? 'on' : ''}" style="--tier:${tier.color}"
                    data-action="${action}:${id}" aria-pressed="${id === selected}">
      <span class="tier-rank">${'█'.repeat(tier.rank)}${'░'.repeat(4 - tier.rank)}</span>
      <span class="tier-name">${tier.name}</span>
      <span class="tier-tagline">${tier.tagline}</span>
      <ul class="tier-stats">${bullets}</ul>
    </button>`;
  }).join('')}</div>`;
}
