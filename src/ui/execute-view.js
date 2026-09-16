/**
 * Presentation for the execute pipeline.
 *
 * game/execute.js decides what happens; this decides what the player sees. It
 * is the only place that knows an effect launched by an artifact should fly out
 * of that artifact's slot, or that Bits land on the left of the scoreboard.
 *
 * A source is described symbolically — `{ type: 'die', die }`, `{ type:
 * 'artifact', id }` — so the pipeline never handles a screen coordinate.
 */
import { fmt, fmtM } from '../core/format.js';
import { EffectType } from '../data/effects.js';
import { DICE } from '../data/dice.js';
import { sfx } from '../audio/sfx.js';
import { spawnDust } from '../engine/dice-board.js';
import { dieToScreen } from '../render/board-view.js';
import { els } from './dom.js';
import { fly, floatText, bigHit, bump, centerOf, artifactToScreen, pulseArtifact } from './fx.js';

/** Effect sources, as the pipeline describes them. */
export const Source = {
  die: die => ({ type: 'die', die }),
  artifact: id => ({ type: 'artifact', id }),
  abilities: () => ({ type: 'abilities' }),
  enemy: () => ({ type: 'enemy' }),
};

function pointOf(source) {
  switch (source.type) {
    case 'die': return dieToScreen(source.die);
    case 'artifact': return artifactToScreen(source.id);
    case 'abilities': return centerOf(els.abilityBar);
    default: return centerOf(els.enemyCanvas);
  }
}

/** How each kind of effect is labelled, where it lands, and how it reads. */
const EFFECT_STYLES = {
  [EffectType.BITS]: {
    target: () => els.bits,
    cls: 'c-bits',
    label: value => '+' + fmt(value),
    display: fmt,
  },
  [EffectType.MULT]: {
    target: () => els.mult,
    cls: 'c-mult',
    label: value => '+' + fmtM(value),
    display: fmtM,
  },
  [EffectType.XMULT]: {
    target: () => els.mult,
    cls: 'c-x',
    label: value => '×' + fmtM(value),
    display: fmtM,
  },
};

export const executeView = {
  pulseArtifact,

  /** A die is scoring: flash it, lift it, kick up dust, play its note. */
  highlightDie(die, index) {
    die.flash = 1;
    die.lift = 5;
    spawnDust(die.x, die.y, DICE[die.type].color, 5);
    sfx.tick(index);
  },

  /**
   * Throw an effect at the scoreboard.
   *
   * @param {object} effect  the effect being applied
   * @param {object} source  where on screen it came from
   * @param {number} total   the running total once it lands
   * @returns {Promise} resolves when the scoreboard has been updated
   */
  flyEffect(effect, source, total) {
    const style = EFFECT_STYLES[effect.type];
    const target = style.target();
    const label = effect.label || style.label(effect.value);

    return fly(label, pointOf(source), centerOf(target), { cls: style.cls }).then(() => {
      target.textContent = style.display(total);
      bump(target);
      if (effect.type !== EffectType.BITS) sfx.mult(effect.type === EffectType.XMULT);
    });
  },

  /** A die that will not score: say why, and grey-flash it. */
  rejectDie(die, reason) {
    floatText(reason, dieToScreen(die), 'c-red');
    die.flash = 0.8;
  },

  /** A callout over a die, such as RECURSIVE LOOP retriggering it. */
  announceDie(die, text, cls = 'c-lime') {
    floatText(text, dieToScreen(die), cls);
  },

  /** A callout over the target, such as the cipher shield being cracked. */
  announceEnemy(text, cls = 'c-lime') {
    floatText(text, centerOf(els.enemyCanvas), cls);
  },

  /** Final, undimmed totals once every effect has landed. */
  showTotals(bitsTotal, multTotal, power) {
    els.bits.textContent = fmt(bitsTotal);
    els.mult.textContent = fmtM(multTotal);
    els.power.textContent = fmt(power);
    bump(els.power);
  },

  /** The payload total slamming down and diving into the firewall. */
  slamTotal: bigHit,

  /** Damage number over the target. */
  showDamage(total) {
    floatText('-' + fmt(total), centerOf(els.enemyCanvas), 'c-dmg', 1000);
  },
};
