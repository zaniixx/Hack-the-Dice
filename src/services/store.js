/**
 * The store the game talks to.
 *
 * One module picks the backend, and everything else imports `store` from here.
 * Today there is only the browser-local one; a networked backend would be added
 * by implementing the same async methods and choosing it below.
 */
import { localStore } from './local-store.js';

export const store = localStore;

export { compareEntries } from './local-store.js';
