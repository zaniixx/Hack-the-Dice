/**
 * Bottom sheets for the touch layout.
 *
 * On a phone there is no room for the console log and the toolkit beside the
 * board, and no reason for them to be there: the log is history and the market
 * is between nodes. Both slide up over the game when asked for, and the market
 * asks for itself the moment a node is breached, because that is the only time
 * it matters.
 *
 * On the desktop layout these do nothing — the panels are simply on screen.
 */
import { els } from './dom.js';
import { isTouchLayout } from './viewport.js';

const SHEET_CLASS = { rig: 'sheet-rig', log: 'sheet-log' };

let openSheetName = null;
/** Set once per market visit, so a sheet the player closed stays closed. */
let offeredMarket = false;

export const openSheetOf = () => openSheetName;

export function closeSheet() {
  for (const className of Object.values(SHEET_CLASS)) {
    document.body.classList.remove(className);
  }
  els.sheetBackdrop.hidden = true;
  openSheetName = null;
}

export function openSheet(name) {
  if (!SHEET_CLASS[name]) return;
  closeSheet();
  document.body.classList.add(SHEET_CLASS[name]);
  els.sheetBackdrop.hidden = false;
  openSheetName = name;
}

export function toggleSheet(name) {
  if (openSheetName === name) closeSheet();
  else openSheet(name);
}

/**
 * Follow the run: offer the market on arrival, and get out of the way when the
 * player leaves it.
 */
export function syncSheetsToPhase(phase) {
  if (!isTouchLayout()) return;

  if (phase === 'shop') {
    if (!offeredMarket) {
      openSheet('rig');
      offeredMarket = true;
    }
    return;
  }

  offeredMarket = false;
  if (openSheetName === 'rig') closeSheet();
}
