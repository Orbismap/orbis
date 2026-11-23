import { returnTo } from '../map/adopt';

/**
 * "Zurück zur Wetter-App": a small pill under the zoom scale bar, shown when the map app was started from the weather
 * app. It loads the weather page again – the map app is initialised once per page and cannot be torn down yet.
 */
export function ReturnFromWetter() {
  const href = returnTo ?? '/';
  return (
    <a class="wx-return" href={href} onClick={(e) => { e.preventDefault(); window.location.assign(href); }}>
      <span aria-hidden="true">←</span> Zurück zur Wetter-App
    </a>
  );
}
