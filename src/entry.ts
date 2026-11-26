/**
 * One build, three apps. The hostname (or `?mode=wetter|bahn|map` for local work) decides which one boots:
 *   wetter.maltee.dev → weather dashboard      maps.maltee.dev → Orbis Map      bahn.* → Bus & Bahn
 * Each app is a dynamic import, so the other app's global CSS and stores are never loaded.
 */
export type AppMode = 'wetter' | 'bahn' | 'map';

export function appMode(): AppMode {
  const { hostname, search } = window.location;
  const forced = new URLSearchParams(search).get('mode');
  if (forced === 'wetter' || forced === 'bahn' || forced === 'map') return forced;
  if (hostname.startsWith('bahn.')) return 'bahn';
  return hostname.startsWith('wetter.') ? 'wetter' : 'map';
}

// Lets each app scope its tokens and global rules; the document is shared once the map takes over.
document.documentElement.dataset.app = appMode();

if (appMode() === 'wetter') {
  document.title = 'Orbis Wetter';
  document.documentElement.style.background = '#0a0f18';
  // Same index.html for both apps – the weather app brings its own manifest and icons.
  const head = document.head;
  head.querySelector('link[rel="manifest"]')?.setAttribute('href', './wetter/manifest.webmanifest');
  head.querySelector('link[rel="icon"]')?.setAttribute('href', './wetter/favicon.png');
  head.querySelector('link[rel="icon"]')?.setAttribute('type', 'image/png');
  head.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', './wetter/icons/icon-192.png');
  head.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0a0f18');
  void import('./wetter/main');
} else if (appMode() === 'bahn') {
  document.title = 'Orbis Bahn';
  document.documentElement.style.background = '#0a0f18';
  const head = document.head;
  head.querySelector('link[rel="manifest"]')?.setAttribute('href', './bahn/manifest.webmanifest');
  head.querySelector('link[rel="icon"]')?.setAttribute('href', './bahn/favicon.svg');
  head.querySelector('link[rel="icon"]')?.setAttribute('type', 'image/svg+xml');
  head.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0a0f18');
  void import('./bahn/main');
} else {
  void import('./main');
}
