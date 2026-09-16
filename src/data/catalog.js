/**
 * The three shop catalogs behind one lookup, so shop, inventory and save code
 * can treat an item as `{ kind, id }` without knowing which map it came from.
 */
import { ARTIFACTS } from './artifacts.js';
import { DICE } from './dice.js';
import { ABILITIES } from './abilities.js';

export const ItemKind = Object.freeze({
  ARTIFACT: 'art',
  DIE: 'die',
  ABILITY: 'abil',
});

const CATALOGS = {
  [ItemKind.ARTIFACT]: ARTIFACTS,
  [ItemKind.DIE]: DICE,
  [ItemKind.ABILITY]: ABILITIES,
};

/** Player-facing name for a kind, used on shop cards. */
export const KIND_LABELS = {
  [ItemKind.ARTIFACT]: 'Cyberartifact',
  [ItemKind.DIE]: 'Die',
  [ItemKind.ABILITY]: 'Ability',
};

/** The definition behind a shop item, or undefined if the item is unknown. */
export function definitionOf(item) {
  const catalog = item && CATALOGS[item.kind];
  return catalog ? catalog[item.id] : undefined;
}

/** Every id in a catalog, for shop generation. */
export function idsOf(kind) {
  return Object.keys(CATALOGS[kind]);
}

export function definitionIn(kind, id) {
  return CATALOGS[kind][id];
}
