/**
 * The black market between nodes.
 *
 * A visit offers artifacts, one die, and one ability. Offers are weighted
 * towards the highest tier the player has unlocked, so climbing servers feels
 * like better gear rather than just bigger numbers.
 *
 * Artifacts can also come stamped with an edition, and deep servers stamp more
 * of them: by then the rig is full and the only way to get more out of a slot
 * is to put something better in it.
 */
import { MAX_DICE, MAX_ABILITIES, MIN_DICE, MAX_TIER } from '../data/rules.js';
import { DICE } from '../data/dice.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { ABILITIES } from '../data/abilities.js';
import { EDITIONS, editionChance, slotsFrom } from '../data/editions.js';
import { ItemKind, definitionOf, definitionIn, idsOf } from '../data/catalog.js';
import { gameFloat } from '../core/game-random.js';
import { sfx } from '../audio/sfx.js';
import { setDicePool } from '../engine/dice-board.js';
import { log } from '../ui/log.js';
import { toast } from '../ui/fx.js';
import { updateUI, shopRefreshCost } from '../ui/hud.js';
import { run, Phase } from './state.js';
import { priceOf, sellValueOf, artifactSlots } from './difficulty.js';
import { isAllowed } from './tournament.js';
import { discoverOffers, discover } from './archive.js';
import { saveRun } from './save.js';

/** Highest tier the market stocks at this server. */
const topTier = () => Math.min(MAX_TIER, run.server);

/** Artifacts offered per visit: three from server 2 on. */
const artifactOffers = () => (run.server >= 2 ? 3 : 2);

/** Weighted pick from `ids`, with top-tier items twice as likely. */
function pickWeighted(kind, ids) {
  if (!ids.length) return null;

  const tier = topTier();
  const pool = ids.map(id => ({ id, weight: definitionIn(kind, id).tier === tier ? 2 : 1 }));
  let roll = gameFloat() * pool.reduce((total, entry) => total + entry.weight, 0);
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll < 0) return entry.id;
  }
  return pool[pool.length - 1].id;
}

/**
 * The stamp a market artifact comes wearing, or null for a plain one.
 *
 * Rolled once per offer, so a refresh is also a reroll of the editions on it.
 */
function rollEdition() {
  if (gameFloat() >= editionChance(run.server)) return null;

  const ids = Object.keys(EDITIONS);
  let roll = gameFloat() * ids.reduce((total, id) => total + EDITIONS[id].weight, 0);
  for (const id of ids) {
    roll -= EDITIONS[id].weight;
    if (roll < 0) return id;
  }
  return ids[ids.length - 1];
}

/** Available means unlocked at this server, and not banned by the tournament. */
const available = (kind, catalog, id) => catalog[id].tier <= topTier() && isAllowed(kind, id);

/** Roll a fresh set of offers. */
export function generateShop() {
  const artifactIds = idsOf(ItemKind.ARTIFACT)
    .filter(id => available(ItemKind.ARTIFACT, ARTIFACTS, id) && !run.artifacts.includes(id));
  const dieIds = idsOf(ItemKind.DIE).filter(id => available(ItemKind.DIE, DICE, id));
  const abilityIds = idsOf(ItemKind.ABILITY)
    .filter(id => available(ItemKind.ABILITY, ABILITIES, id) && !run.abilities.includes(id));

  const items = [];
  const offered = [];
  for (let slot = 0; slot < artifactOffers(); slot++) {
    const id = pickWeighted(ItemKind.ARTIFACT, artifactIds.filter(a => !offered.includes(a)));
    if (!id) continue; // the player already owns everything available
    offered.push(id);
    items.push({ kind: ItemKind.ARTIFACT, id, edition: rollEdition() });
  }

  const dieId = pickWeighted(ItemKind.DIE, dieIds);
  if (dieId) items.push({ kind: ItemKind.DIE, id: dieId });

  // Once every ability is owned or banned, the slot becomes a second die.
  const abilityId = pickWeighted(ItemKind.ABILITY, abilityIds);
  const fallbackDie = abilityId ? null : pickWeighted(ItemKind.DIE, dieIds);
  if (abilityId) items.push({ kind: ItemKind.ABILITY, id: abilityId });
  else if (fallbackDie) items.push({ kind: ItemKind.DIE, id: fallbackDie });

  run.shop = items;
  // Being offered something counts as meeting it, bought or not.
  discoverOffers(items);
}

/** Enter the market after a breach. */
export function openShop() {
  run.phase = Phase.SHOP;
  run.shopRefreshes = 0;
  generateShop();
  setDicePool(run.dice); // tray the dice up while the player shops
  saveRun();
  updateUI();
  log('> black market uplink open. Spend scrap, then breach the next node.', 'mag');
}

/** Reject a purchase with a reason. Always returns false, for early exits. */
function refuse(message) {
  toast(message);
  sfx.buzz();
  return false;
}

/** Install shop item `index`, if the player can afford and hold it. */
export function buyItem(index) {
  if (run.phase !== Phase.SHOP) return;

  const item = run.shop[index];
  if (!item || item.sold) return;
  const def = definitionOf(item);
  const price = priceOf(def, item.edition);
  if (run.scrap < price) return refuse('NOT ENOUGH DATA SCRAP');

  if (item.kind === ItemKind.ARTIFACT) {
    // NEGATIVE brings its own slot, so it is never the thing that will not fit.
    if (!slotsFrom(item.edition) && run.artifacts.length >= artifactSlots()) {
      return refuse('ARTIFACT SLOTS FULL: SELL ONE FIRST');
    }
    run.artifacts.push(item.id);
    if (item.edition) run.editions[item.id] = item.edition;
    discover(item.kind, item.id);
    if (def.stack) run.stacks[item.id] = 0; // starts counting from purchase
  } else if (item.kind === ItemKind.DIE) {
    if (run.dice.length >= MAX_DICE) return refuse('DICE POOL FULL: SELL ONE FIRST');
    run.dice.push(item.id);
    setDicePool(run.dice);
  } else {
    if (run.abilities.length >= MAX_ABILITIES) return refuse('ABILITY SLOTS FULL: SELL ONE FIRST');
    run.abilities.push(item.id);
  }

  run.scrap -= price;
  item.sold = true;
  sfx.coin();
  const stamp = EDITIONS[item.edition];
  log(`> installed ${stamp ? stamp.name + ' ' : ''}${def.name}`, 'cyan');
  saveRun();
  updateUI();
}

/** Sell the item at `index` of the given kind's inventory, for half price. */
export function sellItem(kind, index) {
  if (run.phase !== Phase.SHOP) return;

  let def;
  let edition = null;
  if (kind === ItemKind.DIE) {
    if (run.dice.length <= MIN_DICE) return; // the pool has a floor
    def = DICE[run.dice[index]];
    run.dice.splice(index, 1);
    setDicePool(run.dice);
  } else if (kind === ItemKind.ARTIFACT) {
    const id = run.artifacts[index];
    def = ARTIFACTS[id];
    edition = run.editions[id] || null; // read before it goes: it sets the price
    run.artifacts.splice(index, 1);
    delete run.stacks[id]; // a re-bought artifact starts counting again
    delete run.editions[id];
  } else {
    def = ABILITIES[run.abilities[index]];
    run.abilities.splice(index, 1);
  }
  if (!def) return;

  const value = sellValueOf(def, edition);
  run.scrap += value;
  sfx.coin();
  log(`> sold ${def.name} for ${value} scrap`, 'dim');
  saveRun();
  updateUI();
}

/**
 * Put the artifact row in a new order.
 *
 * Order is worth real damage — each slot pays out in full before the next, so
 * ×Mult artifacts want to sit to the right of the +Mult ones — so this is a
 * move the player makes, and it is saved like any other change to the rig.
 *
 * Anything the row does not mention is left where it was, which keeps a stale
 * or partial order from quietly dropping an artifact.
 *
 * @param {string[]} order artifact ids, left to right
 */
export function reorderArtifacts(order) {
  if (!run || !Array.isArray(order)) return;

  const moved = order.filter(id => run.artifacts.includes(id));
  const rest = run.artifacts.filter(id => !moved.includes(id));
  const next = [...moved, ...rest];
  if (next.join() === run.artifacts.join()) return;

  run.artifacts = next;
  saveRun();
  updateUI();
}

/** Pay to re-roll the offers. Each refresh this visit costs one more. */
export function refreshShop() {
  if (run.phase !== Phase.SHOP) return;

  const cost = shopRefreshCost();
  if (run.scrap < cost) {
    toast('NOT ENOUGH DATA SCRAP');
    return;
  }

  run.scrap -= cost;
  run.shopRefreshes++;
  generateShop();
  sfx.zap();
  saveRun();
  updateUI();
}
