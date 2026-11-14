// Hash <-> state. Reads the URL once at start (and on hashchange), writes throttled with replaceState.
import { effect, batch } from '@preact/signals';
import { throttle } from '../core/scheduler';
import { followCurrent, followWanted } from '../ext/channels';
import { parseHash, serializeHash, type UrlState } from '../core/url';
import { editKarte, getKarte } from '../karten/store';
import { hasLayer } from '../layers/registry';
import { activeKarte, setActiveKarte } from './session';
import { detailOpen } from './hud';
import { inspector, place, probe, selectPlace } from './selection';
import { isMobile } from './ui';
import { live, setTime, time } from './time';
import { camera, projection, setCamera, setProjection } from './view';

export function applyUrlState(u: UrlState): void {
  batch(() => {
    if (u.karte) (setActiveKarte(u.karte), (detailOpen.value = true));
    if (u.view) setCamera({ lng: u.view.lng, lat: u.view.lat, zoom: u.view.zoom, bearing: u.view.bearing ?? 0, pitch: u.view.pitch ?? 0 });
    if (u.globe !== undefined) setProjection(u.globe ? 'globe' : 'mercator');
    if (u.layers) {
      const k = getKarte(u.karte ?? activeKarte.peek().id);
      if (k) {
        const want = new Set(u.layers.filter(hasLayer));
        const have = new Set(k.layers.filter((l) => l.visible).map((l) => l.id));
        if (want.size !== have.size || [...want].some((id) => !have.has(id))) {
          editKarte(k.id, (kk) => {
            const known = new Set(kk.layers.map((l) => l.id));
            const extra = [...want].filter((id) => !known.has(id)).map((id) => ({ id, visible: true, opacity: 1 }));
            return { ...kk, layers: [...extra, ...kk.layers.map((l) => ({ ...l, visible: want.has(l.id) }))] };
          });
        }
      }
    }
    if (u.time !== undefined) setTime(u.time);
    // a new object each time: the same object asked for again starts the follow again
    followWanted.value = u.follow ? { ...u.follow } : null;
    if (u.place && !isMobile.peek()) {
      const cur = place.peek();
      if (!cur || cur.title !== u.place.title || cur.lat !== u.place.lat || cur.lng !== u.place.lng) selectPlace({ id: `url:${u.place.title}`, title: u.place.title, subtitle: u.place.subtitle, lng: u.place.lng, lat: u.place.lat, kind: u.place.kind });
    }
  });
}

export function currentUrlState(): UrlState {
  const c = camera.value;
  const k = activeKarte.value;
  // desktop: only while the detail menu actually shows the Karte (not closed, not replaced by a place, object or point)
  const shown = isMobile.value || (detailOpen.value && !inspector.value && !probe.value && !place.value);
  return {
    view: { lat: c.lat, lng: c.lng, zoom: c.zoom, bearing: c.bearing, pitch: c.pitch },
    karte: shown ? k.id : undefined,
    layers: shown ? k.layers.filter((l) => l.visible).map((l) => l.id) : undefined,
    time: live.value ? undefined : time.value,
    globe: projection.value === 'globe',
    follow: followCurrent.value ?? undefined,
    place: place.value ? { lat: place.value.lat, lng: place.value.lng, title: place.value.title, subtitle: place.value.subtitle, kind: place.value.kind } : undefined,
  };
}

/** Applies the current hash and keeps it in sync. Returns a dispose function. */
export function startUrlSync(): () => void {
  if (typeof window === 'undefined') return () => {};
  applyUrlState(parseHash(window.location.hash));
  const write = throttle((hash: string) => {
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, 500);
  const stop = effect(() => write(serializeHash(currentUrlState())));
  const onHash = () => {
    const fresh = serializeHash(currentUrlState());
    if (window.location.hash !== fresh) applyUrlState(parseHash(window.location.hash));
  };
  window.addEventListener('hashchange', onHash);
  return () => {
    stop();
    write.cancel();
    window.removeEventListener('hashchange', onHash);
  };
}
