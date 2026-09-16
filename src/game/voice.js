/**
 * The corporation talking back.
 *
 * Each server has a personality (see data/corps.js) and it comments on how the
 * run is going: a greeting on arrival, a sneer at a feeble Execute, something
 * rattled when one lands, and a parting line when it loses a node, the server,
 * or finally traces you.
 *
 * Lines are drawn with the cosmetic random, never the seeded stream — flavour
 * must never move the dice. They are also rationed: repeats are avoided, and
 * in-fight remarks only land some of the time, because a corp that comments on
 * every roll stops being funny by node two.
 */
import { pick } from '../core/random.js';
import { corpFor, corpName } from '../data/corps.js';
import { log } from '../ui/log.js';
import { run } from './state.js';

/** How often an in-fight remark actually gets said. */
const BANTER_CHANCE = 0.55;

/** The last line used for each event, so the same one never lands twice running. */
const lastSaid = {};

/**
 * Say something, if there is something to say.
 *
 * @param {string} event  greet | weak | hurt | breach | owned | traced
 * @param {object} options
 * @param {number} [options.server]  which server is speaking
 * @param {boolean} [options.always] say it even if banter would be skipped
 * @returns {?string} the line, or null when nothing was said
 */
export function corpSays(event, { server = run && run.server, always = true } = {}) {
  if (!server) return null;
  if (!always && Math.random() > BANTER_CHANCE) return null;

  const lines = corpFor(server).voice[event];
  if (!lines || !lines.length) return null;

  const fresh = lines.length > 1 ? lines.filter(line => line !== lastSaid[event]) : lines;
  const line = pick(fresh);
  lastSaid[event] = line;

  log(`> ${corpName(server)}: ${line}`, 'corp');
  return line;
}

/** A line without saying it, for screens that want to print it themselves. */
export function corpLine(event, server) {
  const lines = corpFor(server).voice[event];
  return lines && lines.length ? pick(lines) : '';
}
