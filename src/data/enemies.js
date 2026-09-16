/**
 * Targets: the ordinary nodes, the boss protocols that guard node 5, and the
 * corporations whose servers the run climbs through.
 */
import { BOSS_NODE } from './rules.js';

/**
 * Boss protocols. `rule` is shown to the player verbatim; each rule is
 * enforced in the code path it affects:
 *
 *   antivirus   game/turn.js      quarantines a die after every roll
 *   encryption  game/execute.js   cuts damage when no pair scored
 *   watchdog    game/scoring.js   absorbs low dice before they score
 */
export const BOSSES = {
  antivirus: {
    name: 'ANTIVIRUS',
    sprite: 'shield',
    rule: 'Quarantine: after every roll, one random die is quarantined and scores nothing.',
  },
  encryption: {
    name: 'ENCRYPTION KEY',
    sprite: 'key',
    rule: 'Cipher shield: an Execute without at least one pair deals only 10% damage.',
  },
  watchdog: {
    name: 'AI WATCHDOG',
    sprite: 'eye',
    rule: 'Absorption: dice showing 3 or less are absorbed and score nothing.',
  },
};

/** Bosses cycle in this order as the player climbs servers. */
export const BOSS_ORDER = ['antivirus', 'encryption', 'watchdog'];

export const bossForServer = server => BOSS_ORDER[(server - 1) % BOSS_ORDER.length];

/** Flavor names for ordinary nodes, and the sprites they can wear. */
export const NODE_NAMES = ['SMTP RELAY', 'AUTH GATE', 'PROXY-7', 'VPN TUNNEL', 'PAYROLL DB', 'HR PORTAL', 'CCTV HUB', 'BACKUP VAULT', 'DNS RESOLVER', 'BILLING API', 'R&D ARCHIVE', 'EXEC MAILBOX', 'BADGE SERVER', 'LEGAL SHARE'];
export const NODE_SPRITES = ['rack', 'gate'];

/** Corporations, in the order their servers are breached. */
export const CORPS = ['OMNIDYNE', 'KAIROS BIOTECH', 'HELIX CAPITAL', 'ZENTRA DEFENSE', 'NULLSEC ORBITAL', 'ARCHON AI'];

/** One accent color per server, so each tier reads differently. */
export const SERVER_COLORS = ['#3df2ff', '#ff3df0', '#b6ff3d', '#ffc23d', '#9a7bff', '#ff4d6d'];

/** Past the last corp the list repeats with an MK2, MK3... suffix. */
export function corpName(server) {
  const base = CORPS[(server - 1) % CORPS.length];
  const cycle = Math.floor((server - 1) / CORPS.length);
  return cycle ? `${base} MK${cycle + 1}` : base;
}

/**
 * Firewall strength. Nodes ramp by 55% each, the boss node is worth 2.2 of
 * them, and every server multiplies the whole curve by 7 — which is why score
 * has to grow multiplicatively to keep up.
 */
export function nodeHP(server, node) {
  const bossBonus = node === BOSS_NODE ? 2.2 : 1;
  return Math.round(40 * Math.pow(1.55, node - 1) * bossBonus * Math.pow(7, server - 1));
}
