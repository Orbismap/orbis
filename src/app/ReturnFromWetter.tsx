import { useState } from 'preact/hooks';
import { startedWithMap } from '../map/adopt';

// Mirrored from Orbis Wetter: the key an older (separate-document) weather app wrote before navigating here.
const RETURN_KEY = 'orbis.wetter.returnTo';

/** Small chip after the handoff, so the user can get back to the forecast (a fresh load of the weather app). */
export function ReturnFromWetter() {
  const [href] = useState(() => {
    if (startedWithMap) return '/';
    try {
      const v = sessionStorage.getItem(RETURN_KEY);
      sessionStorage.removeItem(RETURN_KEY);
      return v;
    } catch {
      return null;
    }
  });
  return href ? <a class="wx-return" href={href}>← Zurück zur Wetter-App</a> : null;
}
