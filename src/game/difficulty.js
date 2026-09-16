/**
 * The active threat level, applied.
 *
 * data/difficulty.js holds the numbers; this is where the rest of the game asks
 * what they mean right now. Everything that a tier can change goes through a
 * function here, so there is exactly one place to look when a run feels wrong.
 */
import { difficultyOf, DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { nodeHP } from '../data/enemies.js';
import { run } from './state.js';

/** The tier the current run is being played on, or the default before one starts. */
export const activeDifficulty = () => difficultyOf(run ? run.difficulty : DEFAULT_DIFFICULTY);

/** Firewall strength for a node, scaled by the tier. */
export const firewallHP = (server, node) =>
  Math.round(nodeHP(server, node) * activeDifficulty().firewallScale);

export const executesPerNode = () => activeDifficulty().executes;

export const rerollsPerRoll = () => activeDifficulty().rerolls;

/** What the market charges for an item at this tier. */
export const priceOf = def => Math.max(1, Math.round(def.cost * activeDifficulty().priceScale));

/** What selling it back returns: half of what it costs here, rounded down. */
export const sellValueOf = def => Math.floor(priceOf(def) / 2);
