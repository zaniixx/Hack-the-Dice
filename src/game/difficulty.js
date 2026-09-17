/**
 * The active threat level, applied.
 *
 * data/difficulty.js holds the numbers; this is where the rest of the game asks
 * what they mean right now. Everything that a tier can change goes through a
 * function here, so there is exactly one place to look when a run feels wrong.
 */
import { difficultyOf, DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { nodeHP } from '../data/enemies.js';
import { EDITIONS, slotsFrom } from '../data/editions.js';
import { BASE_ARTIFACT_SLOTS } from '../data/rules.js';
import { run } from './state.js';

/** The tier the current run is being played on, or the default before one starts. */
export const activeDifficulty = () => difficultyOf(run ? run.difficulty : DEFAULT_DIFFICULTY);

/**
 * Firewall strength for a node.
 *
 * A tier scales every firewall by the same amount and then ramps them again per
 * server, so choosing NATION STATE is not a flat surcharge: it is a steeper
 * curve, and the tiers pull apart the deeper a run gets.
 */
export function firewallHP(server, node) {
  const tier = activeDifficulty();
  const ramp = Math.pow(tier.firewallRamp, server - 1);
  return Math.round(nodeHP(server, node) * tier.firewallScale * ramp);
}

/**
 * Cyberartifact slots: what the tier allows, plus one for every NEGATIVE
 * edition installed.
 *
 * Slots are the scarcest thing in a deep run, which is what makes NEGATIVE the
 * stamp worth paying most for.
 */
export function artifactSlots() {
  const base = activeDifficulty().artifactSlots || BASE_ARTIFACT_SLOTS;
  if (!run) return base;
  return run.artifacts.reduce((total, id) => total + slotsFrom(run.editions[id]), base);
}

export const executesPerNode = () => activeDifficulty().executes;

export const rerollsPerRoll = () => activeDifficulty().rerolls;

/** What the market charges for an item at this tier, its edition included. */
export function priceOf(def, edition) {
  const stamp = EDITIONS[edition];
  const cost = def.cost * (stamp ? stamp.priceScale : 1);
  return Math.max(1, Math.round(cost * activeDifficulty().priceScale));
}

/** What selling it back returns: half of what it costs here, rounded down. */
export const sellValueOf = (def, edition) => Math.floor(priceOf(def, edition) / 2);
