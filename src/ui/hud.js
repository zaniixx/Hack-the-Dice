/**
 * The heads-up display: everything outside the two canvases.
 *
 * `updateUI` is a full repaint from the run state. It is cheap enough to call
 * after any change, and calling it everywhere is what keeps the HUD from
 * drifting out of sync with the game — there is no partial update path to get
 * wrong.
 */
import { fmt } from '../core/format.js';
import { settings } from '../core/settings.js';
import { clamp } from '../core/math.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { ABILITIES } from '../data/abilities.js';
import { BOSSES, corpName } from '../data/enemies.js';
import { difficultyOf } from '../data/difficulty.js';
import {
  MAX_ARTIFACTS, MAX_ABILITIES, BOSS_NODE, NODES_PER_SERVER, SHOP_REFRESH_BASE_COST,
} from '../data/rules.js';
import { iconURL } from '../render/icon-sprites.js';
import { isEnemyDestroyed, hasEnemyDebris } from '../render/enemy-view.js';
import { run, Phase } from '../game/state.js';
import { loadBest } from '../game/save.js';
import { renderShop } from './shop-view.js';
import { renderInventory } from './inventory-view.js';
import { els } from './dom.js';

/** One line of guidance per phase, shown under the board. */
const HINTS = {
  [Phase.TITLE]: '',
  [Phase.READY]: 'Roll your dice  [Space]',
  [Phase.ROLLING]: 'Dice in motion...',
  [Phase.MANIP]: 'Click dice to lock  ·  Reroll [R]  ·  Abilities [1–3]  ·  Execute [Space]',
  [Phase.SCORING]: 'Executing payload...',
  [Phase.BREACH]: 'Firewall down. Harvesting data...',
  [Phase.SHOP]: 'Node breached. Upgrade your rig, then breach the next node  [Enter]',
  [Phase.OVER]: 'Traced.',
  [Phase.LEAK_WAIT]: 'Memory leak draining...',
};

/** What a black market refresh costs right now: it climbs with each one. */
export const shopRefreshCost = () => SHOP_REFRESH_BASE_COST + run.shopRefreshes;

const scrapTag = amount => `<img class="sc" src="${iconURL('scrap', '#ffc23d')}" alt="">${amount}`;

/** Message over the target portrait: BREACHED, AWAITING TARGET, and so on. */
export function setEnemyOverlay(text) {
  els.enemyOverlay.textContent = text;
}

/** Scoreboard back to its resting state, ready for a new execute. */
export function resetScoreboard() {
  for (const el of [els.bits, els.mult, els.power]) el.classList.remove('dimv');
  els.bits.textContent = '0';
  els.mult.textContent = '1';
  els.power.textContent = '0';
  els.combo.textContent = '';
}

/**
 * Show what the board would score before any artifact fires: Bits are real,
 * Mult and Power are unknown, so they are dimmed and Power reads "?".
 */
export function showScorePreview(bitsTotal, tags) {
  els.bits.textContent = fmt(bitsTotal);
  els.mult.textContent = '1';
  els.power.textContent = '?';
  for (const el of [els.bits, els.mult, els.power]) el.classList.add('dimv');
  els.combo.textContent = tags.join('  ');
}

/**
 * The firewall bar. The ghost layer trails the fill on a delayed transition,
 * which is what makes a big hit read as a chunk taken out.
 */
export function updateFirewall() {
  const enemy = run && run.enemy;
  if (!enemy || run.phase === Phase.SHOP || run.phase === Phase.TITLE) {
    els.firewallFill.style.width = '0%';
    els.firewallGhost.style.width = '0%';
    els.firewallText.textContent = 'OFFLINE';
    return;
  }
  const percent = clamp(enemy.hp / enemy.max, 0, 1) * 100;
  els.firewallFill.style.width = percent + '%';
  els.firewallGhost.style.width = percent + '%';
  els.firewallText.textContent = `${fmt(enemy.hp)} / ${fmt(enemy.max)}`;
}

function renderArtifactRow() {
  let html = '';
  for (let i = 0; i < MAX_ARTIFACTS; i++) {
    const id = run.artifacts[i];
    if (!id) {
      html += '<div class="art empty">EMPTY</div>';
      continue;
    }
    const def = ARTIFACTS[id];
    const stack = def.stack ? `<em>${def.stack(run)}</em>` : '';
    html += `<div class="art" data-id="${id}" title="${def.name}: ${def.desc}">
      <img src="${iconURL(id, def.color)}" alt=""><span>${def.name}</span>${stack}
    </div>`;
  }
  els.artifactRow.innerHTML = html;
}

function renderAbilityBar() {
  const hideCharges = run.phase === Phase.SHOP || run.phase === Phase.TITLE;
  let html = '';
  for (let i = 0; i < MAX_ABILITIES; i++) {
    const id = run.abilities[i];
    if (!id) {
      html += '<div class="abil empty">No ability</div>';
      continue;
    }
    const def = ABILITIES[id];
    const charges = run.charges[id] || 0;
    const usable = run.phase === Phase.MANIP && charges > 0;
    html += `<button class="abil" data-abil="${id}" ${usable ? '' : 'disabled'} title="${def.name}: ${def.desc}">
      <img src="${iconURL(id, def.color)}" alt="">
      <span class="an">${i + 1} ${def.name}</span>
      <span class="ac">${hideCharges ? '' : charges}</span>
    </button>`;
  }
  els.abilityBar.innerHTML = html;
}

function pipsHTML(total, filled) {
  return Array.from({ length: total }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('');
}

function renderMeters(phase) {
  const inNode = phase !== Phase.TITLE && phase !== Phase.SHOP;
  els.executePips.innerHTML = inNode
    ? pipsHTML(run.maxExecutes, run.executes)
    : '<span class="none">—</span>';

  const rollingOrLater = [Phase.MANIP, Phase.ROLLING, Phase.SCORING].includes(phase);
  els.rerollPips.innerHTML = rollingOrLater
    ? pipsHTML(Math.max(0, run.rerolls), run.rerolls) || '<span class="none">0</span>'
    : '<span class="none">—</span>';
}

function renderTopBar() {
  const tier = difficultyOf(run.difficulty);
  els.handle.textContent = run.handle || '—';
  els.tier.textContent = tier.name;
  els.tier.style.color = tier.color;

  els.tournamentWrap.hidden = !run.tournament;
  if (run.tournament) els.tournament.textContent = run.tournament.name;

  els.server.textContent = run.server;
  els.corp.textContent = corpName(run.server);
  els.node.textContent = `${Math.min(run.node, NODES_PER_SERVER)}/${NODES_PER_SERVER}`;
  els.scrap.innerHTML = scrapTag(fmt(run.scrap));

  const best = loadBest();
  els.best.textContent = best && best.server ? `S${best.server} N${best.node}` : '—';
}

function renderTarget(phase) {
  const enemy = run.enemy;
  const inShop = phase === Phase.SHOP;

  els.nodeName.textContent = inShop ? 'UPLINK IDLE' : enemy ? enemy.name : 'NO TARGET';
  els.nodeTag.textContent = inShop
    ? `NEXT: ${run.node === BOSS_NODE ? 'BOSS' : 'NODE ' + run.node + '/' + NODES_PER_SERVER}`
    : enemy && enemy.boss
      ? 'BOSS'
      : `NODE ${run.node}/${NODES_PER_SERVER}`;

  const showRule = enemy && enemy.boss && !isEnemyDestroyed() && !inShop;
  els.bossRule.textContent = showRule ? BOSSES[enemy.boss].rule : '';

  // Between nodes, once the debris has cleared, name what is coming next.
  if (inShop && !hasEnemyDebris()) {
    setEnemyOverlay(run.node === BOSS_NODE ? 'BOSS AHEAD' : 'AWAITING TARGET');
  }
}

function renderControls(phase) {
  els.rollButton.disabled = phase !== Phase.READY;
  els.rerollButton.disabled = !(phase === Phase.MANIP && run.rerolls > 0);
  els.executeButton.disabled = phase !== Phase.MANIP;

  // Pulse whichever button the player is meant to press next.
  els.rollButton.classList.toggle('pulse', phase === Phase.READY);
  els.executeButton.classList.toggle('pulse', phase === Phase.MANIP);
  els.rerollButton.textContent =
    run.rerolls > 0 && phase === Phase.MANIP ? `REROLL ${run.rerolls}` : 'REROLL';

  els.hint.textContent = HINTS[phase] || '';
  if (phase !== Phase.MANIP) els.combo.textContent = '';
}

function renderShopControls(phase) {
  els.nextNodeButton.hidden = phase !== Phase.SHOP;
  els.nextNodeButton.textContent =
    run.node === BOSS_NODE ? 'BREACH THE BOSS' : `BREACH NODE ${run.node}`;

  const cost = shopRefreshCost();
  els.shopRefreshButton.innerHTML = `REFRESH ${scrapTag(cost)}`;
  els.shopRefreshButton.disabled = phase !== Phase.SHOP || run.scrap < cost;
}

/** Repaint the whole HUD from the run state. */
export function updateUI() {
  if (!run) return;
  const phase = run.phase;

  renderTopBar();
  renderTarget(phase);
  updateFirewall();
  renderMeters(phase);
  renderControls(phase);
  renderArtifactRow();
  renderAbilityBar();
  renderShop();
  renderInventory();
  renderShopControls(phase);
}

/** Reflect the current settings on the two top-bar toggles. */
export function syncSettingsButtons() {
  els.speedButton.textContent = `SPD ${settings.speed}×`;
  els.soundButton.textContent = settings.muted ? 'SND OFF' : 'SND ON';
}
