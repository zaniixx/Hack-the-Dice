/**
 * The archive screen: everything this device has come across, and the gaps.
 *
 * An entry the player has met shows what it is and what it does. One they have
 * not is a locked slot with a question mark — deliberately not a greyed-out
 * name, because half-telling someone what they have not found yet is worse than
 * not telling them at all.
 */
import { ARCHIVE_SECTIONS, EDITION_KIND, isDiscovered, progressOf } from '../game/archive.js';
import { ItemKind } from '../data/catalog.js';
import { iconURL } from '../render/icon-sprites.js';
import { dieIconURL } from '../render/die-sprites.js';

const escape = text => String(text ?? '').replace(/[&<>"]/g,
  ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** Dice draw their own face; everything else has an 8x8 icon. */
const iconFor = (kind, id, def) =>
  (kind === ItemKind.DIE ? dieIconURL(id) : iconURL(id, def.color));

/** What to call the rank of a thing: editions have no tier, the rest do. */
const tierLabel = (kind, def) =>
  (kind === EDITION_KIND ? 'Edition' : `Tier ${def.tier || 1}`);

function entryHTML(kind, id, def) {
  if (!isDiscovered(kind, id)) {
    return `<div class="arc-card locked" title="Not encountered yet">
      <div class="arc-mark">?</div>
      <div class="arc-text"><b>UNKNOWN</b><small>Not encountered yet.</small></div>
    </div>`;
  }
  return `<div class="arc-card" title="${escape(def.name)}: ${escape(def.desc)}">
    <img src="${iconFor(kind, id, def)}" alt="">
    <div class="arc-text">
      <b>${escape(def.name)}</b>
      <small>${escape(def.desc)}</small>
      <i>${tierLabel(kind, def)}</i>
    </div>
  </div>`;
}

function sectionHTML(section) {
  const { seen, total } = progressOf(section);
  const cards = Object.entries(section.catalog)
    .map(([id, def]) => entryHTML(section.kind, id, def))
    .join('');

  return `<section class="arc-section">
    <div class="sec-h">${section.title} <span>${seen}/${total}</span></div>
    <div class="arc-grid">${cards}</div>
  </section>`;
}

/** The whole archive, with a one-line summary of how much of it is filled. */
export function archiveHTML() {
  const totals = ARCHIVE_SECTIONS.reduce((sum, section) => {
    const { seen, total } = progressOf(section);
    return { seen: sum.seen + seen, total: sum.total + total };
  }, { seen: 0, total: 0 });

  return `<div class="start-inner">
    <div class="panel-head">
      <h2>ARCHIVE</h2>
      <button class="btn sm" data-action="view:home">BACK</button>
    </div>
    <p class="lede">Everything you have come across on this device — offered in
      the black market counts, bought or not.
      <b>${totals.seen} of ${totals.total} catalogued.</b></p>
    ${ARCHIVE_SECTIONS.map(sectionHTML).join('')}
  </div>`;
}
