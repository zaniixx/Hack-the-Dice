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
import { BOSSES } from '../data/bosses.js';
import { corpName } from '../data/corps.js';
import { difficultyOf } from '../data/difficulty.js';
import {
  MAX_ABILITIES, BOSS_NODE, NODES_PER_SERVER, SHOP_REFRESH_BASE_COST,
} from '../data/rules.js';
import { EDITIONS } from '../data/editions.js';
import { iconURL } from '../render/icon-sprites.js';
import { isEnemyDestroyed, hasEnemyDebris } from '../render/enemy-view.js';
import { run, Phase } from '../game/state.js';
import { loadBest } from '../game/save.js';
import { artifactSlots } from '../game/difficulty.js';
import { isDraggingArtifacts } from './artifact-drag.js';
import { renderShop } from './shop-view.js';
import { renderInventory } from './inventory-view.js';
import { els } from './dom.js';
import { syncSheetsToPhase } from './sheets.js';
import { syncMarketToPhase } from './market.js';
import { syncSoundtrack } from '../game/soundtrack.js';
import { syncTutorial } from './tutorial.js';

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
 * The firewall bar.
 *
 * The ghost layer trails the fill on a delayed transition, which is what makes
 * a single big hit read as a chunk taken out. A continuous drain is the
 * opposite kind of change and needs the opposite treatment: MEMORY LEAK moves
 * the width every frame, and a stepped transition restarted every frame never
 * reaches its first step — the bar would sit still for the whole ten seconds
 * and then jump. `draining` hands the fill straight to the damage so the player
 * watches the firewall come down as it happens.
 */
export function updateFirewall({ draining = false } = {}) {
  const enemy = run && run.enemy;
  els.firewallBar.classList.toggle('draining', draining);

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
  // Mid-drag the row belongs to the player: repainting it would yank the slot
  // out from under the pointer. Whatever changed will be drawn when they let go.
  if (isDraggingArtifacts()) return;

  // The row is exactly as wide as the rig: a NEGATIVE edition adds a column.
  const slots = artifactSlots();
  els.artifactRow.style.setProperty('--slots', slots);

  let html = '';
  for (let i = 0; i < slots; i++) {
    const id = run.artifacts[i];
    if (!id) {
      html += '<div class="art empty">EMPTY</div>';
      continue;
    }
    const def = ARTIFACTS[id];
    const edition = EDITIONS[run.editions[id]];
    const stack = def.stack ? `<em>${def.stack(run)}</em>` : '';
    const stamp = edition ? `<i class="ed">${edition.tag}</i>` : '';
    const title = `${def.name}: ${def.desc}`
      + (edition ? ` — ${edition.name}: ${edition.desc}` : '')
      + `

Slot ${i + 1} of ${slots}. Drag to reorder — slots pay out left to`
      + ' right, so +Mult belongs left of ×Mult.';
    html += `<div class="art${edition ? ' stamped' : ''}" data-id="${id}" title="${title}"
                  style="--ed:${edition ? edition.color : 'transparent'}">
      <img src="${iconURL(id, def.color)}" alt=""><span>${def.name}</span>${stack}${stamp}
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

  els.seed.textContent = run.seed || '—';
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
  const inShop = phase === Phase.SHOP;
  const breachLabel = run.node === BOSS_NODE ? 'BREACH THE BOSS' : `BREACH NODE ${run.node}`;

  // Two ways to the same action: below the toolkit, and in the market popup
  // that covers it. Both only exist between nodes.
  els.nextNodeButton.hidden = !inShop;
  els.nextNodeButton.textContent = breachLabel;
  els.marketBreachButton.hidden = !inShop;
  els.marketBreachButton.textContent = breachLabel;

  // There is no market during a fight, so there is no button offering one.
  els.marketButton.hidden = !inShop;
  els.marketScrap.innerHTML = scrapTag(fmt(run.scrap));

  const cost = shopRefreshCost();
  els.shopRefreshButton.innerHTML = `REFRESH ${scrapTag(cost)}`;
  els.shopRefreshButton.disabled = !inShop || run.scrap < cost;
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
  syncMarketToPhase(phase);
  syncSheetsToPhase(phase);
  syncSoundtrack(run);
  syncTutorial();
}

/** Reflect the current settings on the two top-bar toggles. */
/**
 * The settings button in the top bar.
 *
 * It replaced a SPD and a SND button that spelled their state out in the bar
 * itself. One gear is quieter, but the state still has to be readable
 * somewhere, so it goes in the tooltip rather than being lost.
 */
export function syncSettingsButtons() {
  const { settingsButton, settingsIcon } = els;
  if (!settingsButton) return;

  if (settingsIcon) settingsIcon.src = iconURL('gear', settings.muted ? '#7e83ad' : '#3df2ff');

  const label = `Settings — sound ${settings.muted ? 'off' : 'on'}, speed ${settings.speed}×`;
  settingsButton.title = label;
  settingsButton.setAttribute('aria-label', label);
}
