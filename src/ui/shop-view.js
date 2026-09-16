/**
 * Black market cards.
 *
 * The shop stays on screen while a node is being hacked — greyed out and
 * disabled — so the player can plan what to buy while they play.
 */
import { definitionOf, KIND_LABELS, ItemKind } from '../data/catalog.js';
import { iconURL } from '../render/icon-sprites.js';
import { dieIconURL } from '../render/die-sprites.js';
import { run, Phase } from '../game/state.js';
import { priceOf } from '../game/difficulty.js';
import { els } from './dom.js';

const scrapIcon = () => iconURL('scrap', '#ffc23d');

function cardHTML(item, index, { open }) {
  const def = definitionOf(item);
  if (!def) return '';

  const icon = item.kind === ItemKind.DIE ? dieIconURL(item.id) : iconURL(item.id, def.color);
  const cost = priceOf(def);
  const affordable = run.scrap >= cost;
  const buyClass = affordable && !item.sold ? 'lime' : '';
  const price = `BUY <img class="sc" src="${scrapIcon()}" alt="">${cost}`;

  return `<div class="card t${def.tier} ${item.sold ? 'sold' : ''}">
    <div class="top">
      <img src="${icon}" alt="">
      <div>
        <div class="nm">${def.name}</div>
        <div class="kd">${KIND_LABELS[item.kind]}, tier ${def.tier}</div>
      </div>
    </div>
    <div class="ds">${def.desc}</div>
    <button class="btn sm buy ${buyClass}" data-buy="${index}" ${item.sold || !open ? 'disabled' : ''}>
      ${item.sold ? 'INSTALLED' : price}
    </button>
  </div>`;
}

export function renderShop() {
  const open = run.phase === Phase.SHOP;
  els.shop.classList.toggle('locked', !open);

  if (!run.shop.length) {
    els.shop.innerHTML = '<div class="empty-note">Market offline. Breach this node to reconnect.</div>';
    return;
  }
  els.shop.innerHTML = run.shop.map((item, i) => cardHTML(item, i, { open })).join('');
}
