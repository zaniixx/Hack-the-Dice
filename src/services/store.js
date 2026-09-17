/**
 * The store the game talks to.
 *
 * There is one: the shared board in services/remote-store.js. Scores and
 * tournaments are global, because a leaderboard each browser keeps its own copy
 * of is not a leaderboard — two people comparing runs would be reading two
 * different lists and neither would be wrong.
 *
 * The browser-local store still exists, but only for what genuinely belongs to
 * a device: the profile, and which tournaments this one has been let into. It
 * is not a fallback. With no board configured (see services/config.js) reads
 * return null and the screens say the board is unreachable, which is true and
 * fixable, rather than showing private numbers and calling them the board.
 */
import { remoteStore } from './remote-store.js';

export const store = remoteStore;

/** Scores and tournaments are shared between devices. */
export const storeScope = store.scope;

export { compareEntries } from './local-store.js';
