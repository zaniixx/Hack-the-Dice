/**
 * Where the shared board lives.
 *
 * Empty means there is no shared board: the game keeps every score and
 * tournament in this browser, exactly as it always did, and nothing is sent
 * anywhere. Fill it in and the same game becomes a board every device can see.
 *
 * Set it to the Worker deployed from worker/ — `npx wrangler deploy` prints the
 * URL, and worker/README.md walks through it:
 *
 *   export const API_BASE = 'https://hack-the-dice-api.your-name.workers.dev';
 *
 * A URL here is the only thing that has to change. Everything else — which
 * store the game uses, what the boards say about themselves, what happens when
 * the network is down — follows from whether this is set.
 */
export const API_BASE = '';

/**
 * How long to wait on the board before giving up and using the local one.
 *
 * A run has just ended and the player is looking at their score: a board that
 * takes longer than this to answer is worse than a board that says "offline".
 */
export const API_TIMEOUT_MS = 6000;

/** True when a shared board is configured at all. */
export const hasRemoteBoard = () => !!API_BASE;
