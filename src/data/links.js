/**
 * Links shown at the foot of the start screen.
 *
 * Two rows with different jobs: who made it, and where the code lives. Leave a
 * url blank and that link is simply left out, so the screen never shows a dead
 * one — which is why the two that are not filled in below cost nothing.
 *
 * This is the only file that needs editing to change any of them.
 */

/** Where to find the author. */
export const SOCIAL_LINKS = [
  {
    id: 'github',
    label: 'GITHUB',
    color: '#b6ff3d',
    url: 'https://github.com/zaniixx',
  },
  {
    id: 'linkedin',
    label: 'LINKEDIN',
    color: '#3df2ff',
    url: '', // e.g. 'https://www.linkedin.com/in/yourname'
  },
  {
    id: 'instagram',
    label: 'INSTAGRAM',
    color: '#ff3df0',
    url: '', // e.g. 'https://www.instagram.com/yourname'
  },
];

/** The repository this game is served from. */
export const REPO_URL = 'https://github.com/zaniixx/Hack-the-Dice';

/**
 * Where to send someone who has found something wrong.
 *
 * A bug report is worth more than a shrug, so it gets a button of its own. It
 * is the only thing here: a SOURCE button used to sit beside it and went to the
 * same place as the GitHub mark two inches to its left, which is one button too
 * many for a corner nobody came to look at.
 */
export const PROJECT_LINKS = [
  {
    id: 'bug',
    label: 'REPORT A BUG',
    color: '#ff4d6d',
    url: REPO_URL ? REPO_URL + '/issues/new' : '',
  },
];

/** Only the links that have somewhere to go. */
const withSomewhereToGo = links => links.filter(link => link.url.trim());

export const activeLinks = () => withSomewhereToGo(SOCIAL_LINKS);
export const activeProjectLinks = () => withSomewhereToGo(PROJECT_LINKS);
