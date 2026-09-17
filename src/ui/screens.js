/**
 * Full-screen dialogs shown over a run: the menu, and the two screens that end
 * a server or a run. The start screen is bigger and lives in start-screen.js.
 *
 * Screens are presentation only. They take the numbers they display and the
 * actions their buttons should run, so they never reach into game state.
 */
import { fmt, fmtM } from '../core/format.js';
import { corpName } from '../data/corps.js';
import { difficultyOf } from '../data/difficulty.js';
import { serverScale } from '../data/enemies.js';
import { MAX_TIER } from '../data/rules.js';
import { showModal } from './modal.js';

/** The rules, shown in the menu and on the start screen. */
export const HOW_TO_PLAY = `<div class="how">
  <div><b>ROLL</b>Throw your dice pool onto the board. Space works too.</div>
  <div><b>LOCK</b>Click dice you want to keep, then <b>REROLL</b> the rest.</div>
  <div><b>ABILITIES</b>Keys 1–3 bend the dice before you commit. Each has limited charges per node.</div>
  <div><b>EXECUTE</b>Bits × Mult hits the firewall. Run out of executes and the trace finds you.</div>
  <div><b>MARKET</b>Spend data scrap between nodes on dice, abilities and cyberartifacts. Unused executes pay a bonus.</div>
  <div><b>ORDER</b>Cyberartifacts pay out left to right, each one finishing before the next starts. Drag them: +Mult belongs to the left of ×Mult, or it never gets multiplied.</div>
  <div><b>MIGRATE</b>Node 5 is a boss protocol. Beat it to move to a harder server and unlock better gear.</div>
  <div><b>SCORE</b>Nodes breached, servers owned and scrap harvested, multiplied by your threat level.</div>
</div>`;

export function showMenuScreen({ busy, canRestart, onRestart, onTutorial }) {
  const buttons = [{ text: 'CLOSE', cls: 'cyan' }];
  if (onTutorial && !busy) buttons.push({ text: 'REPLAY TUTORIAL', fn: onTutorial });
  if (canRestart) {
    buttons.push({ text: 'ABANDON RUN — BANKS SCORE', cls: 'mag', fn: onRestart });
  }

  const waitNote = busy
    ? '<p class="dim">Wait for the current action to finish to leave the run.</p>'
    : '';
  showModal(`<div class="mtitle">HOW TO HACK</div>${HOW_TO_PLAY}${waitNote}`, buttons);
}

/** Shown after a boss falls, while the run moves up to the next server. */
export function showMigrationScreen({ fromCorp, partingShot = '', server, onContinue }) {
  const extraArtifact = server >= 2 ? ', plus one more artifact offered per visit' : '';
  showModal(`<div class="mtitle glitch" data-text="NETWORK OWNED">NETWORK OWNED</div>
    ${partingShot ? `<p class="said">“${partingShot}”<span>— ${fromCorp}</span></p>` : ''}
    <p>${fromCorp} is yours. Migrating payload to <b>${corpName(server)}</b>, security tier ${server}.</p>
    <div class="xfer"><i></i></div>
    <div class="kv">Kept: <b>dice pool, abilities, cyberartifacts, data scrap</b></div>
    <div class="kv">Firewalls: <b>${fmtM(serverScale(server) / serverScale(server - 1))}× stronger</b></div>
    <div class="kv">Black market: <b>tier ${Math.min(MAX_TIER, server)} gear${extraArtifact}</b></div>`,
    [{ text: 'OPEN BLACK MARKET', cls: 'lime', fn: onContinue }]);
}

/** Where a banked score placed, as a line of text. */
function placeLine(rank, label) {
  if (!rank) return '';
  const medal = rank === 1 ? 'TOP OF THE BOARD' : `#${rank}`;
  return `<div class="kv">${label}: <b>${medal}</b></div>`;
}

/**
 * The run is over — traced, or walked away from. Shows the banked score and
 * where it landed.
 */
export function showRunOverScreen({
  server, node, stats, isBest, entry, rank, tournamentRank, tournament,
  partingShot = '', onRestart, onLeaderboard,
}) {
  const tier = difficultyOf(entry.difficulty);
  const tournamentLine = tournament
    ? `<div class="kv">Tournament: <b>${tournament.name}</b></div>`
    : '';

  showModal(`<div class="mtitle glitch" data-text="TRACED">TRACED</div>
    <p>Corporate security locked onto <b>${entry.handle}</b> at <b>${corpName(server)}</b>, node ${node}.</p>
    ${partingShot ? `<p class="said">“${partingShot}”<span>— ${corpName(server)}</span></p>` : ''}
    <div class="score-slab" style="--tier:${tier.color}">
      <span class="score-label">FINAL SCORE</span>
      <span class="score-value">${fmt(entry.score)}</span>
      <span class="score-tier">${tier.name}</span>
    </div>
    ${placeLine(rank, 'Threat level board')}
    ${placeLine(tournamentRank, 'Tournament board')}
    ${tournamentLine}
    <div class="kv">Nodes breached: <b>${stats.nodes}</b></div>
    <div class="kv">Biggest hack: <b>${fmt(stats.biggest)}</b></div>
    <div class="kv">Data scrap harvested: <b>${fmt(stats.scrap)}</b></div>
    ${isBest ? '<p class="newbest">New personal best</p>' : ''}`,
    [
      { text: 'VIEW BOARD', cls: 'lime', fn: onLeaderboard },
      { text: 'LOCK IN AGAIN', cls: 'cyan', fn: onRestart },
    ]);
}

/** Kept for the name the rest of the game calls it by. */
export { showRunOverScreen as showTracedScreen };
