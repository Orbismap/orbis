/** Registers the weather service worker – production build on the weather origin only.
 *  The map app shares this build; a service worker scoped to "/" on the map's origin would take it over. */

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (!window.location.hostname.startsWith('wetter.')) return;

  const start = () => {
    navigator.serviceWorker.register('/wetter-sw.js', { scope: '/' }).catch((error: unknown) => {
      console.warn('[pwa] Service Worker konnte nicht registriert werden:', error);
    });
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
