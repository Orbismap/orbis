/**
 * One build, two apps. The hostname (or `?mode=wetter` for local work) decides which one boots:
 *   wetter.maltee.dev → weather dashboard      maps.maltee.dev → Orbis Map
 * Each app is a dynamic import, so the other app's global CSS and stores are never loaded.
 */
export type AppMode = 'wetter' | 'map';

export function appMode(): AppMode {
  const { hostname, search } = window.location;
  const forced = new URLSearchParams(search).get('mode');
  if (forced === 'wetter' || forced === 'map') return forced;
  return hostname.startsWith('wetter.') ? 'wetter' : 'map';
}

if (appMode() === 'wetter') {
  document.title = 'Orbis Wetter';
  document.documentElement.style.background = '#0a0f18';
  void import('./wetter/main');
} else {
  void import('./main');
}
