/**
 * Making a browser tab behave like a game on a phone.
 *
 * Three problems, three fixes:
 *
 *   - 100vh on a phone counts browser chrome that is not really there, so the
 *     layout uses --app-height, measured from the viewport itself.
 *   - Pinch and double-tap zoom would wreck a fixed layout mid-roll. The
 *     viewport meta asks browsers not to; iOS ignores that, so its gesture
 *     events are cancelled here as well.
 *   - Real full screen is one tap, where the browser offers it.
 */

import { settings, SCALE_MAX } from '../core/settings.js';
import { clamp } from '../core/math.js';

/** The width styles/mobile.css switches to the touch layout at. */
export const TOUCH_WIDTH = 1120;
/** The shortest the desktop console lays out in — styles/base.css #app. */
export const DESKTOP_MIN_HEIGHT = 660;

/** True when the game is in its touch layout — see styles/mobile.css. */
export const isTouchLayout = () =>
  matchMedia(`(max-width: ${TOUCH_WIDTH}px), (pointer: coarse)`).matches;

/**
 * The largest interface scale this screen can actually show.
 *
 * Scaling works by zooming the root, and media queries are evaluated against
 * the real viewport, which cannot see that zoom. So a desktop laid out for
 * three columns keeps all three however far it is scaled up, and past a point
 * it simply hangs off the side of the screen. The limit is where the layout
 * would have had to change and could not.
 *
 * The same goes for height: the desktop console will not lay out shorter than
 * #app's min-height, and scaling up is what makes the screen shorter in the
 * units that minimum is written in.
 *
 * A touch layout has no such problem: it is already the narrow one, there is no
 * further breakpoint to fall through, and it stacks to whatever height it has.
 * So a phone gets the whole range — which is the device the setting is mostly
 * for, and the one where the type is hardest to read.
 */
export function maxUiScale() {
  if (isTouchLayout()) return SCALE_MAX;
  return clamp(
    Math.min(innerWidth / TOUCH_WIDTH, innerHeight / DESKTOP_MIN_HEIGHT),
    1, SCALE_MAX,
  );
}

/**
 * The scale actually in force: what the player chose, or as much of it as this
 * screen can take. Their choice is left in storage untouched, so a phone-sized
 * setting is still there when they next open the game on a phone.
 */
export const uiScale = () => Math.min(settings.uiScale, maxUiScale());

/**
 * Set --app-height to the usable viewport, in the units the layout is using.
 *
 * visualViewport is the accurate one while a keyboard is open or the URL bar is
 * sliding away; innerHeight is the fallback.
 *
 * The division is what keeps the interface-size setting working. That setting
 * zooms the root, so a CSS pixel inside the layout is no longer a pixel on the
 * screen — handing the layout the real height at 125% would tell it to be a
 * quarter taller than the screen it is on, and the bottom of the console would
 * hang off the end of it.
 */
export function applyViewportHeight() {
  const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const scale = uiScale() || 1;
  document.documentElement.style.setProperty('--app-height', `${Math.round(height / scale)}px`);
}

/** Keep it right as the viewport changes under us. */
export function trackViewportHeight() {
  applyViewportHeight();
  addEventListener('resize', applyViewportHeight);
  // The rotation is not finished when the event fires, so measure just after.
  addEventListener('orientationchange', () => setTimeout(applyViewportHeight, 150));
  window.visualViewport?.addEventListener('resize', applyViewportHeight);
}

/** Cancel iOS pinch-zoom gestures, which ignore the viewport meta. */
export function blockZoomGestures() {
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, event => event.preventDefault(), { passive: false });
  }
}

export const canFullscreen = () =>
  !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);

/**
 * Toggle real full screen.
 *
 * iOS Safari does not offer this for a page — there, adding the game to the
 * home screen is what removes the browser chrome, which the meta tags in
 * index.html already ask for.
 */
export async function toggleFullscreen() {
  const root = document.documentElement;
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
      return false;
    }
    await (root.requestFullscreen?.({ navigationUI: 'hide' }) ?? root.webkitRequestFullscreen?.());
    return true;
  } catch {
    return !!document.fullscreenElement; // refused, usually outside a gesture
  }
}
