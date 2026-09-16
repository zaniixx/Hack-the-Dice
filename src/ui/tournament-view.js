/**
 * Tournament screens: the list, the host form, and a tournament's own board.
 *
 * The host form keeps its draft here, because it is a form: it has to survive
 * the re-renders that toggling a ban causes.
 */
import { BOSSES, BOSS_ORDER } from '../data/enemies.js';
import { DICE } from '../data/dice.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { ABILITIES } from '../data/abilities.js';
import { ItemKind } from '../data/catalog.js';
import { DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { iconURL } from '../render/icon-sprites.js';
import { dieIconURL } from '../render/die-sprites.js';
import { tournamentRules } from '../game/tournament.js';
import { difficultyCardsHTML, tierPill } from './difficulty-view.js';
import { boardHTML } from './leaderboard-view.js';

const escape = text => String(text).replace(/[<>&"]/g,
  ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));

// ---- Host draft -------------------------------------------------------------

const emptyDraft = () => ({
  difficulty: DEFAULT_DIFFICULTY,
  bans: { bosses: [], dice: [], artifacts: [], abilities: [] },
});

export let hostDraft = emptyDraft();

export function resetHostDraft(difficulty = DEFAULT_DIFFICULTY) {
  hostDraft = emptyDraft();
  hostDraft.difficulty = difficulty;
}

export function setHostDifficulty(id) {
  hostDraft.difficulty = id;
}

/** Ban or unban one thing. The form re-renders from the draft afterwards. */
export function toggleBan(list, id) {
  const banned = hostDraft.bans[list];
  hostDraft.bans[list] = banned.includes(id)
    ? banned.filter(banned => banned !== id)
    : [...banned, id];
}

// ---- Pieces -----------------------------------------------------------------

/** One ban toggle. Banned things are struck through and dimmed. */
function banChip(list, id, label, icon) {
  const banned = hostDraft.bans[list].includes(id);
  return `<button class="ban-chip ${banned ? 'banned' : ''}" data-action="ban:${list}:${id}"
                  aria-pressed="${banned}" title="${banned ? 'Banned' : 'Allowed'}: ${label}">
    ${icon ? `<img src="${icon}" alt="">` : ''}<span>${label}</span>
  </button>`;
}

function banGroup(title, note, chips) {
  return `<div class="ban-group">
    <div class="ban-head">${title}<span>${note}</span></div>
    <div class="ban-chips">${chips}</div>
  </div>`;
}

/** The four ban lists: bosses, dice, cyberartifacts and abilities. */
function bansHTML() {
  const bosses = BOSS_ORDER
    .map(id => banChip('bosses', id, BOSSES[id].name, null)).join('');
  const dice = Object.keys(DICE)
    .map(id => banChip('dice', id, DICE[id].name, dieIconURL(id))).join('');
  const artifacts = Object.keys(ARTIFACTS)
    .map(id => banChip('artifacts', id, ARTIFACTS[id].name, iconURL(id, ARTIFACTS[id].color))).join('');
  const abilities = Object.keys(ABILITIES)
    .map(id => banChip('abilities', id, ABILITIES[id].name, iconURL(id, ABILITIES[id].color))).join('');

  return `<div class="bans">
    ${banGroup('BOSS PROTOCOLS', 'ban all three and node 5 has no protocol', bosses)}
    ${banGroup('DICE', 'D6 still starts every pool', dice)}
    ${banGroup('CYBERARTIFACTS', 'removed from the black market', artifacts)}
    ${banGroup('ABILITIES', 'removed from the black market', abilities)}
  </div>`;
}

// ---- Screens ----------------------------------------------------------------

export function hostFormHTML() {
  return `<div class="panel-head">
      <h2>HOST A TOURNAMENT</h2>
      <button class="btn sm" data-action="view:tournaments">BACK</button>
    </div>
    <p class="lede">Set the rules once. Everyone who plays your code plays exactly this.</p>

    <label class="field">
      <span>OPERATION NAME</span>
      <input id="tournamentName" maxlength="28" placeholder="MIDNIGHT LEDGER" autocomplete="off">
    </label>

    <h3 class="sec">THREAT LEVEL</h3>
    ${difficultyCardsHTML(hostDraft.difficulty, 'host-difficulty')}

    <h3 class="sec">BANS <span class="dim">click anything to ban it</span></h3>
    ${bansHTML()}

    <div class="row-actions">
      <button class="btn lime" data-action="host-create">CREATE TOURNAMENT</button>
    </div>`;
}

export function joinFormHTML(error) {
  return `<div class="panel-head">
      <h2>JOIN A TOURNAMENT</h2>
      <button class="btn sm" data-action="view:tournaments">BACK</button>
    </div>
    <p class="lede">Paste the host's code. It carries the whole rule set, so you can play the
      same tournament on any device.</p>
    <label class="field">
      <span>TOURNAMENT CODE</span>
      <textarea id="joinCode" rows="3" placeholder="HTD1-..." spellcheck="false"></textarea>
    </label>
    ${error ? `<p class="error">${error}</p>` : ''}
    <div class="row-actions">
      <button class="btn cyan" data-action="join-code">JOIN</button>
    </div>`;
}

export function tournamentListHTML(tournaments) {
  const cards = tournaments.map(tournament => `<div class="op-card">
      <div class="op-top">
        <span class="op-name">${escape(tournament.name)}</span>
        ${tierPill(tournament.difficulty)}
      </div>
      <div class="op-meta">hosted by ${escape(tournament.host)} · ${tournamentRules(tournament)[1]}</div>
      <div class="row-actions">
        <button class="btn sm lime" data-action="open-tournament:${tournament.id}">OPEN</button>
        <button class="btn sm" data-action="copy-code:${tournament.id}">COPY CODE</button>
      </div>
    </div>`).join('');

  return `<div class="panel-head">
      <h2>TOURNAMENTS</h2>
      <button class="btn sm" data-action="view:home">BACK</button>
    </div>
    <p class="lede">Host an operation with its own rules and board, or join one with a code.
      Several runners can share this machine — each run signs in with its own handle.</p>
    <div class="row-actions">
      <button class="btn lime" data-action="view:host">HOST NEW</button>
      <button class="btn cyan" data-action="view:join">JOIN BY CODE</button>
    </div>
    <h3 class="sec">ON THIS DEVICE</h3>
    ${cards || '<p class="empty-note">No tournaments yet. Host one, or join with a code.</p>'}`;
}

/**
 * One tournament: its rules, its board, and the codes that move it between
 * devices.
 */
export function tournamentDetailHTML(tournament, board, { lastResult = null, notice = '' } = {}) {
  const rules = tournamentRules(tournament).map(line => `<li>${escape(line)}</li>`).join('');

  const resultBox = lastResult
    ? `<label class="field">
        <span>YOUR LAST RESULT CODE — send it to the host</span>
        <textarea id="resultCode" rows="2" readonly spellcheck="false">${lastResult}</textarea>
      </label>
      <div class="row-actions"><button class="btn sm" data-action="copy-result">COPY RESULT</button></div>`
    : '';

  return `<div class="panel-head">
      <h2>${escape(tournament.name)}</h2>
      <button class="btn sm" data-action="view:tournaments">BACK</button>
    </div>
    <div class="op-meta">hosted by ${escape(tournament.host)} · ${tierPill(tournament.difficulty)}</div>
    <ul class="rules">${rules}</ul>

    <div class="row-actions">
      <button class="btn lime" data-action="play-tournament:${tournament.id}">PLAY THIS TOURNAMENT</button>
      <button class="btn sm" data-action="copy-code:${tournament.id}">COPY JOIN CODE</button>
      <button class="btn sm mag" data-action="delete-tournament:${tournament.id}">REMOVE</button>
    </div>

    <label class="field">
      <span>JOIN CODE — anyone who pastes this plays the same rules</span>
      <textarea id="tournamentCode" rows="3" readonly spellcheck="false">${tournament.code}</textarea>
    </label>

    <h3 class="sec">BOARD</h3>
    ${boardHTML(board, { empty: 'No runs yet. Be the first.', showTier: false })}

    <h3 class="sec">MERGE A RESULT <span class="dim">paste a runner's result code</span></h3>
    <label class="field">
      <textarea id="mergeCode" rows="2" placeholder="HTDR1-..." spellcheck="false"></textarea>
    </label>
    ${notice ? `<p class="notice">${escape(notice)}</p>` : ''}
    <div class="row-actions">
      <button class="btn cyan" data-action="merge-result:${tournament.id}">MERGE</button>
    </div>
    ${resultBox}`;
}
