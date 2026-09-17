/**
 * Tuning constants for the run structure.
 *
 * Anything a balance pass would want to touch lives here rather than being
 * buried in the flow code that reads it.
 */

/** Rig capacity. Buying past a cap asks the player to sell something first. */
export const MAX_DICE = 8;
export const MAX_ABILITIES = 3;

/**
 * Artifact slots before anything adjusts them.
 *
 * Deliberately fewer than there are artifacts worth owning: a rig that fits
 * every good idea is a rig with no decisions in it. The threat level may lower
 * this further, and a NEGATIVE edition raises it — see game/difficulty.js,
 * artifactSlots().
 */
export const BASE_ARTIFACT_SLOTS = 5;

/**
 * Highest tier the catalogs go to, and so the deepest gear a run can buy.
 *
 * A tier unlocks on the server of the same number, which is what makes a deep
 * run feel like better hardware rather than only bigger firewalls.
 */
export const MAX_TIER = 4;

/** The pool may never be sold below this, or a roll would be meaningless. */
export const MIN_DICE = 3;

/*
 * Executes, rerolls, starting scrap and market prices are set by the threat
 * level the run is played on: see data/difficulty.js and game/difficulty.js.
 */

/** Five nodes per server, the last of which runs a boss security protocol. */
export const NODES_PER_SERVER = 5;
export const BOSS_NODE = 5;

/** Black market refresh costs this, plus one scrap per refresh already bought. */
export const SHOP_REFRESH_BASE_COST = 3;

/** AI WATCHDOG absorbs any die showing this value or less. */
export const WATCHDOG_ABSORB_MAX = 3;

/** ENCRYPTION KEY leaves this fraction of damage when no pair scored. */
export const CIPHER_DAMAGE_MULTIPLIER = 0.1;

/** MEMORY LEAK drains this share of the hit, per second, for this long. */
export const MEMORY_LEAK_RATE = 0.05;
export const MEMORY_LEAK_MS = 10000;

/** CACHE OVERFLOW multiplies breach rewards by this. */
export const CACHE_SCRAP_BONUS = 1.5;

/** Scrap held at a breach pays 1 interest per 10, capped here. */
export const INTEREST_PER_SCRAP = 10;
export const MAX_INTEREST = 5;
