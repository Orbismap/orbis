// A tap on a notification opens the saved connection it is about: through the address when the app starts anew
// (`?trip=<id>`), through a message from the service worker when it is open already (src/pwa/sw.js).
export function openFromNotification(open: (id: string) => void): () => void {
  const url = new URL(window.location.href);
  const started = url.searchParams.get('trip');
  if (started) {
    url.searchParams.delete('trip');
    history.replaceState(history.state, '', url);
    open(started);
  }
  const heard = (e: MessageEvent) => {
    const data = e.data as { type?: string; id?: unknown } | null;
    if (data?.type === 'open-trip' && typeof data.id === 'string') open(data.id);
  };
  navigator.serviceWorker?.addEventListener('message', heard);
  return () => navigator.serviceWorker?.removeEventListener('message', heard);
}
