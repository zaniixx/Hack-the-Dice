/**
 * Root shell — the development console.
 *
 * A build-and-test tool, not a feature. It exists so a rig can be assembled in
 * one click instead of ten breaches: grant any die, ability, cyberartifact or
 * edition, jump to a given server or protocol, refill executes, bend the board,
 * and hand yourself as much scrap as a build needs.
 *
 * Its last tab is the other half of that: the shared board, from the outside.
 * Tournaments and results are public and permanent by design — a player can
 * only remove what their own browser hosted — so this is where something comes
 * off the board when there is nobody else to take it off. Those calls answer to
 * a key the board holds and this repository does not; without one the tab reads
 * the board and changes nothing. See services/root-api.js.
 *
 * It is deliberately out of the way. Nothing imports this module at startup —
 * ui/input.js fetches it the first time the opening sequence is typed — so it
 * costs a request that a normal session never makes, appears in no markup, and
 * has no stylesheet of its own to notice. Its DOM and CSS are built here on
 * first open and reused after that.
 *
 * Anything it touches sets `run.cheated`, which keeps the run off the shared
 * leaderboard. See game/leaderboard.js: a board full of runs assembled in here
 * would not be worth reading.
 */
import { fmt } from '../core/format.js';
import { DICE } from '../data/dice.js';
import { ABILITIES } from '../data/abilities.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { EDITIONS } from '../data/editions.js';
import { BOSSES, BOSS_ORDER, bossForServer } from '../data/bosses.js';
import { DIFFICULTIES } from '../data/difficulty.js';
import { MAX_DICE, NODES_PER_SERVER, BOSS_NODE } from '../data/rules.js';
import { dice as boardDice, setDicePool, unlockAll } from '../engine/dice-board.js';
import { run, Phase } from '../game/state.js';
import {
  ARCHIVE_SECTIONS, progressOf, revealAll, forgetAll,
} from '../game/archive.js';
import {
  earnedCount, contractTotal, grantAllContracts, forgetContracts,
} from '../game/achievements.js';
import { beginNode, breachNode } from '../game/session.js';
import { refreshPreview } from '../game/turn.js';
import { store } from '../services/store.js';
import * as ops from '../services/root-api.js';
import { log } from './log.js';
import { toast } from './fx.js';
import { updateUI } from './hud.js';

/** How often the held-open cheats (scrap, executes) are topped back up. */
const TOPUP_MS = 300;
/** What "infinite" is worth, in a game that formats large numbers anyway. */
const LOTS = 9999999;

let panel = null;
let open = false;
let tab = 'rig';
let topUpTimer = null;

/** Cheats that have to be re-applied because the game keeps spending them. */
const held = { scrap: false, executes: false };

/** How long a destructive button stays armed before it forgets it was asked. */
const ARM_MS = 4000;

/** What the last look at the shared board found. Filled by refreshNet(). */
const netState = {
  checked: false,
  busy: false,
  error: '',
  said: '',
  counts: null,
  tournaments: [],
  scores: [],
};

/**
 * What is typed into the board tab's fields.
 *
 * Kept out of the DOM because this panel redraws itself on a timer and on every
 * answer from the board, and a redraw in the middle of typing a key would throw
 * away the half of it that had been typed.
 */
const netDraft = { key: '', base: '', handle: '' };

/** The destructive button waiting for its second click, if any. */
let armed = '';
let armTimer = null;

export const isRootShellOpen = () => open;

// ---- Helpers ---------------------------------------------------------------

const escape = text => String(text).replace(/[&<>"]/g,
  ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** Every change in here marks the run, so it cannot reach a real board. */
function touch(message) {
  if (run) run.cheated = true;
  if (message) log('> root: ' + message, 'mag');
}

/** Redraw the game and this panel together, so neither goes stale. */
function sync() {
  updateUI();
  if (run && run.phase === Phase.MANIP) refreshPreview();
  render();
}

const needsRun = () => {
  if (run && run.phase !== Phase.TITLE) return true;
  toast('START A RUN FIRST');
  return false;
};

// ---- Actions ---------------------------------------------------------------

function grantDie(type) {
  if (!needsRun()) return;
  if (run.dice.length >= MAX_DICE) return toast('DICE POOL FULL');
  run.dice.push(type);
  setDicePool(run.dice);
  touch(`+${DICE[type].name}`);
  sync();
}

function grantAbility(id) {
  if (!needsRun()) return;
  if (!run.abilities.includes(id)) run.abilities.push(id);
  run.charges[id] = ABILITIES[id].charges;
  touch(`+${ABILITIES[id].name}`);
  sync();
}

/** Install an artifact, optionally stamped. Slot limits do not apply in here. */
function grantArtifact(id, edition) {
  if (!needsRun()) return;
  if (!run.artifacts.includes(id)) run.artifacts.push(id);
  if (edition) run.editions[id] = edition;
  else delete run.editions[id];
  if (ARTIFACTS[id].stack && run.stacks[id] === undefined) run.stacks[id] = 0;
  touch(`+${ARTIFACTS[id].name}${edition ? ' (' + EDITIONS[edition].name + ')' : ''}`);
  sync();
}

function removeItem(kind, index) {
  if (!needsRun()) return;
  if (kind === 'die') {
    run.dice.splice(index, 1);
    setDicePool(run.dice);
  } else if (kind === 'abil') {
    run.abilities.splice(index, 1);
  } else {
    const id = run.artifacts[index];
    run.artifacts.splice(index, 1);
    delete run.editions[id];
    delete run.stacks[id];
  }
  touch('removed an item');
  sync();
}

/** Re-stamp something already installed, for testing one edition at a time. */
function restamp(id, edition) {
  if (edition) run.editions[id] = edition;
  else delete run.editions[id];
  touch(`${ARTIFACTS[id].name}: ${edition ? EDITIONS[edition].name : 'plain'}`);
  sync();
}

function addScrap(amount) {
  if (!needsRun()) return;
  run.scrap = Math.max(0, run.scrap + amount);
  touch(`scrap ${amount > 0 ? '+' : ''}${amount}`);
  sync();
}

/** The server this run meets `bossId` on — the order is drawn from the seed. */
function serverForBoss(bossId) {
  for (let server = 1; server <= BOSS_ORDER.length; server++) {
    if (bossForServer(server, run.seed) === bossId) return server;
  }
  return 1;
}

function jumpToBoss(bossId) {
  if (!needsRun()) return;
  run.server = serverForBoss(bossId);
  run.node = BOSS_NODE;
  touch(`jumped to ${BOSSES[bossId].name} on server ${run.server}`);
  beginNode();
  render();
}

function jumpTo(server, node) {
  if (!needsRun()) return;
  run.server = Math.max(1, server);
  run.node = Math.min(NODES_PER_SERVER, Math.max(1, node));
  touch(`jumped to server ${run.server} node ${run.node}`);
  beginNode();
  render();
}

function setFirewall(fraction) {
  if (!needsRun() || !run.enemy) return toast('NO TARGET');
  run.enemy.hp = Math.max(1, Math.round(run.enemy.max * fraction));
  touch(`firewall at ${Math.round(fraction * 100)}%`);
  sync();
}

async function instantBreach() {
  if (!needsRun() || !run.enemy) return toast('NO TARGET');
  run.enemy.hp = 0;
  touch('forced a breach');
  await breachNode();
  render();
}

function refillExecutes() {
  if (!needsRun()) return;
  run.executes = run.maxExecutes = Math.max(run.maxExecutes, 9);
  for (const id of run.abilities) run.charges[id] = ABILITIES[id].charges;
  touch('executes and charges refilled');
  sync();
}

function setAllDice(value) {
  if (!needsRun()) return;
  for (const die of boardDice) {
    die.value = die.shownValue = Math.min(value, DICE[die.type].faces);
  }
  touch(`board set to ${value}`);
  sync();
}

function maxAllDice() {
  if (!needsRun()) return;
  for (const die of boardDice) die.value = die.shownValue = DICE[die.type].faces;
  touch('board maxed');
  sync();
}

/** Keep the held cheats held, since playing spends them. */
function topUp() {
  if (!run || !open) return;
  let changed = false;
  if (held.scrap && run.scrap < LOTS / 2) {
    run.scrap = LOTS;
    changed = true;
  }
  if (held.executes && run.phase !== Phase.TITLE && run.executes < 3) {
    run.executes = run.maxExecutes = Math.max(run.maxExecutes, 9);
    changed = true;
  }
  if (changed) {
    run.cheated = true;
    updateUI();
  }
}

function toggleHeld(name) {
  if (!needsRun()) return;
  held[name] = !held[name];
  if (held[name]) touch(`${name} held`);
  topUp();
  sync();
}

// ---- The shared board ------------------------------------------------------

/**
 * Ask twice before deleting anything other people can see.
 *
 * The first click arms the button, which says so; the second does it. A few
 * seconds later it disarms itself, so a button left armed and come back to
 * cannot be fired by a click meant for something else.
 *
 * @returns {boolean} true when this click is the one that should do the work.
 */
function confirmed(token) {
  clearTimeout(armTimer);
  if (armed === token) {
    armed = '';
    armTimer = null;
    return true;
  }
  armed = token;
  armTimer = setTimeout(() => {
    armed = '';
    render();
  }, ARM_MS);
  render();
  return false;
}

/** Read the board again: the counts, every tournament, the leaderboard. */
async function refreshNet() {
  netState.busy = true;
  render();

  // The leaderboard is public, so it is read whether or not there is a key —
  // seeing what is on the board is half of deciding what to take off it.
  const [ping, scores] = await Promise.all([ops.boardPing(), store.listScores({ limit: 100 })]);
  netState.counts = ping.ok ? ping.data : null;
  netState.error = ping.ok ? '' : ping.error;
  netState.scores = Array.isArray(scores) ? scores : [];

  const tournaments = ping.ok ? await ops.allTournaments() : null;
  netState.tournaments = tournaments && tournaments.ok ? tournaments.data || [] : [];

  netState.checked = true;
  netState.busy = false;
  render();
}

/** How an answer from the board reads in one line. */
function outcome(data) {
  if (!data || typeof data !== 'object') return 'done';
  if (typeof data.removed === 'number') return `removed ${data.removed}`;
  if (Array.isArray(data.dropped)) return `dropped ${data.dropped.length}`;
  return 'done';
}

/** Run one maintenance call, say what it did, and read the board back. */
async function netAction(label, thunk) {
  netState.busy = true;
  render();
  const result = await thunk();
  netState.said = result.ok ? `${label}: ${outcome(result.data)}` : `${label} failed — ${result.error}`;
  log('> root: ' + netState.said, 'mag');
  await refreshNet();
}

/** The same, for the things that only touch this device and cannot fail. */
function deviceAction(label, thunk) {
  const said = thunk();
  netState.said = said ? `${label}: ${said}` : label;
  log('> root: ' + netState.said, 'mag');
  render();
}

// ---- Rendering -------------------------------------------------------------

const TABS = { rig: 'RIG', run: 'RUN', board: 'BOARD', archive: 'ARCHIVE', net: 'NET' };

function catalogRows(catalog, kind) {
  return Object.entries(catalog).map(([id, def]) => `
    <div class="rs-row">
      <span class="rs-name" title="${escape(def.desc || '')}">${escape(def.name)}</span>
      <span class="rs-tier">T${def.tier || 1}</span>
      ${kind === 'art' ? `<select class="rs-ed" data-ed-for="${id}">
        <option value="">plain</option>
        ${Object.entries(EDITIONS).map(([edId, ed]) =>
          `<option value="${edId}">${escape(ed.name)}</option>`).join('')}
      </select>` : ''}
      <button class="rs-btn" data-grant="${kind}:${id}">ADD</button>
    </div>`).join('');
}

function ownedRows() {
  const rows = [];
  run.dice.forEach((type, i) => rows.push(`<div class="rs-row">
    <span class="rs-name">${escape(DICE[type].name)}</span>
    <button class="rs-btn rs-x" data-drop="die:${i}">DROP</button></div>`));
  run.abilities.forEach((id, i) => rows.push(`<div class="rs-row">
    <span class="rs-name">${escape(ABILITIES[id].name)}</span>
    <button class="rs-btn rs-x" data-drop="abil:${i}">DROP</button></div>`));
  run.artifacts.forEach((id, i) => {
    const worn = run.editions[id] || '';
    rows.push(`<div class="rs-row">
      <span class="rs-name">${escape(ARTIFACTS[id].name)}</span>
      <select class="rs-ed" data-restamp="${id}">
        <option value="" ${worn ? '' : 'selected'}>plain</option>
        ${Object.entries(EDITIONS).map(([edId, ed]) =>
          `<option value="${edId}" ${worn === edId ? 'selected' : ''}>${escape(ed.name)}</option>`).join('')}
      </select>
      <button class="rs-btn rs-x" data-drop="art:${i}">DROP</button></div>`);
  });
  return rows.join('') || '<div class="rs-note">Nothing installed.</div>';
}

function rigTab() {
  return `
    <div class="rs-cols">
      <section><h4>DICE</h4>${catalogRows(DICE, 'die')}</section>
      <section><h4>ABILITIES</h4>${catalogRows(ABILITIES, 'abil')}</section>
      <section><h4>CYBERARTIFACTS</h4>${catalogRows(ARTIFACTS, 'art')}</section>
      <section><h4>INSTALLED</h4>${ownedRows()}</section>
    </div>`;
}

function runTab() {
  const tier = DIFFICULTIES[run.difficulty] || {};
  return `
    <div class="rs-cols">
      <section>
        <h4>SCRAP</h4>
        <div class="rs-wrap">
          <button class="rs-btn" data-scrap="100">+100</button>
          <button class="rs-btn" data-scrap="1000">+1K</button>
          <button class="rs-btn" data-scrap="-100">-100</button>
          <button class="rs-btn ${held.scrap ? 'rs-on' : ''}" data-hold="scrap">
            INFINITE ${held.scrap ? 'ON' : 'OFF'}</button>
        </div>
        <h4>EXECUTES</h4>
        <div class="rs-wrap">
          <button class="rs-btn" data-refill="1">REFILL</button>
          <button class="rs-btn ${held.executes ? 'rs-on' : ''}" data-hold="executes">
            NEVER TRACED ${held.executes ? 'ON' : 'OFF'}</button>
        </div>
        <h4>FIREWALL</h4>
        <div class="rs-wrap">
          <button class="rs-btn" data-fw="0.01">1%</button>
          <button class="rs-btn" data-fw="0.5">50%</button>
          <button class="rs-btn" data-fw="1">100%</button>
          <button class="rs-btn rs-x" data-breach="1">BREACH NOW</button>
        </div>
      </section>
      <section>
        <h4>JUMP</h4>
        <div class="rs-wrap">
          <label class="rs-field">SERVER <input class="rs-num" id="rsServer" type="number"
            min="1" max="60" value="${run.server}"></label>
          <label class="rs-field">NODE <input class="rs-num" id="rsNode" type="number"
            min="1" max="${NODES_PER_SERVER}" value="${Math.min(run.node, NODES_PER_SERVER)}"></label>
          <button class="rs-btn" data-jump="1">GO</button>
        </div>
        <div class="rs-wrap">
          <button class="rs-btn" data-hop="1">SERVER +1</button>
          <button class="rs-btn" data-hop="5">SERVER +5</button>
        </div>
        <div class="rs-note">Tier ${escape(tier.name || '?')} ·
          seed ${escape(run.seed || '—')} · ${run.cheated ? 'FLAGGED' : 'clean'}</div>
      </section>
      <section>
        <h4>PROTOCOL</h4>
        <div class="rs-note">This seed's order, server 1 &rarr; ${BOSS_ORDER.length}.</div>
        ${BOSS_ORDER.map((_, i) => {
          const id = bossForServer(i + 1, run.seed);
          return `<div class="rs-row">
            <span class="rs-tier">S${i + 1}</span>
            <span class="rs-name" title="${escape(BOSSES[id].rule)}">${escape(BOSSES[id].name)}</span>
            <button class="rs-btn" data-boss="${id}">JUMP</button></div>`;
        }).join('')}
      </section>
    </div>`;
}

function boardTab() {
  return `
    <div class="rs-cols">
      <section>
        <h4>FACES</h4>
        <div class="rs-wrap">
          ${[1, 2, 3, 4, 5, 6].map(v => `<button class="rs-btn" data-face="${v}">${v}</button>`).join('')}
          <button class="rs-btn" data-face="max">MAX</button>
        </div>
        <h4>LOCKS</h4>
        <div class="rs-wrap">
          <button class="rs-btn" data-lock="1">LOCK ALL</button>
          <button class="rs-btn" data-lock="0">UNLOCK ALL</button>
          <button class="rs-btn" data-rerolls="1">+5 REROLLS</button>
        </div>
        <div class="rs-note">Phase ${escape(run.phase)} ·
          ${boardDice.length} dice · ${run.executes}/${run.maxExecutes} executes</div>
      </section>
      <section>
        <h4>DICE ON THE BOARD</h4>
        ${boardDice.map((die, i) => `<div class="rs-row">
          <span class="rs-name">${escape(DICE[die.type].name)}</span>
          <input class="rs-num" type="number" min="1" max="${DICE[die.type].faces}"
                 value="${die.value}" data-die="${i}">
          ${die.locked ? '<span class="rs-tier">LOCK</span>' : ''}
        </div>`).join('') || '<div class="rs-note">No dice on the board.</div>'}
      </section>
    </div>`;
}

/**
 * The archive tab, which is the one thing here that works without a run: what
 * it edits belongs to the device, not to what is being played.
 */
function archiveTab() {
  const rows = ARCHIVE_SECTIONS.map(section => {
    const { seen, total } = progressOf(section);
    return `<div class="rs-row">
      <span class="rs-name">${section.title}</span>
      <span class="rs-tier">${seen}/${total}</span>
    </div>`;
  }).join('');

  return `<div class="rs-cols">
    <section>
      <h4>ARCHIVE</h4>
      ${rows}
      <div class="rs-wrap" style="margin-top:8px">
        <button class="rs-btn" data-archive="all">SHOW ALL</button>
        <button class="rs-btn rs-x" data-archive="none">FORGET ALL</button>
      </div>
      <div class="rs-note">Shown on the start screen under ARCHIVE. Kept on this
        device, so revealing it changes nothing about a run and never leaves here.</div>

      <h4>ACHIEVEMENTS</h4>
      <div class="rs-row">
        <span class="rs-name">COMPLETE</span>
        <span class="rs-tier">${earnedCount()}/${contractTotal()}</span>
      </div>
      <div class="rs-wrap" style="margin-top:8px">
        <button class="rs-btn" data-contracts="all">COMPLETE ALL</button>
        <button class="rs-btn rs-x" data-contracts="none">CLEAR ALL</button>
      </div>
      <div class="rs-note">A run that has been touched in here earns none of
        them on its own, which is what these two buttons are for.</div>
    </section>
  </div>`;
}

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** A button that has to be asked twice, showing which half of that it is in. */
const danger = (token, label) =>
  `<button class="rs-btn rs-x ${armed === token ? 'rs-armed' : ''}" data-net="${token}">${
    armed === token ? 'SURE?' : label}</button>`;

/**
 * The shared board: what is on it, and what can be taken off it.
 *
 * Works without a run, like the archive, because none of it is about one. It
 * also works without the maintenance key — the leaderboard is public — and then
 * simply cannot change anything, which every failed button says plainly.
 */
function netTab() {
  const { base, override } = ops.boardTarget();
  const known = new Set(ops.knownTournamentIds());
  const hasKey = !!ops.adminKey();

  const status = netState.busy ? 'reading the board…'
    : netState.error ? netState.error
      : netState.counts
        ? `${plural(netState.counts.scores, 'result')} · ` +
          `${plural(netState.counts.tournaments, 'tournament')} · ${netState.counts.live} running`
        : hasKey ? 'not read yet' : 'no key on this device';

  const tournamentRows = netState.tournaments.map(row => `
    <div class="rs-item">
      <div class="rs-row">
        <span class="rs-name" title="host ${escape(row.host || '?')} · seed ${escape(row.seed || '?')}">
          ${escape(row.id)} ${escape(row.name || '')}</span>
        <span class="rs-tier">${row.scores || 0} done · ${row.live || 0} live${
          row.expired ? ' · EXPIRED' : ''}</span>
      </div>
      <div class="rs-wrap">
        <button class="rs-btn ${known.has(row.id) ? 'rs-on' : ''}" data-net="know:${row.id}">
          ${known.has(row.id) ? 'VISIBLE HERE' : 'SHOW HERE'}</button>
        <button class="rs-btn" data-net="lobby:${row.id}">CLEAR LOBBY</button>
        ${danger('tboard:' + row.id, 'CLEAR BOARD')}
        ${danger('twipe:' + row.id, 'DELETE EVERYWHERE')}
      </div>
    </div>`).join('') || `<div class="rs-note">${
    netState.checked ? 'Nothing on the board, or no key to list it with.' : 'Not read yet.'}</div>`;

  const scoreRows = netState.scores.map((entry, i) => `
    <div class="rs-row">
      <span class="rs-tier">${i + 1}</span>
      <span class="rs-name" title="${escape(entry.id || '')} · ${escape(entry.difficulty || '')} · server ${
  entry.server || 0}">
        ${escape(entry.handle || '?')} · ${escape(fmt(entry.score || 0))}${
  entry.tournament ? ' · ' + escape(entry.tournament) : ''}</span>
      <button class="rs-btn rs-x" data-net="drop:${escape(entry.id || '')}">DROP</button>
    </div>`).join('') || '<div class="rs-note">The leaderboard is empty.</div>';

  const deviceRows = ops.deviceKeys().map(key => `
    <div class="rs-row">
      <span class="rs-name">${escape(key.name)}</span>
      <span class="rs-tier">${key.size}b</span>
      <button class="rs-btn rs-x" data-net="key-drop:${escape(key.name)}">DROP</button>
    </div>`).join('');

  return `<div class="rs-cols">
    <section>
      <h4>BOARD</h4>
      <div class="rs-note">${escape(base || 'no board configured')}</div>
      <div class="rs-wrap">
        <input class="rs-num rs-wide" type="password" data-draft="key"
               placeholder="maintenance key" value="${escape(netDraft.key)}">
        <button class="rs-btn" data-net="save-key">USE KEY</button>
        <button class="rs-btn" data-net="refresh">REFRESH</button>
      </div>
      <div class="rs-note">${escape(status)}</div>
      ${netState.said ? `<div class="rs-note rs-said">${escape(netState.said)}</div>` : ''}

      <h4>POINTED AT</h4>
      <div class="rs-wrap">
        <input class="rs-num rs-wide" type="text" data-draft="base"
               placeholder="https://…" value="${escape(netDraft.base)}">
        <button class="rs-btn" data-net="save-base">SET</button>
        <button class="rs-btn rs-x" data-net="clear-base">BUILT IN</button>
      </div>
      <div class="rs-note">${override
    ? 'Overridden on this device. '
    : 'Using the address in services/config.js. '}Either way it is read once, at
        load, so this takes a reload.</div>

      <h4>THIS DEVICE</h4>
      <div class="rs-wrap">${danger('forget-all', 'FORGET ALL TOURNAMENTS')}</div>
      <div class="rs-note">Only here: they stay on the board, this device stops
        listing them.</div>
      ${deviceRows}
    </section>

    <section>
      <h4>TOURNAMENTS</h4>
      <div class="rs-note">Every one on the board, not just the ones this device
        was let into.</div>
      ${tournamentRows}
      <div class="rs-wrap" style="margin-top:6px">
        <button class="rs-btn" data-net="sweep">SWEEP EXPIRED</button>
      </div>
    </section>

    <section>
      <h4>LEADERBOARD</h4>
      <div class="rs-wrap">
        <input class="rs-num rs-wide" type="text" data-draft="handle"
               placeholder="handle" maxlength="16" value="${escape(netDraft.handle)}">
        ${danger('purge', 'PURGE HANDLE')}
        ${danger('wipe-scores', 'WIPE BOARD')}
      </div>
      <div class="rs-note">A handle is a label, not an account: purging one takes
        every run posted under that name, from here and from every tournament
        board, whoever played them.</div>
      ${scoreRows}
    </section>
  </div>`;
}

function render() {
  if (!panel || !open) return;
  const body = panel.querySelector('.rs-body');
  for (const button of panel.querySelectorAll('[data-tab]')) {
    button.classList.toggle('rs-on', button.dataset.tab === tab);
  }
  // Neither the archive nor the board belongs to a run, so neither needs one.
  if (tab === 'archive') {
    body.innerHTML = archiveTab();
    return;
  }
  if (tab === 'net') {
    body.innerHTML = netTab();
    return;
  }
  if (!run || run.phase === Phase.TITLE) {
    body.innerHTML = '<div class="rs-note">Start a run, then reopen this.</div>';
    return;
  }
  body.innerHTML = tab === 'rig' ? rigTab() : tab === 'run' ? runTab() : boardTab();
}

// ---- Wiring ----------------------------------------------------------------

/** Opening the board tab: fill its fields from this device, then read the board. */
function primeNet() {
  netDraft.key = ops.adminKey();
  netDraft.base = ops.boardTarget().override;
  if (!netState.checked && !netState.busy) void refreshNet();
}

function onNetClick(action) {
  const at = action.indexOf(':');
  const verb = at === -1 ? action : action.slice(0, at);
  const value = at === -1 ? '' : action.slice(at + 1);

  switch (verb) {
    case 'save-key':
      ops.setAdminKey(netDraft.key);
      netState.said = netDraft.key ? 'key saved on this device' : 'key cleared';
      return void refreshNet();

    case 'refresh':
      return void refreshNet();

    case 'save-base':
      ops.setBoardTarget(netDraft.base);
      return deviceAction('pointed at ' + (netDraft.base || 'the built-in board'),
        () => 'reload to use it');

    case 'clear-base':
      ops.setBoardTarget('');
      netDraft.base = '';
      return deviceAction('back to the built-in board', () => 'reload to use it');

    case 'sweep':
      return void netAction('sweep', () => ops.sweepExpired());

    // Local only: whether this device lists a tournament it did not host.
    case 'know':
      if (ops.knownTournamentIds().includes(value)) {
        ops.forgetTournament(value);
        return deviceAction(value + ' hidden here', () => '');
      }
      ops.rememberTournament(value);
      return deviceAction(value + ' now listed here', () => '');

    case 'lobby':
      return void netAction('clear ' + value + ' lobby', () => ops.clearTournamentLobby(value));

    case 'tboard':
      if (!confirmed(action)) return;
      return void netAction('clear ' + value + ' board', () => ops.clearTournamentBoard(value));

    case 'twipe':
      if (!confirmed(action)) return;
      return void netAction('delete ' + value, () => ops.wipeTournament(value));

    case 'drop':
      return void netAction('drop result', () => ops.dropScore(value));

    case 'purge': {
      const handle = netDraft.handle.trim().toUpperCase();
      if (!handle) return toast('TYPE A HANDLE FIRST');
      if (!confirmed(action)) return;
      return void netAction('purge ' + handle, () => ops.purgeHandle(handle));
    }

    case 'wipe-scores':
      if (!confirmed(action)) return;
      return void netAction('wipe the leaderboard', () => ops.clearScores());

    case 'forget-all':
      if (!confirmed(action)) return;
      return deviceAction('forgot every tournament here',
        () => ops.forgetAllTournaments() + ' dropped');

    case 'key-drop':
      return deviceAction('dropped ' + value, () => {
        ops.dropDeviceKey(value);
        if (value === 'htd_admin_key') netDraft.key = '';
        return '';
      });

    default:
      return;
  }
}

function onClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  const d = button.dataset;

  if (d.tab) {
    tab = d.tab;
    armed = '';
    if (tab === 'net') primeNet();
    render();
    return;
  }
  if (d.close !== undefined) { closeRootShell(); return; }

  if (d.net) { onNetClick(d.net); return; }

  // The archive is not part of a run, so this neither needs one nor flags one.
  if (d.archive) {
    if (d.archive === 'all') revealAll();
    else forgetAll();
    log('> root: archive ' + (d.archive === 'all' ? 'revealed' : 'cleared'), 'mag');
    render();
    return;
  }

  if (d.contracts) {
    if (d.contracts === 'all') grantAllContracts();
    else forgetContracts();
    log('> root: contracts ' + (d.contracts === 'all' ? 'completed' : 'cleared'), 'mag');
    render();
    return;
  }

  if (d.grant) {
    const [kind, id] = d.grant.split(':');
    if (kind === 'die') grantDie(id);
    else if (kind === 'abil') grantAbility(id);
    else {
      const picker = panel.querySelector(`[data-ed-for="${id}"]`);
      grantArtifact(id, picker ? picker.value : '');
    }
    return;
  }
  if (d.drop) {
    const [kind, index] = d.drop.split(':');
    removeItem(kind, Number(index));
    return;
  }
  if (d.scrap) return addScrap(Number(d.scrap));
  if (d.hold) return toggleHeld(d.hold);
  if (d.refill) return refillExecutes();
  if (d.fw) return setFirewall(Number(d.fw));
  if (d.breach) return void instantBreach();
  if (d.boss) return jumpToBoss(d.boss);
  if (d.jump) {
    return jumpTo(Number(panel.querySelector('#rsServer').value),
      Number(panel.querySelector('#rsNode').value));
  }
  if (d.hop) return jumpTo(run.server + Number(d.hop), 1);
  if (d.face) {
    if (d.face === 'max') maxAllDice();
    else setAllDice(Number(d.face));
    return;
  }
  if (d.lock) {
    if (d.lock === '1') for (const die of boardDice) die.locked = true;
    else unlockAll();
    touch('locks changed');
    sync();
    return;
  }
  if (d.rerolls) {
    run.rerolls += 5;
    touch('+5 rerolls');
    sync();
  }
}

/**
 * Keep the board tab's fields in a draft rather than in the DOM.
 *
 * This panel redraws whole tabs, so a redraw arriving while a key is half typed
 * would take the typed half with it.
 */
function onInput(event) {
  const field = event.target.dataset.draft;
  if (field !== undefined) netDraft[field] = event.target.value;
}

function onChange(event) {
  const target = event.target;
  if (target.dataset.restamp) return restamp(target.dataset.restamp, target.value);
  if (target.dataset.die !== undefined) {
    const die = boardDice[Number(target.dataset.die)];
    if (!die) return;
    die.value = die.shownValue =
      Math.max(1, Math.min(DICE[die.type].faces, Number(target.value) || 1));
    touch('set a die');
    sync();
  }
}

function build() {
  panel = document.createElement('div');
  panel.className = 'rs';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="rs-box">
      <header class="rs-head">
        <span class="rs-title">ROOT SHELL</span>
        ${Object.entries(TABS).map(([id, label]) =>
          `<button class="rs-btn" data-tab="${id}">${label}</button>`).join('')}
        <span class="rs-grow"></span>
        <button class="rs-btn rs-x" data-close>CLOSE</button>
      </header>
      <div class="rs-body"></div>
    </div>`;

  const style = document.createElement('style');
  style.textContent = `
    .rs { position:fixed; inset:auto 0 0 0; z-index:70; display:flex;
          justify-content:center; padding:0 8px 8px; font-family:var(--px,monospace); }
    .rs[hidden] { display:none; }
    .rs-box { width:min(1100px,100%); max-height:62dvh; display:flex; flex-direction:column;
              background:#0b0a14; border:2px solid #b6ff3d; box-shadow:0 -6px 24px -8px #b6ff3d; }
    .rs-head { display:flex; align-items:center; gap:6px; padding:6px 8px;
               border-bottom:1px solid #241e42; }
    .rs-title { font-size:9px; color:#b6ff3d; letter-spacing:1px; }
    .rs-grow { flex:1; }
    .rs-body { overflow:auto; padding:8px; }
    .rs-cols { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); }
    .rs-body h4 { font-size:8px; color:#3df2ff; margin:0 0 5px; letter-spacing:1px; }
    .rs-body section + section, .rs-body h4 + .rs-wrap { margin-top:0; }
    .rs-body h4:not(:first-child) { margin-top:11px; }
    .rs-row { display:flex; align-items:center; gap:5px; padding:1px 0; }
    .rs-name { flex:1; font-family:ui-monospace,monospace; font-size:12px; color:#dfe6ff;
               white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .rs-tier { font-size:7px; color:#7d84ad; }
    .rs-note { font-family:ui-monospace,monospace; font-size:12px; color:#7d84ad;
               line-height:1.3; margin-top:5px; }
    .rs-wrap { display:flex; flex-wrap:wrap; gap:4px; }
    .rs-btn { background:#141226; border:1px solid #3d3070; color:#dfe6ff;
              font-family:var(--px,monospace); font-size:7px; padding:5px 6px; cursor:pointer; }
    .rs-btn:hover { border-color:#b6ff3d; color:#b6ff3d; }
    .rs-btn.rs-on { background:#b6ff3d; border-color:#b6ff3d; color:#07060f; }
    .rs-btn.rs-x { border-color:#ff4d6d; color:#ff4d6d; }
    .rs-btn.rs-x:hover { background:#ff4d6d; color:#07060f; }
    .rs-btn.rs-armed { background:#ff4d6d; border-color:#ff4d6d; color:#07060f; }
    .rs-ed, .rs-num { background:#07060f; border:1px solid #3d3070; color:#dfe6ff;
                      font-family:ui-monospace,monospace; font-size:11px; padding:2px 3px; }
    .rs-num { width:54px; }
    .rs-wide { width:100%; flex:1 1 140px; }
    .rs-item { padding:4px 0; border-top:1px solid #1b1733; }
    .rs-said { color:#b6ff3d; }
    .rs-field { display:flex; align-items:center; gap:4px; font-size:7px; color:#7d84ad; }
  `;

  document.head.appendChild(style);
  document.body.appendChild(panel);
  panel.addEventListener('click', onClick);
  panel.addEventListener('change', onChange);
  panel.addEventListener('input', onInput);
}

// ---- Open and close --------------------------------------------------------

export function openRootShell() {
  if (!panel) build();
  open = true;
  panel.hidden = false;
  if (tab === 'net') primeNet();
  render();
  if (!topUpTimer) topUpTimer = setInterval(topUp, TOPUP_MS);
  log('> root shell attached', 'mag');
}

export function closeRootShell() {
  open = false;
  // Nothing stays armed across a close: reopening should not find a button one
  // click away from deleting a board.
  armed = '';
  clearTimeout(armTimer);
  armTimer = null;
  if (panel) panel.hidden = true;
  if (topUpTimer) clearInterval(topUpTimer);
  topUpTimer = null;
}

export function toggleRootShell() {
  if (open) closeRootShell();
  else openRootShell();
}
