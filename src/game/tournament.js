/**
 * Tournaments: a fixed rule set several runners play under, and a board of
 * their results.
 *
 * A tournament *is* its join code. The whole rule set — id, name, threat level
 * and every ban — is encoded into the code itself, so pasting it on another
 * device reconstructs the identical tournament without a server in the middle.
 * Because the id travels with it, results from those devices merge onto the
 * same board when their result codes are pasted back.
 *
 * What does not travel on its own is the board. With the browser-local store,
 * scores are kept per device; see services/local-store.js.
 */
import { BOSS_ORDER, BOSSES, bossForServer } from '../data/enemies.js';
import { ItemKind } from '../data/catalog.js';
import { difficultyOf, isKnownDifficulty, DEFAULT_DIFFICULTY } from '../data/difficulty.js';

const TOURNAMENT_PREFIX = 'HTD1-';
const RESULT_PREFIX = 'HTDR1-';

/** Which ban list guards which kind of thing. */
const BAN_LISTS = {
  boss: 'bosses',
  [ItemKind.DIE]: 'dice',
  [ItemKind.ARTIFACT]: 'artifacts',
  [ItemKind.ABILITY]: 'abilities',
};

const EMPTY_BANS = { bosses: [], dice: [], artifacts: [], abilities: [] };

// ---- Codes ------------------------------------------------------------------

const encodeText = text =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const decodeText = code =>
  new TextDecoder().decode(
    Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0)));

/** Short ids: unique enough for a code, short enough to read out loud. */
const newId = () => Math.random().toString(36).slice(2, 8).toUpperCase();

/** A tournament as a code. Keys are one letter to keep the code short. */
export function encodeTournament(tournament) {
  const payload = {
    i: tournament.id,
    n: tournament.name,
    h: tournament.host,
    d: tournament.difficulty,
    c: tournament.created,
    b: [
      tournament.bans.bosses,
      tournament.bans.dice,
      tournament.bans.artifacts,
      tournament.bans.abilities,
    ],
  };
  return TOURNAMENT_PREFIX + encodeText(JSON.stringify(payload));
}

/** A code back into a tournament, or null if it is not one. */
export function decodeTournament(code) {
  const trimmed = (code || '').trim();
  if (!trimmed.startsWith(TOURNAMENT_PREFIX)) return null;

  try {
    const data = JSON.parse(decodeText(trimmed.slice(TOURNAMENT_PREFIX.length)));
    const [bosses = [], dice = [], artifacts = [], abilities = []] = data.b || [];
    if (!data.i || !data.n) return null;

    return {
      id: data.i,
      name: data.n,
      host: data.h || 'ANON',
      difficulty: isKnownDifficulty(data.d) ? data.d : DEFAULT_DIFFICULTY,
      created: data.c || Date.now(),
      bans: { bosses, dice, artifacts, abilities },
    };
  } catch {
    return null; // a mistyped or truncated code is not an error, just a no
  }
}

/** One result as a code, for carrying a run back to the host's board. */
export const encodeResult = entry => RESULT_PREFIX + encodeText(JSON.stringify(entry));

/** A result code back into a leaderboard entry, or null. */
export function decodeResult(code) {
  const trimmed = (code || '').trim();
  if (!trimmed.startsWith(RESULT_PREFIX)) return null;
  try {
    const entry = JSON.parse(decodeText(trimmed.slice(RESULT_PREFIX.length)));
    return entry && entry.id && typeof entry.score === 'number' ? entry : null;
  } catch {
    return null;
  }
}

// ---- Creating ---------------------------------------------------------------

/** Build a tournament, code and all. */
export function createTournament({ name, host, difficulty, bans }) {
  const tournament = {
    id: newId(),
    name: (name || 'UNNAMED OP').trim().slice(0, 28).toUpperCase(),
    host: (host || 'ANON').trim().slice(0, 12).toUpperCase(),
    difficulty,
    created: Date.now(),
    bans: { ...EMPTY_BANS, ...bans },
  };
  tournament.code = encodeTournament(tournament);
  return tournament;
}

// ---- The active tournament --------------------------------------------------

/** The tournament the next run will be played under, or null for a free run. */
export let activeTournament = null;

export function setActiveTournament(tournament) {
  activeTournament = tournament;
}

export function clearActiveTournament() {
  activeTournament = null;
}

/**
 * Is this die/artifact/ability/boss available in the current run?
 *
 * Free runs allow everything; inside a tournament the host's bans apply.
 */
export function isAllowed(kind, id) {
  if (!activeTournament) return true;
  const banned = activeTournament.bans[BAN_LISTS[kind]] || [];
  return !banned.includes(id);
}

/**
 * The boss guarding node 5 of `server`.
 *
 * Bosses normally cycle in a fixed order. If the host banned the scheduled one,
 * the cycle rolls on to the next one that is allowed; if they banned all three,
 * node 5 has no protocol at all — just a very large firewall.
 */
export function bossForNode(server) {
  const scheduled = bossForServer(server);
  if (isAllowed('boss', scheduled)) return scheduled;

  const start = BOSS_ORDER.indexOf(scheduled);
  for (let step = 1; step < BOSS_ORDER.length; step++) {
    const candidate = BOSS_ORDER[(start + step) % BOSS_ORDER.length];
    if (isAllowed('boss', candidate)) return candidate;
  }
  return null;
}

/** Human-readable rule lines, for the tournament screens. */
export function tournamentRules(tournament) {
  const lines = [difficultyOf(tournament.difficulty).name];
  const { bosses, dice, artifacts, abilities } = tournament.bans;

  if (bosses.length) {
    lines.push(`Bosses banned: ${bosses.map(id => BOSSES[id]?.name || id).join(', ')}`);
  }
  const counts = [
    dice.length && `${dice.length} dice`,
    artifacts.length && `${artifacts.length} cyberartifacts`,
    abilities.length && `${abilities.length} abilities`,
  ].filter(Boolean);
  lines.push(counts.length ? `Banned from the market: ${counts.join(', ')}` : 'Full black market');

  return lines;
}
