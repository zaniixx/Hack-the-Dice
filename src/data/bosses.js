/**
 * Boss protocols: what guards node 5.
 *
 * Every boss is a rule the player can read and a hook that enforces it. The
 * hooks are optional and the game asks for them by name, so adding a boss is
 * adding an entry here plus a sprite painter in render/enemy-sprites.js.
 *
 *   onNodeStart(ctx)        the node loads — change the terms of the fight
 *   onSettled(ctx)          dice have settled, before the player acts
 *   absorbs(die, run)       veto a single die
 *   scoringDice(dice, run)  narrow which dice score at all
 *   multiplier(tally, ctx)  effects applied at the end of an execute
 *   afterExecute(ctx)       the hit has landed
 *   survivesBreach(ctx)     true to refuse a killing blow, once
 *
 * `lines` is what the protocol says when it comes online, shown by the cutscene
 * in ui/cutscene.js.
 *
 * `ctx` carries `{ run, enemy, dice, log, notify }` — the same shape abilities
 * get, so these read the same way. Hooks may change the run; that is the point
 * of a boss.
 */
import { xMult } from './effects.js';
import { countPairs } from './combos.js';
import { WATCHDOG_ABSORB_MAX, CIPHER_DAMAGE_MULTIPLIER } from './rules.js';
import { gamePick } from '../core/game-random.js';

/** THROTTLE lets this many dice through. */
const THROTTLE_DICE = 3;
/** PROXY WRAITH restores this share of its firewall per execute. */
const WRAITH_REGEN = 0.12;
/** RANSOMWARE VAULT's fee, and what it keeps when the fee goes unpaid. */
const RANSOM_COST = 3;
const RANSOM_UNPAID_MULTIPLIER = 0.5;
/** REVENANT comes back at this share of its firewall, once. */
const REVENANT_RESTORE = 0.4;

export const BOSSES = {
  antivirus: {
    name: 'ANTIVIRUS',
    sprite: 'shield',
    rule: 'Quarantine: after every roll, one random die is quarantined and scores nothing.',
    lines: [
      'Unrecognised process. Beginning quarantine.',
      'You are not on the allowlist. Nobody is.',
    ],
    onSettled({ dice, log, sfx }) {
      if (!dice.length) return;
      const victim = gamePick(dice);
      victim.quarantined = true;
      log(`> antivirus quarantined a die showing ${victim.value}`, 'red');
      sfx.quarantine();
    },
  },

  encryption: {
    name: 'ENCRYPTION KEY',
    sprite: 'key',
    rule: 'Cipher shield: an Execute without at least one pair deals only 10% damage.',
    lines: [
      'Without a pair, everything you send me is noise.',
      'I was built to be boring. It works.',
    ],
    multiplier(tally, { log, sfx }) {
      if (countPairs(tally.scored.map(die => die.scoringValue))) {
        log('> pair detected: cipher shield bypassed', 'lime');
        sfx.cipher(true);
        return [];
      }
      log('> no pair: cipher shield absorbs 90%', 'red');
      sfx.cipher(false);
      return [xMult(CIPHER_DAMAGE_MULTIPLIER, `CIPHER ×${CIPHER_DAMAGE_MULTIPLIER}`)];
    },
  },

  watchdog: {
    name: 'AI WATCHDOG',
    sprite: 'eye',
    rule: 'Absorption: dice showing 3 or less are absorbed and score nothing.',
    lines: [
      'I see the small ones. They do not count.',
      'Show me something worth watching.',
    ],
    absorbs: die => die.scoringValue <= WATCHDOG_ABSORB_MAX,
  },

  throttle: {
    name: 'RATE LIMITER',
    sprite: 'valve',
    rule: `Rate limit: only your ${THROTTLE_DICE} highest dice are allowed to score.`,
    lines: [
      'Three at a time. Queue like everybody else.',
      'Your throughput has been adjusted. Permanently.',
    ],
    scoringDice: dice =>
      [...dice]
        .sort((a, b) => b.scoringValue - a.scoringValue)
        .slice(0, THROTTLE_DICE),
  },

  wraith: {
    name: 'PROXY WRAITH',
    sprite: 'wraith',
    rule: 'Regeneration: restores 12% of its firewall after every Execute.',
    lines: [
      'Break it. I will have it back before you breathe.',
      'You are hitting something that already left.',
    ],
    afterExecute({ enemy, log, sfx }) {
      if (enemy.hp <= 0) return;
      const healed = Math.min(Math.ceil(enemy.max * WRAITH_REGEN), enemy.max - enemy.hp);
      if (healed <= 0) return;
      enemy.hp += healed;
      log(`> proxy wraith rebuilt ${healed} firewall`, 'red');
      sfx.regen();
    },
  },

  ransomware: {
    name: 'RANSOMWARE VAULT',
    sprite: 'vault',
    rule: `Extortion: every Execute costs ${RANSOM_COST} Data Scrap. Cannot pay, and it absorbs half.`,
    lines: [
      'Every attempt has a fee. Pay it or be halved.',
      'Your scrap, or your progress. Pick one.',
    ],
    multiplier(tally, { run, log, sfx }) {
      if (run.scrap >= RANSOM_COST) {
        run.scrap -= RANSOM_COST;
        log(`> ransomware took ${RANSOM_COST} data scrap`, 'amber');
        sfx.extort();
        return [];
      }
      log('> nothing left to extort: the vault hardens', 'red');
      sfx.cipher(false);
      return [xMult(RANSOM_UNPAID_MULTIPLIER, 'UNPAID ×0.5')];
    },
  },

  sandbox: {
    name: 'SANDBOX',
    sprite: 'sandbox',
    rule: 'Containment: your abilities have no charges on this node.',
    lines: [
      'Your tools do not exist in here.',
      'Contained. Improvise, if you can.',
    ],
    onNodeStart({ run, log, sfx }) {
      for (const id of Object.keys(run.charges)) run.charges[id] = 0;
      if (!run.abilities.length) return;
      log('> sandbox contained your abilities', 'red');
      sfx.contain();
    },
  },

  revenant: {
    name: 'REVENANT',
    sprite: 'revenant',
    rule: 'Restore point: the first time its firewall falls, it comes back at 40%.',
    lines: [
      'I keep restore points. You keep hoping.',
      'Kill me. I will be up before you are.',
    ],
    survivesBreach({ enemy, log, sfx }) {
      if (enemy.restored) return false;
      enemy.restored = true;
      enemy.hp = Math.max(1, Math.round(enemy.max * REVENANT_RESTORE));
      log('> revenant rolled back to a restore point', 'red');
      sfx.restore();
      return true;
    },
  },
};

/**
 * The order bosses appear in, easiest first. Server 1 meets the first, and the
 * cycle repeats once a run gets past the last.
 */
export const BOSS_ORDER = [
  'antivirus', 'encryption', 'watchdog', 'throttle',
  'wraith', 'ransomware', 'sandbox', 'revenant',
];

export const bossForServer = server => BOSS_ORDER[(server - 1) % BOSS_ORDER.length];

export const isKnownBoss = id => Object.hasOwn(BOSSES, id);
