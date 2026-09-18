/**
 * Which build this is.
 *
 * `build.json` is written by the Pages workflow at deploy time, not kept by
 * hand — a version number somebody has to remember to bump is a version number
 * that is wrong within a week, and a build date typed into the source is not a
 * build date at all. The copy committed to the repository says "dev", which is
 * exactly what a checkout served off a laptop is.
 *
 * Read once and remembered, because it cannot change while the page is open:
 * a deploy that lands mid-session is a different page, served on the next load.
 */

/** What a checkout with no deploy behind it honestly is. */
const DEV = Object.freeze({ version: 'dev', sha: '', built: '', run: '' });

/**
 * Resolved against this module rather than the page.
 *
 * The test pages live in tools/, and a bare 'build.json' from there would ask
 * for tools/build.json. This also survives the game being served from a
 * subdirectory rather than a domain root.
 */
const BUILD_URL = new URL('../../build.json', import.meta.url);

let cached = null;

/** @returns {Promise<{version: string, sha: string, built: string, run: string}>} */
export async function buildInfo() {
  if (cached) return cached;

  try {
    // no-store: the whole point of this file is to say what was deployed last,
    // and a cached copy of it would say what was deployed before that.
    const response = await fetch(BUILD_URL, { cache: 'no-store' });
    const data = response.ok ? await response.json() : null;
    cached = data && typeof data === 'object' ? { ...DEV, ...data } : DEV;
  } catch {
    cached = DEV; // no file, no network, no JSON: all the same answer
  }
  return cached;
}

/** The build as one line, or '' when there is nothing worth showing. */
export function buildLabel({ version, built } = DEV) {
  if (!version) return '';

  const when = built && new Date(built);
  const dated = when && !Number.isNaN(when.valueOf())
    ? when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '';

  return dated ? `${version} · ${dated}` : version;
}
