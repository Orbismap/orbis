/**
 * One build, several apps. The hostname (or `?mode=wetter|bahn|find|map` for local work) decides which one boots:
 *   wetter.maltee.dev → weather dashboard      maps.maltee.dev → Orbis Map      bahn.* → Bus & Bahn      find.* → Orbis Find
 * Each app is a dynamic import, so the other apps' global CSS and stores are never loaded.
 */
const APPS = ['wetter', 'bahn', 'find'] as const;
export type AppMode = (typeof APPS)[number] | 'map';

export function appMode(): AppMode {
  const { hostname, search } = window.location;
  const forced = new URLSearchParams(search).get('mode');
  const known = APPS.find((app) => app === forced);
  if (known || forced === 'map') return known ?? 'map';
  return APPS.find((app) => hostname.startsWith(`${app}.`)) ?? 'map';
}

/** Same index.html for all apps – each brings its own title, manifest and icons. */
function shell(app: Exclude<AppMode, 'map'>, title: string, icon: { href: string; type: string; touch?: string }) {
  document.title = title;
  document.documentElement.style.background = '#0a0f18';
  const head = document.head;
  head.querySelector('link[rel="manifest"]')?.setAttribute('href', `./${app}/manifest.webmanifest`);
  head.querySelector('link[rel="icon"]')?.setAttribute('href', icon.href);
  head.querySelector('link[rel="icon"]')?.setAttribute('type', icon.type);
  if (icon.touch) head.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', icon.touch);
  head.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0a0f18');
}

// Lets each app scope its tokens and global rules; the document is shared once the map takes over.
document.documentElement.dataset.app = appMode();

if (appMode() === 'wetter') {
  shell('wetter', 'Orbis Wetter', { href: './wetter/favicon.png', type: 'image/png', touch: './wetter/icons/icon-192.png' });
  void import('./wetter/main');
} else if (appMode() === 'bahn') {
  shell('bahn', 'Orbis Bahn', { href: './bahn/favicon.svg', type: 'image/svg+xml' });
  void import('./bahn/main');
} else if (appMode() === 'find') {
  shell('find', 'Orbis Find', { href: './find/favicon.svg', type: 'image/svg+xml' });
  void import('./find/main');
} else {
  void import('./main');
}
