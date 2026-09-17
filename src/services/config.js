/**
 * Where the shared board lives.
 *
 * This is the Worker deployed from worker/ — `npx wrangler deploy` prints the
 * URL, and worker/README.md walks through it. Scores, tournaments and the
 * tournament lobby all go through it, so every device that opens the game is
 * looking at the same board.
 *
 * Empty it and the game has no board at all: every read reports the board as
 * unreachable and the screens say so. There is no browser-local fallback, on
 * purpose — see services/store.js for why.
 */
const CONFIGURED = 'https://hack-the-dice-api.abdulla-mmiv.workers.dev';

/**
 * A board URL can also be set at runtime, which beats the line above.
 *
 *   localStorage.setItem('htd_api_base', 'http://localhost:8787')
 *
 * That is how to point a checkout at a Worker running under `wrangler dev`
 * without editing this file, and how the test pages stand up a board of their
 * own. Clear the key to go back to whatever is configured here.
 */
const RUNTIME_KEY = 'htd_api_base';

function runtimeBase() {
  try {
    return localStorage.getItem(RUNTIME_KEY) || '';
  } catch {
    return ''; // a browser refusing storage simply has no override
  }
}

export const API_BASE = runtimeBase() || CONFIGURED;

/**
 * How long to wait on the board before giving up and using the local one.
 *
 * A run has just ended and the player is looking at their score: a board that
 * takes longer than this to answer is worse than a board that says "offline".
 */
export const API_TIMEOUT_MS = 6000;

/** True when a shared board is configured at all. */
export const hasRemoteBoard = () => !!API_BASE;
