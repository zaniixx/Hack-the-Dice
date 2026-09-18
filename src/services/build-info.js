/**
 * Which build this is.
 *
 * Two facts, because they answer two different questions and neither one
 * answers the other.
 *
 * The **release** is which version of the game this is meant to be. It is a
 * number a person chose, by tagging a commit `v0.4.0`, and it is the only part
 * of this that carries any meaning: it is what a player says when they say
 * which version they were playing. The game is pre-1.0 and will be for a
 * while, so it is `v0.x.y` and the minor number is the one that moves.
 *
 * The **commit** is exactly which build it is. A release tag names a moment,
 * but every push to main deploys, so most builds are some way past the last
 * tag — and a bug report against "v0.4.0" is a very different report depending
 * on whether it was the release or eleven commits after it. `+N` says how far
 * past, and the short SHA says precisely which one, which is the only thing
 * specific enough to check out and reproduce from.
 *
 * `build.json` is written by the Pages workflow at deploy time, not kept by
 * hand — a version number somebody has to remember to bump is a version number
 * that is wrong within a week, and a build date typed into the source is not a
 * build date at all. The copy committed to the repository says nothing, which
 * is exactly what a checkout served off a laptop knows about its own release.
 *
 * Read once and remembered, because it cannot change while the page is open: a
 * deploy that lands mid-session is a different page, served on the next load.
 */

/** What a checkout with no deploy behind it honestly is. */
const DEV = Object.freeze({ release: '', commits: 0, sha: '', built: '', run: '' });

/**
 * Resolved against this module rather than the page.
 *
 * The test pages live in tools/, and a bare 'build.json' from there would ask
 * for tools/build.json. This also survives the game being served from a
 * subdirectory rather than a domain root.
 */
const BUILD_URL = new URL('../../build.json', import.meta.url);

let cached = null;

/**
 * @returns {Promise<{release: string, commits: number, sha: string,
 *                    built: string, run: string}>}
 */
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

/**
 * The build as one line: `v0.4.0+11 · a1b2c3d`.
 *
 * The `+11` is dropped on a build that is exactly a release, because there the
 * tag and the commit are the same thing and saying `+0` only invites the
 * question of what it would have meant.
 *
 * A deploy from before the first tag has no release to show, so it shows the
 * commit alone rather than inventing a version nobody chose. A checkout has
 * neither and says 'dev', which is the honest name for it.
 */
export function buildLabel({ release, commits, sha } = DEV) {
  if (!release && !sha) return 'dev';
  if (!release) return sha;

  const ahead = Number(commits) > 0 ? `+${commits}` : '';
  return sha ? `${release}${ahead} · ${sha}` : `${release}${ahead}`;
}

/**
 * The same build spelled out, for the tooltip.
 *
 * The corner has room for a version and a commit and nothing else, but the
 * date is worth having within reach: "which build" and "how old is it" are
 * both first questions when something is wrong, and one of them does not fit.
 */
export function buildDetail({ release, commits, sha, built } = DEV) {
  const parts = [];

  if (release) {
    parts.push(Number(commits) > 0
      ? `${commits} commit${Number(commits) === 1 ? '' : 's'} after ${release}`
      : `release ${release}`);
  }
  if (sha) parts.push(`commit ${sha}`);

  const when = built && new Date(built);
  if (when && !Number.isNaN(when.valueOf())) {
    parts.push(`deployed ${when.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    })}`);
  }

  return parts.join(' · ');
}
