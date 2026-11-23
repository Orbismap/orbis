// Hash <-> state. Reads the URL once at start (and on hashchange), writes throttled with replaceState.
import { effect, batch } from '@preact/signals';
import { throttle } from '../core/scheduler';
import { followCurrent, followWanted } from '../ext/channels';
import { parseHash, serializeHash, type UrlState } from '../core/url';
import { activeIds, clearBasemap, openKarte, setActiveIds, setActiveKarte, setBasemap } from '../karten/active';
import { importKarte } from '../karten/store';
import { modeForBasemap, resolveBasemapId } from '../map/basemaps';
import { activeKarte, browsedKarte } from './session';
import { detailOpen, orteView } from './hud';
import { place, selectPlace } from './selection';
import { coordStop, routeMode, routeVisible, routeView, stops } from './routes';
import { isMobile, leftPanelOpen } from './ui';
import { live, setTime, time } from './time';
import { camera, karteMode, projection, setCamera, setProjection } from './view';

/** A link with a route: puts it in the planner and opens the route menu (once; the same route again does nothing). */
function openRouteFromUrl(r: NonNullable<UrlState['route']>): void {
  const cur = stops.peek();
  const same = routeMode.peek() === r.mode && cur.length === r.stops.length && cur.every((x, i) => x && Math.abs(x.lat - r.stops[i]!.lat) < 1e-5 && Math.abs(x.lng - r.stops[i]!.lng) < 1e-5);
  if (same) return;
  routeMode.value = r.mode;
  stops.value = r.stops.map((x) => ({ ...coordStop(x.lng, x.lat), ...(x.title ? { title: x.title } : {}) }));
  orteView.value = 'routes';
  routeView.value = 'plan';
}

export function applyUrlState(u: UrlState): void {
  batch(() => {
    // A link can carry the Karte and the layers together: open the Karte, then apply the link's
    // layers on top of it (so both survive the next serialize instead of `k=` being dropped).
    if (u.shared && u.layers) setActiveKarte(importKarte({ ...u.shared, layers: u.layers }));
    else if (u.karte) {
      openKarte(u.karte);
      detailOpen.value = true; // the detail menu belongs to the Karte named in the link
      if (u.layers) setActiveIds(u.layers);
    } else if (u.layers) setActiveIds(u.layers);
    if (u.view) setCamera({ lng: u.view.lng, lat: u.view.lat, zoom: u.view.zoom, bearing: u.view.bearing ?? 0, pitch: u.view.pitch ?? 0 });
    if (u.globe !== undefined) setProjection(u.globe ? 'globe' : 'mercator');
    if (u.sidebar !== undefined) leftPanelOpen.value = u.sidebar;
    // The link carries the basemap on show. Pin it for this session only when it differs from the
    // Karte's own default; otherwise the default keeps following the active layers after a reload.
    const wanted = u.shared ? undefined : resolveBasemapId(u.basemap);
    if (wanted) {
      clearBasemap(); // what the Karte itself shows is the baseline for the link
      if (wanted !== activeKarte.peek().basemap) setBasemap(activeKarte.peek().id, wanted);
    }
    // The mode is not in the URL: derive it from the basemap, so a reload lands in the right category.
    const mode = modeForBasemap(activeKarte.peek().basemap);
    if (mode !== 'luftbild') karteMode.value = mode;
    if (u.time !== undefined) setTime(u.time);
    // a new object each time: the same object asked for again starts the follow again
    followWanted.value = u.follow ? { ...u.follow } : null;
    if (u.route && !isMobile.peek()) openRouteFromUrl(u.route);
    if (u.place && !isMobile.peek()) {
      const cur = place.peek();
      if (!cur || cur.title !== u.place.title || cur.lat !== u.place.lat || cur.lng !== u.place.lng) selectPlace({ id: `url:${u.place.title}`, title: u.place.title, subtitle: u.place.subtitle, lng: u.place.lng, lat: u.place.lat, kind: u.place.kind });
    }
  });
}

/** The route being looked at (route menu or one of its camera cards open, every stop set). */
function routeInUrl(): UrlState['route'] {
  const list = stops.value;
  if (!routeVisible.value || list.length < 2 || !list.every((x) => x)) return undefined;
  return { mode: routeMode.value, stops: list.map((x) => ({ lat: x!.lat, lng: x!.lng, title: x!.title })) };
}

export function currentUrlState(): UrlState {
  const c = camera.value;
  const layers = activeIds.value;
  return {
    view: { lat: c.lat, lng: c.lng, zoom: c.zoom, bearing: c.bearing, pitch: c.pitch },
    // While the Karte's detail menu is open, that Karte is part of the visible state.
    karte: detailOpen.value ? browsedKarte.value.id : undefined,
    layers: layers.length ? layers : undefined,
    basemap: activeKarte.value.basemap,
    time: live.value ? undefined : time.value,
    globe: projection.value === 'globe',
    sidebar: leftPanelOpen.value ? undefined : false,
    follow: followCurrent.value ?? undefined,
    route: routeInUrl(),
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
