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

/** True when the game is in its touch layout — see styles/mobile.css. */
export const isTouchLayout = () =>
  matchMedia('(max-width: 1120px), (pointer: coarse)').matches;

/**
 * Keep --app-height equal to the usable viewport.
 *
 * visualViewport is the accurate one while a keyboard is open or the URL bar is
 * sliding away; innerHeight is the fallback.
 */
export function trackViewportHeight() {
  const apply = () => {
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`);
  };

  apply();
  addEventListener('resize', apply);
  // The rotation is not finished when the event fires, so measure just after.
  addEventListener('orientationchange', () => setTimeout(apply, 150));
  window.visualViewport?.addEventListener('resize', apply);
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
