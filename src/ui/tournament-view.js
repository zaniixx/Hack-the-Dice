/**
 * Tournament screens: the list, the host form, and a tournament's own board.
 *
 * The host form keeps its draft here, because it is a form: it has to survive
 * the re-renders that toggling a ban causes.
 */
import { BOSSES, BOSS_ORDER } from '../data/bosses.js';
import { DICE } from '../data/dice.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { ABILITIES } from '../data/abilities.js';
import { DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { MAX_SEED_LENGTH, normaliseSeed } from '../core/game-random.js';
import { qrSVG } from '../render/qr.js';
import { iconURL } from '../render/icon-sprites.js';
import { dieIconURL } from '../render/die-sprites.js';
import { tournamentRules } from '../game/tournament.js';
import { difficultyCardsHTML, tierPill } from './difficulty-view.js';
import { raceBoardHTML } from './live-board.js';

const escape = text => String(text).replace(/[<>&"]/g,
  ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));

// ---- Host draft -------------------------------------------------------------

const emptyDraft = () => ({
  name: '',
  seed: '',
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

/**
 * Hold on to what the host has typed.
 *
 * Toggling a ban re-renders the whole form, so anything typed has to be read
 * back into the draft first or it would be wiped by the next click.
 */
export function captureHostForm(root) {
  const name = root.querySelector('#tournamentName');
  if (name) hostDraft.name = name.value;

  const seed = root.querySelector('#tournamentSeed');
  if (seed) hostDraft.seed = normaliseSeed(seed.value);
}

/**
 * Where a scanned code should send someone.
 *
 * Served over http, the QR carries a link that opens the game and joins in one
 * step — which only reaches another device if the server is on the network
 * rather than on localhost. Opened from a file, it carries the code itself, to
 * be pasted into JOIN.
 */
export function joinTarget(code) {
  const { protocol, origin, pathname } = window.location;
  const overNetwork = protocol === 'http:' || protocol === 'https:';
  return overNetwork ? `${origin}${pathname}#join=${code}` : code;
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
      <input id="tournamentName" maxlength="20" placeholder="MIDNIGHT LEDGER" autocomplete="off"
             value="${escape(hostDraft.name)}">
    </label>

    <label class="field">
      <span>SEED — fix one and every runner rolls the same dice, or leave blank</span>
      <input id="tournamentSeed" maxlength="${MAX_SEED_LENGTH}" placeholder="RANDOM PER RUNNER"
             autocomplete="off" spellcheck="false" value="${escape(hostDraft.seed)}">
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
    <p class="lede">Type the five-character op code of a tournament already on this device, or
      paste a full invite code — that one carries the whole rule set, so it works on any device.
      Scanning the host's QR does the same thing in one step.</p>
    <label class="field">
      <span>OP CODE OR INVITE CODE</span>
      <textarea id="joinCode" rows="3" placeholder="K7M4X   or   HTD-..." spellcheck="false"></textarea>
    </label>
    ${error ? `<p class="error">${error}</p>` : ''}
    <div class="row-actions">
      <button class="btn cyan" data-action="join-code">JOIN</button>
    </div>`;
}

export function tournamentListHTML(tournaments) {
  // null means the shared board could not be reached, which is not the same as
  // having none, and must not be shown as though it were.
  const offline = tournaments === null;
  const cards = (tournaments || []).map(tournament => `<div class="op-card">
      <div class="op-top">
        <span class="op-name">${escape(tournament.name)}</span>
        ${tierPill(tournament.difficulty)}
      </div>
      <div class="op-meta">hosted by ${escape(tournament.host)} · ${escape(tournamentRules(tournament).slice(1).join(' · '))}</div>
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
    <h3 class="sec">YOURS</h3>
    ${offline
      ? '<p class="empty-note">The shared board is unreachable, so your tournaments cannot be listed. Check your connection and try again.</p>'
      : cards || '<p class="empty-note">None yet. Host one, or join with a code — a tournament only appears here once you have hosted it or been given its code.</p>'}`;
}

/**
 * One tournament: set your name, play it, watch the board, share the code.
 *
 * In that order, because that is the order it is used in. Everything to do with
 * inviting people sits below the board rather than above it, and removing the
 * tournament sits below that, on its own, where it cannot be hit by accident.
 *
 * The handle field is here and not only on the home screen: arriving by a
 * scanned QR lands you straight on this page, and being sent back to sign in
 * somewhere else before you can play is a silly way to lose someone.
 */
export function tournamentDetailHTML(tournament, rows, {
  handle = '', maxHandle = 12, notice = '', highlight = null,
} = {}) {
  // The tier is already a pill above, so the list starts after it.
  const rules = tournamentRules(tournament).slice(1)
    .map(line => `<li>${escape(line)}</li>`).join('');

  const qr = qrSVG(joinTarget(tournament.code), { moduleSize: 4 });

  return `<div class="panel-head">
      <h2>${escape(tournament.name)}</h2>
      <button class="btn sm" data-action="view:tournaments">BACK</button>
    </div>
    <div class="op-meta">hosted by ${escape(tournament.host)} · ${tierPill(tournament.difficulty)}</div>
    <ul class="rules">${rules}</ul>

    <section class="start-card">
      <label class="field">
        <span>YOUR HANDLE — this name goes on the board</span>
        <input id="handleInput" maxlength="${maxHandle}" value="${escape(handle)}"
               placeholder="HANDLE" autocomplete="off" spellcheck="false">
      </label>
      ${notice ? `<p class="notice">${escape(notice)}</p>` : ''}
      <div class="row-actions">
        <button class="btn lime big" data-action="play-tournament:${tournament.id}">PLAY THIS TOURNAMENT</button>
      </div>
    </section>

    <h3 class="sec">LOBBY <span class="dim">runs in progress rank live, and settle when they finish</span></h3>
    <div id="tournamentBoard">${raceBoardHTML(rows, { highlight })}</div>

    <h3 class="sec">INVITE <span class="dim">any camera app opens the game and joins in one scan</span></h3>
    <div class="invite">
      <div class="invite-code">
        <span class="invite-label">OP CODE</span>
        <span class="op-code">${escape(tournament.id)}</span>
        <span class="invite-note">Five characters, for anyone typing it in.</span>
      </div>
      <div class="invite-qr">
        ${qr || '<p class="empty-note">This code is too long to show as a QR.</p>'}
        <span class="invite-note">Scan to join.</span>
      </div>
    </div>
    <div class="row-actions">
      <button class="btn sm" data-action="copy-code:${tournament.id}">COPY INVITE LINK</button>
    </div>
    <details class="raw-code">
      <summary>Invite code as text</summary>
      <textarea id="tournamentCode" rows="2" readonly spellcheck="false">${tournament.code}</textarea>
    </details>

    <div class="row-actions danger-row">
      <button class="btn sm mag" data-action="delete-tournament:${tournament.id}">REMOVE FROM THIS DEVICE</button>
    </div>`;
}
