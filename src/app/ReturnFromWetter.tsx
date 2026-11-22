import { useState } from 'preact/hooks';

// Mirrored from Orbis Wetter (src/features/handoff/contract.ts). See docs/HANDOFF.md there.
const RETURN_KEY = 'orbis.wetter.returnTo';

/** Small chip after the seamless handoff, so the user can get back to the forecast. */
export function ReturnFromWetter() {
  const [href] = useState(() => {
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
