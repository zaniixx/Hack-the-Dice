/**
 * The store the game talks to.
 *
 * One module picks the backend and everything else imports `store` from here.
 * The choice is a URL: set API_BASE in services/config.js and boards are shared
 * by every device that opens the game; leave it empty and they stay in this
 * browser, which is what happens on a checkout nobody has configured.
 *
 * Either way the methods are the same, so nothing above this line knows or
 * cares which one it got.
 */
import { localStore } from './local-store.js';
import { remoteStore } from './remote-store.js';
import { hasRemoteBoard } from './config.js';

export const store = hasRemoteBoard() ? remoteStore : localStore;

/** 'global' when scores are shared between devices, 'device' when they are not. */
export const storeScope = store.scope;

export { compareEntries } from './local-store.js';
