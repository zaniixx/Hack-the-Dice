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
 * Firewall strength. Nodes ramp by 55% each, the boss node is worth 2.2 of
 * them, and every server multiplies the whole curve by 7 — which is why score
 * has to grow multiplicatively to keep up.
 */
export function nodeHP(server, node) {
  const bossBonus = node === BOSS_NODE ? 2.2 : 1;
  return Math.round(40 * Math.pow(1.55, node - 1) * bossBonus * Math.pow(7, server - 1));
}
