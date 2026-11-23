import { useState } from 'preact/hooks';
import { returnTo, startedWithMap } from '../map/adopt';

// Mirrored from Orbis Wetter: the key an older (separate-document) weather app wrote before navigating here.
const RETURN_KEY = 'orbis.wetter.returnTo';

function legacyReturn(): string | null {
  try {
    const v = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return v;
  } catch {
    return null;
  }
}

/**
 * "Zurück zur Wetter-App": a small pill under the legend scale (rendered by `Legend` as its footer).
 * It loads the weather page again – the map app is initialised once per page and cannot be torn down yet.
 */
export function ReturnFromWetter() {
  // read when it mounts: the map app learns about its origin while it boots, after this module was loaded
  const [href] = useState(() => (startedWithMap ? returnTo : legacyReturn()));
  if (!href) return null;
  return (
    <a class="wx-return" href={href} onClick={(e) => { e.preventDefault(); window.location.assign(href); }}>
      <span aria-hidden="true">←</span> Zurück zur Wetter-App
    </a>
  );
}
