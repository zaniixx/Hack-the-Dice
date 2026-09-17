/**
 * The black market, as a popup over the game.
 *
 * The market used to live in the toolkit column, permanently on screen and
 * greyed out for most of a run. It is not a permanent thing — it is somewhere
 * the player goes between nodes — so it opens over the board when it matters
 * and gets out of the way when it does not.
 *
 * It opens itself on arrival, once per visit: a player who closes it to look at
 * their rig is not reopened on top of. MARKET in the toolkit brings it back,
 * and it can be opened mid-node to plan a purchase, where the cards render
 * disabled because there is nothing to spend yet.
 */
import { els } from './dom.js';

let open = false;
/** Set once per market visit, so a market the player closed stays closed. */
let offeredThisVisit = false;

export const isMarketOpen = () => open;

export function openMarket() {
  open = true;
  els.market.hidden = false;
}

export function closeMarket() {
  open = false;
  els.market.hidden = true;
}

export function toggleMarket() {
  if (open) closeMarket();
  else openMarket();
}

/**
 * Follow the run: offer the market on arrival, and close it on the way out.
 *
 * Called from the HUD's repaint, so the market cannot be left open over a node
 * that has already started.
 */
export function syncMarketToPhase(phase) {
  if (phase === 'shop') {
    if (!offeredThisVisit) {
      openMarket();
      offeredThisVisit = true;
    }
    return;
  }

  offeredThisVisit = false;
  if (open) closeMarket();
}
