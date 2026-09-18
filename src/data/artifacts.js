/**
 * The cyberartifact catalog — the run-defining upgrades.
 *
 * Scoring hooks fire in a fixed order, which is what makes builds predictable:
 *
 *   1. perDie(ctx, die)     as each die scores, in board order
 *   2. bonus(ctx)           flat Bits/Mult once every die has scored
 *   3. multiplier(ctx)      ×Mult last, so it multiplies everything above
 *
 * Each hook returns an array of effects (possibly empty). `ctx` carries the
 * dice that scored, whether this is the node's first execute, and the run
 * itself for artifacts that read the player's rig or progress.
 *
 * Artifacts marked `passive` have no scoring hook: they change the rules
 * elsewhere, and the comment says where.
 */
import { bits, mult, xMult } from './effects.js';
import { countPairs, longestStraight } from './combos.js';
import { fmt, fmtM } from '../core/format.js';

/**
 * The compounding artifacts.
 *
 * These three are the run's engine: they are what a build rides from server 2
 * to wherever it dies, and the firewall curve in data/enemies.js is shaped
 * around them. They start small and compound rather than paying out big and
 * flattening, because a rig that grows by a fixed amount per server gets left
 * behind by firewalls that do not.
 */
const BLOCKCHAIN_GROWTH = 1.15;   // per node breached after purchase
const SINGULARITY_GROWTH = 1.6;   // per server tier past the first
const MOORE_GROWTH = 2;           // per migration after purchase

/*
 * A note on `perDie`, which every artifact below phrases as "for every die that
 * scores": it is only offered dice that actually put something into the tally.
 * A die that contributed no Bits and no Mult — a LEGO BRICK that landed studs
 * down — is not shown to these at all, so the wording is literal. FUZZY DICE
 * pay Mult rather than Bits and still count, because they still scored.
 */
export const ARTIFACTS = {
  // ---- Tier 1 -------------------------------------------------------------
  overclock: {
    name: 'OVERCLOCKER', tier: 1, cost: 6, color: '#ffe23d',
    desc: '+2 Mult for every 6 that scores.',
    perDie: (ctx, die) => (die.scoringValue === 6 ? [mult(2)] : []),
  },
  sniffer: {
    name: 'PACKET SNIFFER', tier: 1, cost: 5, color: '#3df2ff',
    desc: '+4 Bits for every odd die that scores.',
    perDie: (ctx, die) => (die.scoringValue % 2 === 1 ? [bits(4)] : []),
  },
  parity: {
    name: 'PARITY CHECK', tier: 1, cost: 5, color: '#ff3df0',
    desc: '+1 Mult for every even die that scores.',
    perDie: (ctx, die) => (die.scoringValue % 2 === 0 ? [mult(1)] : []),
  },
  brute: {
    name: 'BRUTE FORCER', tier: 1, cost: 5, color: '#ff7a5a',
    desc: '+5 Bits for every scoring die.',
    bonus: ctx => (ctx.scored.length ? [bits(5 * ctx.scored.length)] : []),
  },
  trojan: {
    name: 'TROJAN HORSE', tier: 1, cost: 7, color: '#ffc23d',
    desc: 'The first Execute on every node deals ×2.',
    multiplier: ctx => (ctx.firstExecute ? [xMult(2)] : []),
  },
  memleak: {
    name: 'MEMORY LEAK', tier: 1, cost: 6, color: '#b6ff3d',
    desc: 'After each Execute, drains 5% of that Hacking Power per second for 10s.',
    passive: true, // see game/memory-leak.js
  },
  cache: {
    name: 'CACHE OVERFLOW', tier: 1, cost: 6, color: '#ffc23d',
    desc: '+50% Data Scrap from every breach.',
    passive: true, // see game/session.js, breachNode()
  },
  hash: {
    name: 'HASH COLLISION', tier: 1, cost: 9, color: '#9a7bff',
    desc: '×1.5 Mult for each pair of matching values.',
    multiplier: ctx => {
      const pairs = countPairs(ctx.scored.map(die => die.scoringValue));
      return pairs ? [xMult(Math.pow(1.5, pairs))] : [];
    },
  },

  // ---- Tier 2 -------------------------------------------------------------
  miner: {
    name: 'CRYPTO MINER', tier: 2, cost: 8, color: '#ffc23d',
    desc: '+1 Mult for every 5 Data Scrap you hold.',
    bonus: ctx => {
      const bonus = Math.floor(ctx.run.scrap / 5);
      return bonus ? [mult(bonus)] : [];
    },
  },
  botnet: {
    name: 'BOTNET', tier: 2, cost: 9, color: '#7dffb0',
    desc: '+1 Mult for every die in your pool.',
    bonus: ctx => [mult(ctx.run.dice.length)],
  },
  sequence: {
    name: 'SEQUENCE BREAKER', tier: 2, cost: 10, color: '#3df2ff',
    desc: '×3 Mult if scoring dice contain a straight of 4+.',
    multiplier: ctx =>
      longestStraight(ctx.scored.map(die => die.scoringValue)) >= 4 ? [xMult(3)] : [],
  },
  zeroday: {
    name: 'ZERO DAY', tier: 2, cost: 10, color: '#ff3df0',
    desc: '+0.5× Mult for each reroll you did not use.',
    multiplier: ctx =>
      ctx.run.rerolls > 0 ? [xMult(1 + 0.5 * ctx.run.rerolls)] : [],
  },
  recursive: {
    name: 'RECURSIVE LOOP', tier: 2, cost: 11, color: '#b6ff3d',
    desc: 'Retriggers your highest scoring die.',
    passive: true, // see game/execute.js, after the scoring loop
  },
  ghost: {
    name: 'GHOST PROTOCOL', tier: 2, cost: 12, color: '#c9d1ff',
    desc: '+1 Execute on every node.',
    passive: true, // see game/session.js, beginNode()
  },
  blockchain: {
    name: 'BLOCKCHAIN', tier: 2, cost: 12, color: '#7dffb0',
    desc: '×1.15 Mult, compounding for every node breached after purchase.',
    stacksOn: 'breach',
    multiplier: ctx => {
      const nodes = ctx.run.stacks.blockchain || 0;
      return nodes ? [xMult(Math.pow(BLOCKCHAIN_GROWTH, nodes))] : [];
    },
    stack: run => '×' + fmtM(Math.pow(BLOCKCHAIN_GROWTH, run.stacks.blockchain || 0)),
  },

  // ---- Tier 3 -------------------------------------------------------------
  quantum: {
    name: 'QUANTUM CORE', tier: 3, cost: 18, color: '#9a7bff',
    desc: '×2 Mult. Always.',
    multiplier: () => [xMult(2)],
  },
  kernel: {
    name: 'KERNEL PANIC', tier: 3, cost: 16, color: '#ff4d6d',
    desc: '×4 Mult if every scoring die shows 4 or higher.',
    multiplier: ctx =>
      ctx.scored.length && ctx.scored.every(die => die.scoringValue >= 4)
        ? [xMult(4)]
        : [],
  },
  singularity: {
    name: 'SINGULARITY', tier: 3, cost: 20, color: '#ff3df0',
    desc: '×1.6 Mult, compounding for every server tier past the first.',
    multiplier: ctx => (ctx.run.server > 1
      ? [xMult(Math.pow(SINGULARITY_GROWTH, ctx.run.server - 1))]
      : []),
  },
  moore: {
    name: "MOORE'S LAW", tier: 3, cost: 22, color: '#3df2ff',
    desc: '×2 Mult. Doubles with every server migration after purchase.',
    stacksOn: 'migration',
    multiplier: ctx => [xMult(2 * Math.pow(MOORE_GROWTH, ctx.run.stacks.moore || 0))],
    stack: run => '×' + fmt(2 * Math.pow(MOORE_GROWTH, run.stacks.moore || 0)),
  },

  // ---- Found junk ---------------------------------------------------------
  // Things off a desk. They are priced as junk because most of them are, and
  // the three that are not all charge you something the others do not.
  paperclip: {
    name: 'PAPERCLIP', tier: 1, cost: 1, color: '#c9d1ff',
    // The cheapest thing in the market, and still a bad buy: the slot it takes
    // is worth more than the +1. Everybody buys it once.
    desc: '+1 Mult. That is the whole artifact.',
    bonus: () => [mult(1)],
  },
  duck: {
    name: 'RUBBER DUCK', tier: 1, cost: 7, color: '#ffe23d',
    // The only thing in the game that pays you for rerolling, which puts it
    // exactly opposite ZERO DAY. Owning both is a decision, not a build.
    desc: '+2 Mult for every reroll you have spent this Execute.',
    bonus: ctx => {
      const spent = ctx.run.rerollsSpent || 0;
      return spent ? [mult(2 * spent)] : [];
    },
  },
  stickynote: {
    name: 'STICKY NOTE', tier: 1, cost: 7, color: '#ffc23d',
    desc: 'The first node of every server starts at half firewall.',
    passive: true, // see game/session.js, createEnemy()
  },
  coffee: {
    name: 'COLD COFFEE', tier: 2, cost: 10, color: '#ff7a5a',
    // Drains inside a node and is refilled by spending, which makes hoarding
    // scrap cost you something for once.
    desc: '+8 Mult, losing 1 every Execute. Buying anything fills it back up.',
    bonus: ctx => {
      const left = Math.max(0, 8 - (ctx.run.stacks.coffee || 0));
      return left ? [mult(left)] : [];
    },
    stack: run => '+' + Math.max(0, 8 - (run.stacks.coffee || 0)),
  },
  cables: {
    name: 'TANGLED CABLES', tier: 2, cost: 11, color: '#7dffb0',
    // Worth nothing on the node you buy it and the most on the one with the
    // boss behind it.
    desc: '+4 Mult for every node past the first on this server.',
    bonus: ctx => {
      const untangled = Math.max(0, ctx.run.node - 1);
      return untangled ? [mult(4 * untangled)] : [];
    },
  },
  keyboard: {
    name: 'MECHANICAL KEYBOARD', tier: 2, cost: 12, color: '#3df2ff',
    // Blues, in an open-plan office. They hear you coming.
    desc: '+2 Mult for every scoring die. −1 Execute on every node.',
    perDie: () => [mult(2)],
    // The execute is taken in game/session.js, beginNode().
  },
  energydrink: {
    name: 'ENERGY DRINK', tier: 2, cost: 13, color: '#b6ff3d',
    // Three nodes of being the best artifact in the rig, and then the rest of
    // the server paying for it. The crash is not optional.
    desc: '×3 Mult for three nodes. Then −1 Execute for the rest of the server.',
    stacksOn: 'breach',
    multiplier: ctx => ((ctx.run.stacks.energydrink || 0) < 3 ? [xMult(3)] : []),
    stack: run => ((run.stacks.energydrink || 0) < 3
      ? `${3 - (run.stacks.energydrink || 0)} left`
      : 'crashed'),
  },
  floppy: {
    name: 'FLOPPY DISK', tier: 3, cost: 14, color: '#9a7bff',
    /*
     * The trap, and the only artifact here that is meant to be sold.
     *
     * Cheaper than QUANTUM CORE and strictly better than it for about two
     * servers, because a starting pool never comes near 144 Bits. Somewhere
     * around server three it starts clipping every Execute, and from then on
     * the ×3 is buying back less than the ceiling is taking. Knowing when it
     * turned is the whole item.
     *
     * The number is 144 rather than 1,440 because 1,440 is unreachable — the
     * best pool in the game tops out near 600 — and a ceiling nothing ever
     * touches is not a drawback, it is a lie in the tooltip.
     */
    desc: '×3 Mult. A 1.44MB disk holds what it holds: your Bits cannot exceed 144.',
    multiplier: () => [xMult(3)],
    capsBits: 144, // applied in game/execute.js, before the firewall is hit
  },
};

export const isKnownArtifact = id => Object.hasOwn(ARTIFACTS, id);

/** Ids that grow with `event` ('breach' or 'migration'). */
export const artifactsStackingOn = event =>
  Object.keys(ARTIFACTS).filter(id => ARTIFACTS[id].stacksOn === event);
