/**
 * The author's links, shown on the start screen.
 *
 * Fill in the three URLs below and the row appears; leave one blank and that
 * link is simply left out, so the screen never shows a dead link. This is the
 * only file that needs editing.
 */
export const SOCIAL_LINKS = [
  {
    id: 'github',
    label: 'GITHUB',
    color: '#b6ff3d',
    url: '', // e.g. 'https://github.com/yourname'
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

/** Only the links that have somewhere to go. */
export const activeLinks = () => SOCIAL_LINKS.filter(link => link.url.trim());
