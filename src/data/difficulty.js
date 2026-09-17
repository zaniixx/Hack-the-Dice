/**
 * Threat levels.
 *
 * Difficulty is named after who is doing the hacking, and colour-coded on a
 * green-to-red threat ramp so the order is obvious before you read a word of
 * it. Every tier is pure data: the numbers below are the only thing that
 * changes between a beginner run and a brutal one.
 *
 *   firewallScale    multiplier on every node's firewall strength
 *   firewallRamp     compounded per server on top of that, so the gap between
 *                    tiers opens up as a run gets deep instead of staying a
 *                    flat percentage from node one
 *   artifactSlots    cyberartifacts the rig can hold
 *   executes         attempts per node before the trace lands
 *   rerolls          rerolls granted by each roll
 *   startingScrap    data scrap the run opens with
 *   priceScale       multiplier on every black market price
 *   scoreMultiplier  applied to the final run score
 */

export const DIFFICULTIES = {
  'script-kiddie': {
    name: 'SCRIPT KIDDIE',
    rank: 1,
    color: '#b6ff3d',
    tagline: 'Borrowed exploits, copied from a forum. Loud, lucky, mostly harmless.',
    firewallScale: 0.75,
    firewallRamp: 0.94,
    artifactSlots: 5,
    executes: 5,
    rerolls: 3,
    startingScrap: 8,
    priceScale: 0.9,
    scoreMultiplier: 0.5,
  },
  'pen-tester': {
    name: 'PEN TESTER',
    rank: 2,
    color: '#3df2ff',
    tagline: 'Authorised, methodical, and on the clock. The standard engagement.',
    firewallScale: 1,
    firewallRamp: 1,
    artifactSlots: 5,
    executes: 4,
    rerolls: 2,
    startingScrap: 4,
    priceScale: 1,
    scoreMultiplier: 1,
  },
  'black-hat': {
    name: 'BLACK HAT',
    rank: 3,
    color: '#ffc23d',
    tagline: 'No authorisation, no safety net, and a market that smells desperation.',
    firewallScale: 1.5,
    firewallRamp: 1.06,
    artifactSlots: 5,
    executes: 4,
    rerolls: 2,
    startingScrap: 3,
    priceScale: 1.15,
    scoreMultiplier: 2,
  },
  'nation-state': {
    name: 'NATION STATE',
    rank: 4,
    color: '#ff4d6d',
    tagline: 'Advanced persistent threat. Unlimited budget, zero margin for error.',
    firewallScale: 2.2,
    firewallRamp: 1.12,
    artifactSlots: 4,
    executes: 3,
    rerolls: 1,
    startingScrap: 2,
    priceScale: 1.3,
    scoreMultiplier: 3.5,
  },
};

/** The tier a run gets if nothing else is chosen. */
export const DEFAULT_DIFFICULTY = 'pen-tester';

/** Ids in ramp order, easiest first. */
export const DIFFICULTY_ORDER = Object.keys(DIFFICULTIES)
  .sort((a, b) => DIFFICULTIES[a].rank - DIFFICULTIES[b].rank);

/** A known tier, falling back to the default rather than throwing. */
export const difficultyOf = id => DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];

export const isKnownDifficulty = id => Object.hasOwn(DIFFICULTIES, id);

/** Percentage change as a signed label, or null when a value is unchanged. */
function delta(value, label) {
  if (value === 1) return null;
  const percent = Math.round((value - 1) * 100);
  return `${label} ${percent > 0 ? '+' : '−'}${Math.abs(percent)}%`;
}

/**
 * Short bullet points for the difficulty cards, derived from the numbers so a
 * balance change can never leave the description lying.
 */
export function difficultySummary(id) {
  const def = difficultyOf(id);
  return [
    delta(def.firewallScale, 'Firewalls'),
    delta(def.firewallRamp, 'Per server'),
    `${def.artifactSlots} artifact slots`,
    `${def.executes} executes`,
    `${def.rerolls} reroll${def.rerolls === 1 ? '' : 's'}`,
    delta(def.priceScale, 'Prices'),
    `Score ×${def.scoreMultiplier}`,
  ].filter(Boolean);
}
