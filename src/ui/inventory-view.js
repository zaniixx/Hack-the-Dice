/**
 * The rig: dice pool, abilities and cyberartifacts the player owns.
 *
 * Sell buttons only appear in the market, and the dice pool can never be sold
 * below its floor, so the controls themselves teach the rules.
 */
import { DICE } from '../data/dice.js';
import { ABILITIES } from '../data/abilities.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { MAX_DICE, MAX_ABILITIES, MIN_DICE } from '../data/rules.js';
import { EDITIONS } from '../data/editions.js';
import { iconURL } from '../render/icon-sprites.js';
import { dieIconURL } from '../render/die-sprites.js';
import { run, Phase } from '../game/state.js';
import { sellValueOf, artifactSlots } from '../game/difficulty.js';
import { els } from './dom.js';

function sellButton(attribute, value) {
  return `<button class="x" ${attribute} title="Sell for ${value} scrap">SELL ${value}</button>`;
}

function rowHTML(icon, name, desc, sellAttribute, value) {
  const button = sellAttribute ? sellButton(sellAttribute, value) : '';
  return `<div class="row-item">
    <img src="${icon}" alt="">
    <div class="t"><b>${name}</b><small>${desc}</small></div>
    ${button}
  </div>`;
}

export function renderInventory() {
  const canSell = run.phase === Phase.SHOP;

  els.diceCount.textContent = `${run.dice.length}/${MAX_DICE}`;
  els.diceInventory.innerHTML = run.dice.map((type, i) => {
    const def = DICE[type];
    const sellable = canSell && run.dice.length > MIN_DICE;
    return `<div class="inv-die" title="${def.name}: ${def.desc}">
      <img src="${dieIconURL(type)}" alt="">
      <span>${def.name}</span>
      ${sellable ? sellButton(`data-sell-die="${i}"`, sellValueOf(def)) : ''}
    </div>`;
  }).join('');

  els.abilityCount.textContent = `${run.abilities.length}/${MAX_ABILITIES}`;
  els.abilityInventory.innerHTML = run.abilities.length
    ? run.abilities.map((id, i) => {
        const def = ABILITIES[id];
        return rowHTML(
          iconURL(id, def.color), def.name, def.desc,
          canSell ? `data-sell-abil="${i}"` : null, sellValueOf(def),
        );
      }).join('')
    : '<div class="empty-note">None yet. Abilities show up in the black market.</div>';

  els.artifactCount.textContent = `${run.artifacts.length}/${artifactSlots()}`;
  els.artifactInventory.innerHTML = run.artifacts.length
    ? run.artifacts.map((id, i) => {
        const def = ARTIFACTS[id];
        const edition = EDITIONS[run.editions[id]];
        // The stamp goes in front of the name and its rider after the text, so
        // the row reads as one item rather than two stacked ones.
        const stamp = edition
          ? `<i class="ed" style="--ed:${edition.color}">${edition.name}</i> `
          : '';
        const name = stamp + def.name + (def.stack ? ' ' + def.stack(run) : '');
        const desc = def.desc + (edition ? ` ${edition.desc}` : '');
        return rowHTML(
          iconURL(id, def.color), name, desc,
          canSell ? `data-sell-art="${i}"` : null, sellValueOf(def, run.editions[id]),
        );
      }).join('')
    : '<div class="empty-note">No cyberartifacts installed yet.</div>';
}
