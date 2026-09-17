/**
 * Put the real game's page into a test page.
 *
 * The suites boot the actual game rather than a stand-in, so they need what
 * index.html puts on the screen: its stylesheets, and the console markup the
 * modules expect to find. This fetches that file and takes both out of it.
 *
 * It parses the document rather than slicing the text, and that is the whole
 * point of it existing. Each suite used to do its own
 * `page.split('<body>')[1].split('<script')[0]`, which worked until index.html
 * grew a boot screen with an inline script behind it — at which point the split
 * returned the boot screen on its own, every suite mounted an empty console,
 * and they reported no checks at all rather than failing at anything. Reading
 * the markup as markup cannot go wrong that quietly, and the guards at the end
 * turn whatever is left into a loud error instead of a strange one.
 */

/**
 * @param {{position?: 'beforeend'|'afterbegin'}} options where the markup goes
 * @returns {Promise<{stylesheets: number, elements: number}>}
 */
export async function mountRealPage({ position = 'beforeend' } = {}) {
  const page = await (await fetch('../index.html')).text();
  const parsed = new DOMParser().parseFromString(page, 'text/html');

  /*
   * The game's own stylesheets, however index.html is loading them today. It
   * defers them behind the boot screen and keeps a plain copy inside
   * <noscript>, so each one is in the file twice; the fonts come from a CDN and
   * are not this suite's business. Fresh <link> elements are made rather than
   * imported, because the originals carry the media="print" that keeps them off
   * the screen until the boot screen says otherwise.
   */
  const hrefs = [...new Set(
    [...parsed.querySelectorAll('link[rel="stylesheet"]')]
      .map(link => link.getAttribute('href'))
      .filter(href => href && href.startsWith('src/')),
  )];
  document.head.insertAdjacentHTML('beforeend',
    hrefs.map(href => `<link rel="stylesheet" href="../${href}">`).join(''));

  // The markup, without the boot screen or any script: a suite boots the game
  // itself, and the boot screen would sit on top of everything being checked.
  const nodes = [...parsed.body.children]
    .filter(node => node.id !== 'boot' && node.tagName !== 'SCRIPT' && node.tagName !== 'NOSCRIPT')
    .map(node => document.importNode(node, true));

  if (position === 'afterbegin') {
    for (const node of [...nodes].reverse()) document.body.insertBefore(node, document.body.firstChild);
  } else {
    for (const node of nodes) document.body.appendChild(node);
  }

  if (!hrefs.length) throw new Error('mountRealPage: index.html has no game stylesheets');
  if (!document.getElementById('app') || !document.getElementById('start')) {
    throw new Error('mountRealPage: the console did not mount — no #app or #start');
  }

  return { stylesheets: hrefs.length, elements: nodes.length };
}
