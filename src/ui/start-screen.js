/**
 * The start screen: the arcade cabinet's attract mode.
 *
 * It owns the `#start` overlay and a small view router — sign-in, leaderboard,
 * tournaments, host, join, and the rules. Views render to HTML and a single
 * delegated click handler reads `data-action` attributes, so a re-render can
 * never leave stale listeners behind.
 *
 * The screen never touches game state. It is handed `onStart` and `onResume`
 * and calls them with what the player chose.
 */
import { DEFAULT_DIFFICULTY, isKnownDifficulty } from '../data/difficulty.js';
import { MAX_SEED_LENGTH, normaliseSeed } from '../core/game-random.js';
import { activeLinks, activeProjectLinks } from '../data/links.js';
import { COPYRIGHT } from '../data/legal.js';
import { iconURL } from '../render/icon-sprites.js';
import { initAudio } from '../audio/synth.js';
import { sfx } from '../audio/sfx.js';
import { store } from '../services/store.js';
import {
  createTournament, decodeTournament, setActiveTournament, isOpCode,
} from '../game/tournament.js';
import { topScores, tournamentScores } from '../game/leaderboard.js';
import { els } from './dom.js';
import { toast } from './fx.js';
import { HOW_TO_PLAY } from './screens.js';
import { difficultyCardsHTML } from './difficulty-view.js';
import { boardHTML, difficultyTabsHTML } from './leaderboard-view.js';
import { archiveHTML } from './archive-view.js';
import { mergeBoard, raceBoardHTML, captureRowPositions, animateRankChanges } from './live-board.js';
import {
  hostDraft, resetHostDraft, setHostDifficulty, toggleBan, captureHostForm,
  hostFormHTML, joinFormHTML, tournamentListHTML, tournamentDetailHTML,
} from './tournament-view.js';

const MAX_HANDLE = 12;

/**
 * Handles are shown on boards and written back into an input value, so they are
 * kept to characters that cannot mean anything but themselves.
 */
const normaliseHandle = text =>
  String(text || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, MAX_HANDLE);

/** Actions and data handed in by the game when the screen is opened. */
let ctx = { saved: null, best: null, onStart: null, onResume: null };

/**
 * What the player has picked but not yet committed.
 *
 * Empty to begin with, so the first open takes the saved profile's handle and
 * threat level; after that, whatever they pick this session wins.
 */
let draft = { handle: '', difficulty: '', seed: '' };

let view = 'home';
let boardFilter = 'all';
let openTournament = null;
let notice = '';
let joinError = '';

/** The player's most recent run, so they can hand its code to a host. */
let lastResult = null;

/**
 * Bumped by every open and every navigation.
 *
 * Views await the store before they render, so a second navigation can be
 * asked for while the first is still loading. Each render captures the token
 * and drops its output if another one started meanwhile — last request wins.
 */
let renderToken = 0;

export function rememberResult(entry) {
  lastResult = entry;
}

const root = () => els.start;

// ---- Views ------------------------------------------------------------------

/**
 * Where the code is, how to report something broken, and who made it — in the
 * corner, where none of that competes with the game.
 *
 * Icon only: a row of labelled buttons across the middle of the screen read as
 * though pressing them were part of starting a run. The name appears beside the
 * icon on hover, and `aria-label` carries it for anyone not hovering anything.
 *
 * These leave the game, so they open in a new tab and drop the referrer.
 */
function cornerLinksHTML() {
  const links = [...activeLinks(), ...activeProjectLinks()];
  if (!links.length) return '';

  return `<div class="corner-links">${links.map(link => `
    <a class="corner-link" href="${link.url}" target="_blank" rel="noopener noreferrer"
       style="--tier:${link.color}" data-label="${link.label}" aria-label="${link.label}">
      <img src="${iconURL(link.id, link.color)}" alt="">
    </a>`).join('')}</div>`;
}

function homeHTML() {
  const best = ctx.best && ctx.best.server
    ? `<div class="kv">Personal best: <b>server ${ctx.best.server}, node ${ctx.best.node}</b></div>`
    : '<div class="kv dim">No personal best yet.</div>';

  const recent = draft.recentHandles && draft.recentHandles.length
    ? `<div class="recent">${draft.recentHandles
        .map(name => `<button class="chip" data-action="handle:${encodeURIComponent(name)}">${name}</button>`)
        .join('')}</div>`
    : '';

  const resume = ctx.saved
    ? `<button class="btn cyan" data-action="resume">RESUME S${ctx.saved.server} N${ctx.saved.node}</button>`
    : '';

  return `<div class="start-inner">
    <header class="start-head">
      <div class="start-logo glitch" data-text="HACK THE DICE">HACK THE DICE</div>
      <p class="start-sub">Breach corporate firewalls with a pool of virtual dice.</p>
    </header>

    <div class="start-cols">
      <section class="start-card">
        <h3 class="sec">RUNNER</h3>
        <label class="field">
          <span>SIGN IN — this name goes on the boards</span>
          <input id="handleInput" maxlength="${MAX_HANDLE}" value="${draft.handle}"
                 placeholder="HANDLE" autocomplete="off" spellcheck="false">
        </label>
        ${recent}
        <label class="field">
          <span>SEED — leave blank for a random run</span>
          <input id="seedInput" maxlength="${MAX_SEED_LENGTH}" value="${draft.seed}"
                 placeholder="RANDOM" autocomplete="off" spellcheck="false">
        </label>
        ${best}
        ${notice ? `<p class="error">${notice}</p>` : ''}
      </section>

      <section class="start-card wide">
        <h3 class="sec">THREAT LEVEL</h3>
        ${difficultyCardsHTML(draft.difficulty)}
      </section>
    </div>

    <div class="start-actions">
      <button class="btn lime big" data-action="start">LOCK IN</button>
      ${resume}
      <button class="btn" data-action="view:leaderboard">LEADERBOARD</button>
      <button class="btn" data-action="view:tournaments">TOURNAMENTS</button>
      <button class="btn" data-action="view:archive">ARCHIVE</button>
      <button class="btn sm" data-action="view:how">HOW TO HACK</button>
    </div>

    <p class="start-foot">${footNote()}</p>
    <p class="start-legal">${COPYRIGHT}</p>
  </div>`;
}

/** What the boards are, in one line. */
function footNote() {
  return `The game is still under development. Any reported bugs or suggestions are welcome.`;
}

async function leaderboardHTML() {
  const filter = boardFilter === 'all' ? null : boardFilter;
  // null is the board being unreachable, which is a different thing to say
  // than "nothing on it yet".
  const entries = await topScores({ difficulty: filter, limit: 25 });
  const offline = entries === null;

  return `<div class="start-inner">
    <div class="panel-head">
      <h2>LEADERBOARD</h2>
      <button class="btn sm" data-action="view:home">BACK</button>
    </div>
    <p class="lede">Score is nodes breached, servers owned and scrap harvested, multiplied by
      the threat level you ran.</p>
    ${difficultyTabsHTML(boardFilter)}
    ${boardHTML(entries || [], {
      empty: offline
        ? 'The shared board is unreachable. Scores are kept on it, not in this browser, so there is nothing to show until it answers.'
        : 'Nothing on this board yet. LOCK IN and put something on it.',
      showTier: boardFilter === 'all',
      highlight: lastResult && lastResult.id,
    })}
  </div>`;
}

async function tournamentsHTML() {
  return `<div class="start-inner">${tournamentListHTML(await store.listTournaments())}</div>`;
}

async function tournamentDetailView() {
  // Either half can be missing when the board is unreachable; an empty race is
  // the honest thing to draw, and the list above it says why.
  const [finished, live] = await Promise.all([
    tournamentScores(openTournament.id),
    store.listLiveRuns(openTournament.id),
  ]);
  return `<div class="start-inner">
    ${tournamentDetailHTML(openTournament, mergeBoard(finished, live), {
      handle: draft.handle,
      maxHandle: MAX_HANDLE,
      notice,
      highlight: lastResult && lastResult.id,
    })}
  </div>`;
}

// ---- The lobby, refreshing itself -------------------------------------------

/** How often the lobby re-ranks itself while it is on screen. */
const LOBBY_REFRESH_MS = 1000;

let lobbyTimer = null;

/**
 * Re-rank the board in place.
 *
 * Only the board is replaced, not the whole view: the invite code, the QR and
 * anything half-typed stay exactly where they are.
 */
async function refreshLobby() {
  if (view !== 'tournament' || !openTournament) return;
  const container = root().querySelector('#tournamentBoard');
  if (!container) return;

  const [finished, live] = await Promise.all([
    tournamentScores(openTournament.id),
    store.listLiveRuns(openTournament.id),
  ]);

  const before = captureRowPositions(container);
  container.innerHTML = raceBoardHTML(mergeBoard(finished, live), {
    highlight: lastResult && lastResult.id,
  });
  animateRankChanges(container, before);
}

function watchLobby() {
  stopWatchingLobby();
  lobbyTimer = setInterval(refreshLobby, LOBBY_REFRESH_MS);
  // Another tab on this machine is another runner: react the moment they move.
  addEventListener('storage', refreshLobby);
}

function stopWatchingLobby() {
  if (lobbyTimer) clearInterval(lobbyTimer);
  lobbyTimer = null;
  removeEventListener('storage', refreshLobby);
}

function howHTML() {
  return `<div class="start-inner">
    <div class="panel-head">
      <h2>HOW TO HACK</h2>
      <button class="btn sm" data-action="view:home">BACK</button>
    </div>
    ${HOW_TO_PLAY}
  </div>`;
}

const VIEWS = {
  home: async () => homeHTML(),
  leaderboard: leaderboardHTML,
  tournaments: tournamentsHTML,
  tournament: tournamentDetailView,
  host: async () => `<div class="start-inner">${hostFormHTML()}</div>`,
  join: async () => `<div class="start-inner">${joinFormHTML(joinError)}</div>`,
  archive: async () => archiveHTML(),
  how: async () => howHTML(),
};

/**
 * Read anything the player has typed back into the drafts before the markup
 * that holds it is replaced.
 */
function captureForm() {
  const handle = root().querySelector('#handleInput');
  if (handle) draft.handle = normaliseHandle(handle.value);

  const seed = root().querySelector('#seedInput');
  if (seed) draft.seed = normaliseSeed(seed.value);

  captureHostForm(root());
}

async function render() {
  captureForm();
  const token = ++renderToken;

  const html = await VIEWS[view]();
  if (token !== renderToken) return; // superseded while we were loading

  root().innerHTML = html + cornerLinksHTML();
  root().scrollTop = 0;

  if (view === 'tournament') watchLobby();
  else stopWatchingLobby();

  const handleInput = root().querySelector('#handleInput');
  if (handleInput) {
    handleInput.focus({ preventScroll: true });
    handleInput.setSelectionRange(handleInput.value.length, handleInput.value.length);
  }
}

async function show(next) {
  view = next;
  notice = '';
  await render();
}

// ---- Actions ----------------------------------------------------------------

/** Read the handle the player typed, normalised the way the boards show it. */
function readHandle() {
  const input = root().querySelector('#handleInput');
  draft.handle = normaliseHandle(input ? input.value : draft.handle);
  return draft.handle;
}

async function beginRun(tournament) {
  captureForm(); // the seed and handle as typed, before anything re-renders
  const handle = readHandle();
  if (!handle) {
    notice = 'SIGN IN FIRST — every run needs a handle for the board.';
    await render();
    sfx.buzz();
    return;
  }

  const difficulty = tournament ? tournament.difficulty : draft.difficulty;
  await store.rememberHandle(handle);
  await store.saveProfile({ ...(await store.getProfile()), handle, difficulty: draft.difficulty });

  closeStartScreen();
  ctx.onStart({ handle, difficulty, tournament, seed: draft.seed });
}

async function createFromForm() {
  captureForm();
  const tournament = createTournament({
    name: hostDraft.name,
    host: readHandle() || draft.handle || 'ANON',
    difficulty: hostDraft.difficulty,
    seed: hostDraft.seed,
    bans: hostDraft.bans,
  });

  await store.saveTournament(tournament);
  openTournament = tournament;
  await show('tournament');
  toast('TOURNAMENT CREATED');
}

async function joinFromCode() {
  const typed = root().querySelector('#joinCode').value.trim();

  // Five characters means a tournament this device already knows about.
  if (isOpCode(typed)) {
    const known = await store.getTournament(typed.toUpperCase());
    if (!known) {
      joinError = 'No tournament with that op code here. Paste the full invite code, or scan the host\'s QR.';
      await render();
      sfx.buzz();
      return;
    }
    joinError = '';
    openTournament = known;
    await show('tournament');
    return;
  }

  const tournament = decodeTournament(typed);
  if (!tournament) {
    joinError = 'That is not a code. Op codes are five characters; invite codes start with HTD-.';
    await render();
    sfx.buzz();
    return;
  }

  await store.saveTournament(tournament);
  joinError = '';
  openTournament = tournament;
  await show('tournament');
  toast('JOINED ' + tournament.name);
}

/**
 * A tournament arriving in the URL, from a scanned QR.
 *
 * The hash is consumed so a refresh does not keep re-joining, and so the link
 * does not linger in the address bar after it has been used.
 */
async function tournamentFromHash() {
  const match = location.hash.match(/join=([^&]+)/i);
  if (!match) return null;

  history.replaceState(null, '', location.pathname + location.search);
  const tournament = decodeTournament(decodeURIComponent(match[1]));
  if (!tournament) return null;

  await store.saveTournament(tournament);
  toast('JOINED ' + tournament.name);
  return tournament;
}


/** Copy text, falling back to selecting it when the clipboard is blocked. */
async function copyFrom(selector, label) {
  const field = root().querySelector(selector);
  if (!field) return;
  try {
    await navigator.clipboard.writeText(field.value);
    toast(label + ' COPIED');
  } catch {
    field.select();
    toast('PRESS CTRL+C TO COPY');
  }
}

async function copyTournamentCode(id) {
  const tournament = await store.getTournament(id);
  if (!tournament) return;

  if (view === 'tournament') {
    await copyFrom('#tournamentCode', 'JOIN CODE');
    return;
  }
  try {
    await navigator.clipboard.writeText(tournament.code);
    toast('JOIN CODE COPIED');
  } catch {
    openTournament = tournament;
    await show('tournament');
    toast('COPY THE CODE BELOW');
  }
}

/** Every click in the overlay comes through here. */
async function onClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  initAudio();

  const [action, ...rest] = target.dataset.action.split(':');
  const argument = rest.join(':');

  switch (action) {
    case 'start':
      await beginRun(null);
      break;
    case 'resume':
      closeStartScreen();
      ctx.onResume(ctx.saved);
      break;
    case 'view':
      if (argument === 'host') resetHostDraft(draft.difficulty);
      if (argument === 'join') joinError = '';
      await show(argument);
      break;
    case 'handle':
      draft.handle = decodeURIComponent(argument);
      await render();
      break;
    case 'difficulty':
      draft.difficulty = argument;
      sfx.lock(true);
      await render();
      break;
    case 'board':
      boardFilter = argument;
      await render();
      break;
    case 'host-difficulty':
      setHostDifficulty(argument);
      await render();
      break;
    case 'ban': {
      const [list, id] = rest;
      toggleBan(list, id);
      sfx.lock(hostDraft.bans[list].includes(id));
      await render();
      break;
    }
    case 'host-create':
      await createFromForm();
      break;
    case 'join-code':
      await joinFromCode();
      break;
    case 'open-tournament':
      openTournament = await store.getTournament(argument);
      await show('tournament');
      break;
    case 'play-tournament': {
      const tournament = await store.getTournament(argument);
      setActiveTournament(tournament);
      await beginRun(tournament);
      break;
    }
    case 'copy-code':
      await copyTournamentCode(argument);
      break;
    case 'delete-tournament':
      await store.deleteTournament(argument);
      openTournament = null;
      await show('tournaments');
      toast('TOURNAMENT REMOVED');
      break;
  }
}

/** Enter starts the run from the handle field — whichever screen it is on. */
function onKeydown(event) {
  if (event.key !== 'Enter') return;
  if (event.target.id === 'handleInput') {
    event.preventDefault();
    // The same field appears on a tournament, where it starts that tournament.
    beginRun(view === 'tournament' ? openTournament : null);
  } else if (event.target.id === 'joinCode') {
    event.preventDefault();
    joinFromCode();
  }
}

// ---- Opening and closing ----------------------------------------------------

/**
 * Show the start screen.
 *
 * @param {object} options
 * @param {string} [options.view]          which view to open on
 * @param {?string} [options.tournamentId] open this tournament's board
 * @param {?object} options.saved   a resumable run, if there is one
 * @param {?object} options.best    the personal best record
 * @param {Function} options.onStart  called with { handle, difficulty, tournament }
 * @param {Function} options.onResume called with the saved run
 */
export async function openStartScreen({
  view: initial = 'home', tournamentId = null, saved, best, onStart, onResume,
}) {
  // Load everything this open needs before touching any module state, so two
  // overlapping opens can never interleave and render a half-prepared view.
  const token = ++renderToken;
  const scanned = await tournamentFromHash();
  const [profile, requested] = await Promise.all([
    store.getProfile(),
    tournamentId ? store.getTournament(tournamentId) : null,
  ]);
  if (token !== renderToken) return; // a later open took over
  const tournament = scanned || requested;

  ctx = { saved, best, onStart, onResume };
  notice = '';
  if (tournament) openTournament = tournament;

  // Asking for a tournament that is not here any more falls back to the list.
  view = tournament ? 'tournament'
    : initial === 'tournament' ? 'tournaments'
    : initial || 'home';

  draft = {
    handle: draft.handle || profile.handle || '',
    difficulty: draft.difficulty || profile.difficulty || DEFAULT_DIFFICULTY,
    seed: draft.seed || '',
    recentHandles: profile.recentHandles,
  };
  if (!isKnownDifficulty(draft.difficulty)) draft.difficulty = DEFAULT_DIFFICULTY;

  root().hidden = false;
  document.body.classList.add('start-open');
  await render();
}

export function closeStartScreen() {
  stopWatchingLobby();
  root().hidden = true;
  document.body.classList.remove('start-open');
}

export const isStartScreenOpen = () => !root().hidden;

root().addEventListener('click', onClick);
root().addEventListener('keydown', onKeydown);
