/**
 * The lobby heartbeat.
 *
 * While a tournament run is being played it publishes itself to the store, with
 * the score it would bank if it stopped right now. That is what lets the
 * tournament board show a race in progress: everyone watching sees runners move
 * up as they breach nodes, not just their final placings.
 *
 * Only tournament runs are published — a free run is nobody else's business.
 * Entries carry a heartbeat and expire if it stops, so a closed tab does not
 * leave a runner on the board forever.
 */
import { store } from '../services/store.js';
import { run } from './state.js';
import { runScore } from './score.js';

/** Heartbeat interval: comfortably inside the store's expiry window. */
const HEARTBEAT_MS = 15000;

let liveId = null;
let liveTournament = null;
let timer = null;

/** A snapshot of the run as the lobby should show it. */
function snapshot() {
  return {
    id: liveId,
    handle: run.handle,
    tournament: run.tournament.id,
    difficulty: run.difficulty,
    seed: run.seed,
    score: runScore(run),
    server: run.server,
    node: run.node,
    nodes: run.stats.nodes,
    biggest: run.stats.biggest,
    live: true,
    at: Date.now(),
  };
}

/** Announce a tournament run. Does nothing for a free run. */
export function startLiveRun() {
  stopLiveRun();
  if (!run || !run.tournament) return;

  liveId = `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  // Remembered separately: stopping has to know which lobby to leave, and by
  // then the run may already have been replaced.
  liveTournament = run.tournament.id;
  publish();
  timer = setInterval(publish, HEARTBEAT_MS);
}

/** Push the current standing. Cheap enough to call on every node event. */
export function publish() {
  if (!liveId || !run || !run.tournament) return;
  store.setLiveRun(snapshot());
}

/** Take this run out of the lobby. */
export function stopLiveRun() {
  if (timer) clearInterval(timer);
  timer = null;
  if (liveId) store.clearLiveRun(liveId, liveTournament);
  liveId = null;
  liveTournament = null;
}

/** The id this run is publishing under, so the board can mark it as yours. */
export const liveRunId = () => liveId;
