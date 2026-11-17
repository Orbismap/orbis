// Hash <-> state. Reads the URL once at start (and on hashchange), writes throttled with replaceState.
import { effect, batch } from '@preact/signals';
import { throttle } from '../core/scheduler';
import { followCurrent, followWanted } from '../ext/channels';
import { parseHash, serializeHash, type UrlState } from '../core/url';
import { activeIds, openKarte, setActiveIds, setBasemap } from '../karten/active';
import { resolveBasemapId } from '../map/basemaps';
import { activeKarte } from './session';
import { place, selectPlace } from './selection';
import { isMobile } from './ui';
import { live, setTime, time } from './time';
import { camera, projection, setCamera, setProjection } from './view';

export function applyUrlState(u: UrlState): void {
  batch(() => {
    // The link only says which layers are on; the Karte follows from them. An old link with `k=` and no layers opens that standard Karte.
    if (u.layers) setActiveIds(u.layers);
    else if (u.karte) openKarte(u.karte);
    if (u.view) setCamera({ lng: u.view.lng, lat: u.view.lat, zoom: u.view.zoom, bearing: u.view.bearing ?? 0, pitch: u.view.pitch ?? 0 });
    if (u.globe !== undefined) setProjection(u.globe ? 'globe' : 'mercator');
    // a basemap in a link is taken for this session only
    const wanted = resolveBasemapId(u.basemap);
    if (wanted) setBasemap(activeKarte.peek().id, wanted);
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
  const layers = activeIds.value;
  return {
    view: { lat: c.lat, lng: c.lng, zoom: c.zoom, bearing: c.bearing, pitch: c.pitch },
    layers: layers.length ? layers : undefined,
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
