/** Registers the offline service worker of one of the small apps – production build on the app's own origin only.
 *  All apps share one build; a service worker scoped to "/" on the map's origin would take it over. */

export function registerServiceWorker(app: 'wetter' | 'bahn' | 'find'): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (!window.location.hostname.startsWith(`${app}.`)) return;

  const start = () => {
    navigator.serviceWorker.register(`/${app}-sw.js`, { scope: '/' }).catch((error: unknown) => {
      console.warn('[pwa] Service Worker konnte nicht registriert werden:', error);
    });
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
