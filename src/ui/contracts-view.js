/**
 * The contracts screen: what you have done, and how much of it there is left.
 *
 * It follows the archive's rule rather than fighting it. One you have not run
 * is a locked slot with a question mark, not a to-do list item — the same
 * treatment a die you have never been offered gets, and for the same reason:
 * this game would rather you found things out than read about them first.
 *
 * That does mean a new player sees eighteen blanks. It is meant to: the first
 * few come off almost immediately just by playing, and each one that turns over
 * says what it was for, which is how you learn what the rest might be.
 */
import { ACHIEVEMENTS, ACHIEVEMENT_IDS } from '../data/achievements.js';
import { earnedContracts, earnedCount, contractTotal } from '../game/achievements.js';

const escape = text => String(text ?? '').replace(/[&<>"]/g,
  ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** The date it was run, for a card that has one. */
const runOn = at => {
  if (!at) return 'Complete';
  try {
    return new Date(at).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return 'Complete';
  }
};

function cardHTML(id, earned) {
  const done = earned[id];
  if (!done) {
    return `<div class="arc-card locked" title="Not run yet">
      <div class="arc-mark">?</div>
      <div class="arc-text"><b>UNKNOWN</b><small>Not run yet.</small></div>
    </div>`;
  }

  const { name, desc } = ACHIEVEMENTS[id];
  return `<div class="arc-card contract done" title="${escape(name)}: ${escape(desc)}">
    <div class="arc-mark">✓</div>
    <div class="arc-text">
      <b>${escape(name)}</b>
      <small>${escape(desc)}</small>
      <i>${escape(runOn(done))}</i>
    </div>
  </div>`;
}

export function contractsHTML() {
  // The stored map is id -> when, so a card can say the day it was run.
  const earned = earnedContracts();
  const done = earnedCount();
  const total = contractTotal();

  return `<div class="start-inner">
    <div class="panel-head">
      <h2>ACHIEVEMENTS</h2>
      <button class="btn sm" data-action="view:home">BACK</button>
    </div>
    <p class="lede">The jobs worth doing that the score does not ask for.
      What they were is on the card once it is run.
      <b>${done} of ${total} complete.</b></p>
    <section class="arc-section">
      <div class="arc-grid">
        ${ACHIEVEMENT_IDS.map(id => cardHTML(id, earned)).join('')}
      </div>
    </section>
  </div>`;
}
