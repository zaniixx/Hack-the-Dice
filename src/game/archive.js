/**
 * The archive: what this device has seen.
 *
 * Every die, ability, cyberartifact and edition the player has come across is
 * remembered across runs, so the catalogs stop being a surprise you have to
 * keep re-learning and start being a collection with holes in it. What has not
 * turned up yet is shown as a blank, which is the point — the archive is as
 * interesting for what is missing from it as for what is in it.
 *
 * Seeing counts, not owning. An item offered in the black market has been
 * encountered whether or not there was scrap for it, because the thing worth
 * remembering is that it exists.
 *
 * Scope is this browser, like the profile and for the same reason: it is a
 * record of what you have played, not a score anyone competes on, so it never
 * goes near the shared board.
 */
import { readJSON, writeJSON } from '../core/storage.js';
import { DICE } from '../data/dice.js';
import { ABILITIES } from '../data/abilities.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { EDITIONS } from '../data/editions.js';
import { ItemKind } from '../data/catalog.js';

const ARCHIVE_KEY = 'htd_archive_v1';

/** Editions are archived too, under a key of their own. */
export const EDITION_KIND = 'edition';

/** Every kind the archive tracks, with the catalog it is counted against. */
export const ARCHIVE_SECTIONS = [
  { kind: ItemKind.DIE, title: 'DICE', catalog: DICE },
  { kind: ItemKind.ABILITY, title: 'ABILITIES', catalog: ABILITIES },
  { kind: ItemKind.ARTIFACT, title: 'CYBERARTIFACTS', catalog: ARTIFACTS },
  { kind: EDITION_KIND, title: 'EDITIONS', catalog: EDITIONS },
];

/** Ids seen so far, as `{ [kind]: string[] }`. */
const load = () => readJSON(ARCHIVE_KEY, {});

/**
 * Record that something has been seen.
 *
 * Silently ignores a blank id, so callers can hand it `item.edition` without
 * checking whether the item had one.
 */
export function discover(kind, id) {
  if (!kind || !id) return false;

  const seen = load();
  const ids = seen[kind] || [];
  if (ids.includes(id)) return false;

  seen[kind] = [...ids, id];
  writeJSON(ARCHIVE_KEY, seen);
  return true;
}

/** Record a whole market visit at once: the offers, and any stamps on them. */
export function discoverOffers(items) {
  for (const item of items) {
    discover(item.kind, item.id);
    discover(EDITION_KIND, item.edition);
  }
}

/** Record everything a run is carrying — its pool, its rig, its stamps. */
export function discoverRig(run) {
  if (!run) return;
  for (const type of run.dice) discover(ItemKind.DIE, type);
  for (const id of run.abilities) discover(ItemKind.ABILITY, id);
  for (const id of run.artifacts) {
    discover(ItemKind.ARTIFACT, id);
    discover(EDITION_KIND, run.editions[id]);
  }
}

export const isDiscovered = (kind, id) => (load()[kind] || []).includes(id);

/** How much of one catalog has turned up: `{ seen, total }`. */
export function progressOf(section) {
  const ids = Object.keys(section.catalog);
  const seen = load()[section.kind] || [];
  return { seen: ids.filter(id => seen.includes(id)).length, total: ids.length };
}

/** Every id of a kind that has been seen, in catalog order. */
export function seenOf(section) {
  const seen = load()[section.kind] || [];
  return Object.keys(section.catalog).filter(id => seen.includes(id));
}

/** Fill the archive in. */
export function revealAll() {
  const seen = {};
  for (const section of ARCHIVE_SECTIONS) seen[section.kind] = Object.keys(section.catalog);
  writeJSON(ARCHIVE_KEY, seen);
}

/** Empty it again, for testing what a first-time player sees. */
export function forgetAll() {
  writeJSON(ARCHIVE_KEY, {});
}
