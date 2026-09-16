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
import { fmt } from '../core/format.js';
import { DEFAULT_DIFFICULTY, isKnownDifficulty } from '../data/difficulty.js';
import { initAudio } from '../audio/synth.js';
import { sfx } from '../audio/sfx.js';
import { store } from '../services/store.js';
import {
  createTournament, decodeTournament, decodeResult, encodeResult, setActiveTournament,
} from '../game/tournament.js';
import { topScores, tournamentScores } from '../game/leaderboard.js';
import { els } from './dom.js';
import { toast } from './fx.js';
import { HOW_TO_PLAY } from './screens.js';
import { difficultyCardsHTML } from './difficulty-view.js';
import { boardHTML, difficultyTabsHTML } from './leaderboard-view.js';
import {
  hostDraft, resetHostDraft, setHostDifficulty, toggleBan,
  hostFormHTML, joinFormHTML, tournamentListHTML, tournamentDetailHTML,
} from './tournament-view.js';

const MAX_HANDLE = 12;

/** Actions and data handed in by the game when the screen is opened. */
let ctx = { saved: null, best: null, onStart: null, onResume: null };

/** What the player has picked but not yet committed. */
let draft = { handle: '', difficulty: DEFAULT_DIFFICULTY };

let view = 'home';
let boardFilter = 'all';
let openTournament = null;
let notice = '';
let joinError = '';

/** The player's most recent run, so they can hand its code to a host. */
let lastResult = null;

export function rememberResult(entry) {
  lastResult = entry;
}

const root = () => els.start;

// ---- Views ------------------------------------------------------------------

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
        ${best}
        ${notice ? `<p class="error">${notice}</p>` : ''}
      </section>

      <section class="start-card wide">
        <h3 class="sec">THREAT LEVEL</h3>
        ${difficultyCardsHTML(draft.difficulty)}
      </section>
    </div>

    <div class="start-actions">
      <button class="btn lime big" data-action="start">JACK IN</button>
      ${resume}
      <button class="btn" data-action="view:leaderboard">LEADERBOARD</button>
      <button class="btn" data-action="view:tournaments">TOURNAMENTS</button>
      <button class="btn sm" data-action="view:how">HOW TO HACK</button>
    </div>

    <p class="start-foot">Everything runs in your browser. Scores and tournaments are kept on
      this device — tournament codes carry the rules to other machines.</p>
  </div>`;
}

async function leaderboardHTML() {
  const filter = boardFilter === 'all' ? null : boardFilter;
  const entries = await topScores({ difficulty: filter, limit: 25 });

  return `<div class="start-inner">
    <div class="panel-head">
      <h2>LEADERBOARD</h2>
      <button class="btn sm" data-action="view:home">BACK</button>
    </div>
    <p class="lede">Score is nodes breached, servers owned and scrap harvested, multiplied by
      the threat level you ran.</p>
    ${difficultyTabsHTML(boardFilter)}
    ${boardHTML(entries, {
      empty: 'Nothing on this board yet. Jack in and put something on it.',
      showTier: boardFilter === 'all',
      highlight: lastResult && lastResult.id,
    })}
  </div>`;
}

async function tournamentsHTML() {
  return `<div class="start-inner">${tournamentListHTML(await store.listTournaments())}</div>`;
}

async function tournamentDetailView() {
  const board = await tournamentScores(openTournament.id);
  const mine = lastResult && lastResult.tournament === openTournament.id
    ? encodeResult(lastResult)
    : null;
  return `<div class="start-inner">
    ${tournamentDetailHTML(openTournament, board, { lastResult: mine, notice })}
  </div>`;
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
  how: async () => howHTML(),
};

async function render() {
  root().innerHTML = await VIEWS[view]();
  root().scrollTop = 0;

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
  const typed = (input ? input.value : draft.handle).trim().toUpperCase().slice(0, MAX_HANDLE);
  draft.handle = typed;
  return typed;
}

async function beginRun(tournament) {
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
  ctx.onStart({ handle, difficulty, tournament });
}

async function createFromForm() {
  const name = root().querySelector('#tournamentName').value;
  const tournament = createTournament({
    name,
    host: readHandle() || draft.handle || 'ANON',
    difficulty: hostDraft.difficulty,
    bans: hostDraft.bans,
  });

  await store.saveTournament(tournament);
  openTournament = tournament;
  await show('tournament');
  toast('TOURNAMENT CREATED');
}

async function joinFromCode() {
  const tournament = decodeTournament(root().querySelector('#joinCode').value);
  if (!tournament) {
    joinError = 'That code is not a tournament code. Codes start with HTD1-.';
    await render();
    sfx.buzz();
    return;
  }

  tournament.code = root().querySelector('#joinCode').value.trim();
  await store.saveTournament(tournament);
  joinError = '';
  openTournament = tournament;
  await show('tournament');
  toast('JOINED ' + tournament.name);
}

async function mergeResult(id) {
  const entry = decodeResult(root().querySelector('#mergeCode').value);
  if (!entry) {
    notice = 'That is not a result code. They start with HTDR1-.';
    sfx.buzz();
  } else if (entry.tournament !== id) {
    notice = 'That result was scored in a different tournament.';
    sfx.buzz();
  } else {
    const added = await store.addTournamentScore(id, entry);
    notice = added
      ? `Merged ${entry.handle}: ${fmt(entry.score)} points.`
      : `${entry.handle} was already on this board.`;
    if (added) sfx.coin();
  }
  await render();
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
      draft.handle = readHandle();
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
    case 'copy-result':
      await copyFrom('#resultCode', 'RESULT');
      break;
    case 'merge-result':
      await mergeResult(argument);
      break;
    case 'delete-tournament':
      await store.deleteTournament(argument);
      openTournament = null;
      await show('tournaments');
      toast('TOURNAMENT REMOVED');
      break;
  }
}

/** Enter starts the run from the handle field. */
function onKeydown(event) {
  if (event.key !== 'Enter') return;
  if (event.target.id === 'handleInput') {
    event.preventDefault();
    beginRun(null);
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
 * @param {string} [options.view]   which view to open on
 * @param {?object} options.saved   a resumable run, if there is one
 * @param {?object} options.best    the personal best record
 * @param {Function} options.onStart  called with { handle, difficulty, tournament }
 * @param {Function} options.onResume called with the saved run
 */
export async function openStartScreen({ view: initial = 'home', saved, best, onStart, onResume }) {
  ctx = { saved, best, onStart, onResume };
  view = initial || 'home';
  notice = '';

  const profile = await store.getProfile();
  draft = {
    handle: draft.handle || profile.handle || '',
    difficulty: draft.difficulty || profile.difficulty || DEFAULT_DIFFICULTY,
    recentHandles: profile.recentHandles,
  };
  if (!isKnownDifficulty(draft.difficulty)) draft.difficulty = DEFAULT_DIFFICULTY;

  root().hidden = false;
  document.body.classList.add('start-open');
  await render();
}

export function closeStartScreen() {
  root().hidden = true;
  document.body.classList.remove('start-open');
}

export const isStartScreenOpen = () => !root().hidden;

root().addEventListener('click', onClick);
root().addEventListener('keydown', onKeydown);
