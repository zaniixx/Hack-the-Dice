/**
 * Tournaments: a fixed rule set several runners play under, and a board of
 * their results.
 *
 * A tournament *is* its join code. The whole rule set — op code, name, threat
 * level, seed and every ban — is packed into the code itself, so pasting or
 * scanning it on another device reconstructs the identical tournament without a
 * server in the middle. Because the op code travels with it, results from those
 * devices merge onto the same board when their result codes are pasted back.
 *
 * What does not travel on its own is the board. With the browser-local store,
 * scores are kept per device; see services/local-store.js.
 */
import { BOSS_ORDER, BOSSES, bossForServer } from '../data/enemies.js';
import { DICE } from '../data/dice.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { ABILITIES } from '../data/abilities.js';
import { ItemKind } from '../data/catalog.js';
import {
  difficultyOf, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY,
} from '../data/difficulty.js';
import { READABLE_ALPHABET, normaliseSeed, MAX_SEED_LENGTH } from '../core/game-random.js';
import { BitWriter, BitReader, packFlags, unpackFlags } from '../core/bits.js';

/** Which ban list guards which kind of thing. */
const BAN_LISTS = {
  boss: 'bosses',
  [ItemKind.DIE]: 'dice',
  [ItemKind.ARTIFACT]: 'artifacts',
  [ItemKind.ABILITY]: 'abilities',
};

// ---- Codes ------------------------------------------------------------------

/*
 * A tournament code is the rule set packed into bits and written in base32:
 *
 *   4   format version
 *   2   threat level, indexed into DIFFICULTY_ORDER
 *   25  the five-character op code
 *   36  one ban bit per boss, die, cyberartifact and ability, in catalog order
 *   1   seed present, then 6 bits of length and 6 bits per character
 *   ..  name and host, length-prefixed, 6 bits per character
 *
 * Packing it this way keeps a code short enough to read out loud and small
 * enough to fit in a low-density QR. Every character used is in the QR
 * alphanumeric set, which is what keeps that QR small.
 *
 * Adding entries to a catalog changes the ban layout, so codes made before the
 * change stop decoding: bump CODE_VERSION when that happens.
 */
const CODE_PREFIX = 'HTD-';
const CODE_VERSION = 1;
const ID_LENGTH = 5;

/** 38 symbols for names and seeds: 6 bits each, all QR-alphanumeric safe. */
const TEXT_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -';

const MAX_NAME = 20;
const MAX_HOST = 12;

const RESULT_PREFIX = 'HTDR1-';

/** Catalog orders the ban bits follow. */
const banOrders = () => ({
  bosses: BOSS_ORDER,
  dice: Object.keys(DICE),
  artifacts: Object.keys(ARTIFACTS),
  abilities: Object.keys(ABILITIES),
});

/** Text as the code can carry it: upper case, known symbols only. */
const codeText = (text, max) =>
  String(text || '').toUpperCase().replace(/[^A-Z0-9 -]/g, ' ').trim().slice(0, max);

/** A five-character op code: short to say, unambiguous to type. */
export const newOpCode = () => {
  let code = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    code += READABLE_ALPHABET[Math.floor(Math.random() * READABLE_ALPHABET.length)];
  }
  return code;
};

export const isOpCode = text =>
  new RegExp(`^[${READABLE_ALPHABET}]{${ID_LENGTH}}$`).test(String(text || '').trim().toUpperCase());

/** A tournament as a code. */
export function encodeTournament(tournament) {
  const writer = new BitWriter();
  writer.write(CODE_VERSION, 4);
  writer.write(Math.max(0, DIFFICULTY_ORDER.indexOf(tournament.difficulty)), 2);

  for (const ch of tournament.id.padEnd(ID_LENGTH, '0').slice(0, ID_LENGTH)) {
    writer.write(Math.max(0, READABLE_ALPHABET.indexOf(ch)), 5);
  }

  const orders = banOrders();
  for (const list of ['bosses', 'dice', 'artifacts', 'abilities']) {
    packFlags(writer, orders[list], tournament.bans[list] || []);
  }

  const seed = normaliseSeed(tournament.seed);
  writer.write(seed ? 1 : 0, 1);
  if (seed) writer.writeText(seed, TEXT_CHARSET, 6, MAX_SEED_LENGTH);

  writer.writeText(codeText(tournament.name, MAX_NAME), TEXT_CHARSET, 5, MAX_NAME);
  writer.writeText(codeText(tournament.host, MAX_HOST), TEXT_CHARSET, 4, MAX_HOST);

  return CODE_PREFIX + writer.toBase32();
}

/** A code back into a tournament, or null if it is not one. */
export function decodeTournament(code) {
  let body = String(code || '').trim().toUpperCase();

  // Accept a pasted join link as well as a bare code.
  const fromLink = body.match(/[#?&]JOIN=([^&\s]+)/);
  if (fromLink) body = fromLink[1];
  if (body.startsWith(CODE_PREFIX)) body = body.slice(CODE_PREFIX.length);
  if (!body) return null;

  try {
    const reader = BitReader.fromBase32(body);
    if (reader.read(4) !== CODE_VERSION) return null;

    const difficulty = DIFFICULTY_ORDER[reader.read(2)] || DEFAULT_DIFFICULTY;

    let id = '';
    for (let i = 0; i < ID_LENGTH; i++) id += READABLE_ALPHABET[reader.read(5)];

    const orders = banOrders();
    const bans = {
      bosses: unpackFlags(reader, orders.bosses),
      dice: unpackFlags(reader, orders.dice),
      artifacts: unpackFlags(reader, orders.artifacts),
      abilities: unpackFlags(reader, orders.abilities),
    };

    const seed = reader.read(1) ? reader.readText(TEXT_CHARSET, 6) : '';
    const name = reader.readText(TEXT_CHARSET, 5).trim();
    const host = reader.readText(TEXT_CHARSET, 4).trim();
    if (!name) return null;

    return {
      id, name, host: host || 'ANON', difficulty, seed, bans,
      created: Date.now(),
      code: CODE_PREFIX + body,
    };
  } catch {
    return null; // a mistyped or truncated code is not an error, just a no
  }
}

const encodeJSON = text =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const decodeJSON = code =>
  new TextDecoder().decode(
    Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0)));

/** One result as a code, for carrying a run back to the host's board. */
export const encodeResult = entry => RESULT_PREFIX + encodeJSON(JSON.stringify(entry));

/** A result code back into a leaderboard entry, or null. */
export function decodeResult(code) {
  const trimmed = String(code || '').trim();
  if (!trimmed.startsWith(RESULT_PREFIX)) return null;
  try {
    const entry = JSON.parse(decodeJSON(trimmed.slice(RESULT_PREFIX.length)));
    return entry && entry.id && typeof entry.score === 'number' ? entry : null;
  } catch {
    return null;
  }
}

// ---- Creating ---------------------------------------------------------------

/** Build a tournament, code and all. */
export function createTournament({ name, host, difficulty, bans, seed = '' }) {
  const tournament = {
    id: newOpCode(),
    name: codeText(name || 'UNNAMED OP', MAX_NAME) || 'UNNAMED OP',
    host: codeText(host || 'ANON', MAX_HOST) || 'ANON',
    difficulty,
    seed: normaliseSeed(seed),
    created: Date.now(),
    bans: { bosses: [], dice: [], artifacts: [], abilities: [], ...bans },
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
  if (tournament.seed) lines.push(`Fixed seed: ${tournament.seed} — everyone rolls the same dice`);
  const { bosses, dice, artifacts, abilities } = tournament.bans;

  if (bosses.length) {
    lines.push(`Bosses banned: ${bosses.map(id => BOSSES[id]?.name || id).join(', ')}`);
  }
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  const counts = [
    dice.length && plural(dice.length, 'die', 'dice'),
    artifacts.length && plural(artifacts.length, 'cyberartifact', 'cyberartifacts'),
    abilities.length && plural(abilities.length, 'ability', 'abilities'),
  ].filter(Boolean);
  lines.push(counts.length ? `Banned from the market: ${counts.join(', ')}` : 'Full black market');

  return lines;
}
