/**
 * Ordinary nodes: what they look like, and how hard they hit back.
 *
 * Boss protocols live in bosses.js and the corporations that own these nodes,
 * including the names the nodes get, live in corps.js.
 */
import { BOSS_NODE } from './rules.js';

/** Sprites an ordinary node can wear. */
export const NODE_SPRITES = ['rack', 'gate'];

/**
 * Firewall tuning.
 *
 * A run is a race between two exponentials, and the player's side of it
 * compounds: MOORE'S LAW doubles on every migration, BLOCKCHAIN compounds per
 * node and SINGULARITY per server, so a build that comes together on server 2
 * grows faster every server after. A firewall curve that multiplied by a fixed
 * amount per server would be left behind by that within a couple of migrations,
 * which is exactly how a run stops being a fight once the early game is passed.
 *
 * So the step widens. Server 2 costs SERVER_STEP, and every step after it is
 * SERVER_ACCEL times the one before — the firewalls accelerate the same way the
 * rig does, and staying ahead means the build has to keep compounding rather
 * than coasting on what it was.
 */
export const HP_BASE = 40;        // node 1 of server 1
export const NODE_RAMP = 1.55;    // each node deeper into a server
export const BOSS_BONUS = 2.2;    // node 5, on top of its own ramp
export const SERVER_STEP = 7.2;   // server 2 over server 1
export const SERVER_ACCEL = 1.09; // and every step after it, widened by this

/**
 * How much bigger a server's firewalls are than server 1's.
 *
 * Server 1 is 1, server 2 is SERVER_STEP, and each server after multiplies by a
 * step that has itself grown — so the curve is super-exponential rather than a
 * flat multiple per server.
 */
export function serverScale(server) {
  let scale = 1;
  for (let s = 2; s <= server; s++) scale *= SERVER_STEP * Math.pow(SERVER_ACCEL, s - 2);
  return scale;
}

/** Firewall strength, before the threat level scales it. */
export function nodeHP(server, node) {
  const bossBonus = node === BOSS_NODE ? BOSS_BONUS : 1;
  return Math.round(HP_BASE * Math.pow(NODE_RAMP, node - 1) * bossBonus * serverScale(server));
}
