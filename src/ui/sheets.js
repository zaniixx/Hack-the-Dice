/**
 * Bottom sheets for the touch layout.
 *
 * On a phone there is no room for the console log and the rig beside the board,
 * and no reason for them to be there: the log is history and the rig is only
 * changed between nodes. Both slide up over the game when asked for.
 *
 * The market is not one of these. It is a popup on every layout — see
 * ui/market.js — so a phone and a desktop reach it the same way.
 *
 * On the desktop layout these do nothing — the panels are simply on screen.
 */
import { els } from './dom.js';
import { isTouchLayout } from './viewport.js';

const SHEET_CLASS = { rig: 'sheet-rig', log: 'sheet-log' };

let openSheetName = null;

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
 * Follow the run: a sheet is for between nodes, so close the rig when one
 * starts rather than leaving it over the board.
 */
export function syncSheetsToPhase(phase) {
  if (!isTouchLayout()) return;
  if (phase !== 'shop' && openSheetName === 'rig') closeSheet();
}
