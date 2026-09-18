/**
 * Putting the settings on the page.
 *
 * One function, called once at boot and again every time the settings screen
 * changes something. Keeping it in one place is what stops a setting that looks
 * right in the panel from having never reached the screen.
 */
import { settings } from '../core/settings.js';
import { applyVolumes } from '../audio/synth.js';
import { applyViewportHeight, uiScale } from './viewport.js';

export function applySettings() {
  const root = document.documentElement;
  const scale = uiScale();

  /*
   * Size, by zooming the root.
   *
   * The console is laid out in pixels — six hundred-odd of them across fourteen
   * stylesheets — so there is no font-size to turn up and no root em to lean on.
   * `zoom` is the one lever that moves all of them at once and still reflows
   * afterwards, which is the part that matters: at 80% the panels genuinely get
   * more room rather than the whole console shrinking away from the edges.
   *
   * Left unset at 1 rather than written as "1", so the usual case adds no
   * stacking context and behaves exactly as it did before there was a setting.
   */
  root.style.zoom = scale === 1 ? '' : String(scale);

  /*
   * And the height has to be stated, because `height: 100%` in base.css is a
   * percentage of the viewport that then gets multiplied by the zoom — at 140%
   * the console would be nearly half a screen too tall, and at 70% it would
   * stop well short of the bottom. --app-height is the same measurement with
   * the scale already divided out of it.
   */
  root.style.height = scale === 1 ? '' : 'var(--app-height)';

  // Scanlines and screen glow, which are decoration on a good screen and a
  // legibility problem on a bad one.
  root.dataset.effects = settings.effects ? 'on' : 'off';

  // The layout measures itself in units the zoom has just changed.
  applyViewportHeight();
  applyVolumes();
}
