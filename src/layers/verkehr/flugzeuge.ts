// Aircraft. Below zoom 5 the worldwide overview (OpenSky `states/all`, one central fetch every 90 s uploaded to the bucket
// orbis-live as aircraft/opensky-states.json, read every 75 s, plus the military list of adsb.lol); from zoom 5 the
// detailed regional view (readsb circles from adsb.lol, every 10 s). Positions are dead-reckoned between polls by
// trackLayer. Selecting an aircraft loads route (adsbdb), aircraft record (adsbdb) and a photo
// (planespotters.net) and draws the dashed great-circle line origin -> aircraft -> destination.
//
// NOTE: adsb.lol, adsbdb and planespotters send no CORS headers; requests go through the Orbismap proxy (data/endpoints `proxied`).
// OpenSky blocks Cloudflare and sends no CORS, so visitors never call it: the snapshot comes from the bucket. When it is
// missing or older than 10 min, the overview is approximated with circle requests around hubs (adsb.lol) and the status says so.
import { computed, effect, signal } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { formatNumber, NNBSP } from '../../core/format';
import { MINUTE } from '../../core/time';
import { bucketUrl, proxied } from '../../data/endpoints';
import { fetchJson } from '../../data/http';
import { acquireDetail, circleFeed, OVERVIEW_HUBS, DETAIL_LOAD_ZOOM, DETAIL_SHOW_ZOOM, liveSeen, mergeOverview, preferFirst, rememberLive } from '../../data/parsers/adsbview';
import { snapshotStale } from '../../data/parsers/opensky';
import { parseAircraftRecord, parsePhoto, parseRoute, routeFeatures, type AircraftPhoto, type AircraftRecord, type FlightRoute } from '../../data/parsers/flightinfo';
import type { AircraftProps } from '../../data/parsers/readsb';
import { AIRCRAFT_COLOR, AIRCRAFT_EMERGENCY, AIRCRAFT_MILITARY, aircraftColor, altitudeText, rateText, speedText } from '../../data/parsers/traffic';
import { tracksChannel } from '../../ext/channels';
import type { TrackSample } from '../../ext/types';
import { extrapolate, trackLayer, type TrackObject } from '../../render/tracks';
import { defineLayer } from '../define';
import type { InspectCard, LayerContext } from '../types';

const COLOR = AIRCRAFT_COLOR;
const EMERGENCY = AIRCRAFT_EMERGENCY;
const MILITARY = AIRCRAFT_MILITARY;

const SQUAWK: Record<string, string> = { '7500': 'Flugzeugentführung', '7600': 'Funkausfall', '7700': 'Notfall' };
const CATEGORY: Record<string, string> = {
  A1: 'Leichtflugzeug', A2: 'Kleinflugzeug', A3: 'Mittelgroß', A4: 'Groß (Wirbelschleppe)', A5: 'Schwer', A6: 'Hochleistung', A7: 'Hubschrauber',
  B1: 'Segelflugzeug', B2: 'Ballon / Luftschiff', B4: 'Ultraleicht', B6: 'Drohne', B7: 'Raumfahrzeug', C1: 'Rettungsfahrzeug', C2: 'Servicefahrzeug',
};

const color = ['case', ['get', 'emerg'], EMERGENCY, ['get', 'mil'], MILITARY, COLOR] as unknown as ExpressionSpecification;
const size = ['interpolate', ['linear'], ['zoom'],
  3, ['case', ['get', 'emerg'], 0.42, ['get', 'heli'], 0.26, 0.3],
  8, ['case', ['get', 'emerg'], 0.6, ['get', 'heli'], 0.36, 0.45],
  12, ['case', ['get', 'emerg'], 0.9, ['get', 'heli'], 0.55, 0.7],
] as unknown as ExpressionSpecification;
// the overview carries thousands of aircraft: small planes
const worldSize = ['interpolate', ['linear'], ['zoom'],
  0, ['case', ['get', 'emerg'], 0.3, ['get', 'mil'], 0.22, 0.14],
  4, ['case', ['get', 'emerg'], 0.4, ['get', 'mil'], 0.3, 0.22],
  5, ['case', ['get', 'emerg'], 0.42, ['get', 'mil'], 0.32, 0.3],
] as unknown as ExpressionSpecification;

/** Route, aircraft record and photo of one aircraft, loaded once and cached (adsbdb 1 h, planespotters 24 h at the proxy). */
type Enrich = { route?: FlightRoute | null; rec?: AircraftRecord | null; photo?: AircraftPhoto | null };
const enrichCache = new Map<string, Enrich>();
const CALLSIGN = /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/;
const get = (url: string): Promise<unknown> => fetchJson<unknown>(proxied(url), { timeout: 9000 }).then((r) => r.data, () => null);

async function loadEnrich(hex: string, call: string, reg: string, changed: () => void): Promise<void> {
  const e: Enrich = {};
  enrichCache.set(hex, e);
  if (enrichCache.size > 300) enrichCache.delete(enrichCache.keys().next().value as string);
  const rec = get(`https://api.adsbdb.com/v0/aircraft/${hex}`).then((r) => { e.rec = parseAircraftRecord(r); changed(); return e.rec; });
  const route = CALLSIGN.test(call) ? get(`https://api.adsbdb.com/v0/callsign/${call}`).then((r) => { e.route = parseRoute(r); changed(); }) : Promise.resolve();
  const photo = get(`https://api.planespotters.net/pub/photos/hex/${hex}`).then(async (r) => {
    e.photo = parsePhoto(r);
    const regNo = reg || (await rec)?.registration;
    if (!e.photo && regNo && /^[A-Z0-9-]{2,10}$/i.test(regNo)) e.photo = parsePhoto(await get(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(regNo)}`));
    if (e.photo === undefined) e.photo = null;
    changed();
  });
  await Promise.all([rec, route, photo]);
  e.route ??= null;
  e.rec ??= null;
  changed();
}

export default defineLayer({
  id: 'flugzeuge',
  category: 'verkehr',
  title: 'Flugzeuge',
  summary: 'Flugzeuge weltweit in Echtzeit, Militär und Notfälle hervorgehoben',
  icon: 'plane',
  color: COLOR,
  form: 'tracks',
  cadence: 'live',
  coverage: 'Welt (Übersicht) · Ausschnitt ab Zoom 5',
  sources: [
    { name: 'OpenSky Network (Weltübersicht)', url: 'https://opensky-network.org/', license: 'frei für Forschung und Nichtkommerzielles, Quellenangabe' },
    { name: 'adsb.lol (Ausschnitt, Militär)', url: 'https://adsb.lol/', license: 'ODbL 1.0' },
    { name: 'adsb.fi (Rückfall)', url: 'https://adsb.fi/', license: 'ODbL 1.0' },
    { name: 'adsbdb (Route, Typ)', url: 'https://www.adsbdb.com/', license: 'Community-Daten, kein Flugplan' },
    { name: 'Planespotters.net (Fotos)', url: 'https://www.planespotters.net/', license: 'Fotos bei den Fotografen, Namensnennung und Link' },
  ],
  options: [
    { id: 'milOnly', label: 'Nur Militär', type: 'toggle', default: false },
    { id: 'minAlt', label: 'Mindesthöhe', type: 'range', min: 0, max: 12000, step: 500, default: 0, unit: 'm' },
    { id: 'kind', label: 'Anzeigen', type: 'select', choices: [{ value: 'all', label: 'Alle Luftfahrzeuge' }, { value: 'heli', label: 'Nur Hubschrauber' }], default: 'all' },
    { id: 'ground', label: 'Flugzeuge am Boden', type: 'toggle', default: false },
  ],
  legend: {
    type: 'classes',
    items: [
      { color: MILITARY, label: 'Militär' },
      { color: EMERGENCY, label: 'Notfall-Squawk' },
      { color: COLOR, label: 'Flugzeug' },
    ],
  },
  keywords: ['flug', 'ads-b', 'adsb', 'luftfahrt', 'aircraft', 'plane', 'hubschrauber', 'transponder', 'militär', 'military', 'opensky', 'route'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const silent: LayerContext = { ...ctx, status: () => {} };
    const detail = acquireDetail(ml);

    // --- worldwide overview ---
    const osk = ctx.resource<TrackObject[]>({ key: 'opensky:states-all', url: bucketUrl('live', 'aircraft/opensky-states.json'), parse: 'openskyStates', refresh: 75_000, timeout: 30_000 });
    // a stale snapshot counts as unavailable (collector down): then the hub circles take over
    const oskList = computed(() => { const d = osk.data.value; return d && !snapshotStale(d, Date.now()) ? d : undefined; });
    const oskDown = computed(() => !oskList.value && (osk.state.value === 'error' || osk.data.value !== undefined));
    const milRes = ctx.resource<TrackObject[]>({ key: 'adsblol:mil', url: proxied('https://api.adsb.lol/v2/mil'), parse: 'aircraftReadsb', refresh: 2 * MINUTE, timeout: 40_000 });
    const fallback = circleFeed({ ml, minZoom: 0, maxZoom: DETAIL_LOAD_ZOOM, maxCircles: 10, hubs: OVERVIEW_HUBS, pollMs: 2 * MINUTE, active: () => oskDown.peek() });
    const stopFallback = effect(() => { if (oskDown.value) fallback.reload(); });
    const stopRemember = effect(() => { const d = detail.res.data.value; if (d) rememberLive(d); });
    const world = computed<TrackObject[] | undefined>(() => {
      detail.res.data.value; // newer detailed positions replace overview ones
      return mergeOverview(oskList.value ?? fallback.data.value, milRes.data.value, !!ctx.options.value.milOnly);
    });

    const zoom = signal(ml.getZoom());
    const onZoom = () => { zoom.value = ml.getZoom(); };
    ml.on('zoomend', onZoom);
    ml.on('moveend', onZoom);

    const filter = computed<FilterSpecification | undefined>(() => {
      const o = ctx.options.value;
      const clauses: unknown[] = [];
      if (!o.ground) clauses.push(['!', ['get', 'gnd']]);
      if (Number(o.minAlt) > 0) clauses.push(['any', ['get', 'emerg'], ['>=', ['get', 'alt'], Number(o.minAlt)]]);
      if (o.kind === 'heli') clauses.push(['get', 'heli']);
      if (o.milOnly) clauses.push(['get', 'mil']);
      return clauses.length ? (['all', ...clauses] as FilterSpecification) : undefined;
    });
    const passes = (t: TrackObject): boolean => {
      const o = ctx.options.peek();
      const min = Number(o.minAlt);
      const p = t.props as unknown as AircraftProps;
      if (!o.ground && p.gnd) return false;
      if (min > 0 && p.alt < min && !p.emerg) return false;
      if (o.kind === 'heli' && !p.heli) return false;
      if (o.milOnly && !p.mil) return false;
      return true;
    };
    const countOf = (list: TrackObject[] | undefined) => {
      if (!list) return undefined;
      ctx.options.value; // re-run when the options change
      return list.filter(passes).length;
    };

    // status of the layer: the overview below zoom 5, the detailed view above
    const stopStatus = effect(() => {
      const wide = zoom.value < DETAIL_SHOW_ZOOM;
      const list = wide ? world.value : detail.res.data.value;
      const note = wide
        ? oskDown.value ? (fallback.data.value ? 'Weltübersicht von OpenSky nicht verfügbar oder veraltet: Näherung aus Abfragen um große Drehkreuze' : 'Weltübersicht von OpenSky nicht verfügbar oder veraltet') : milRes.error.value
        : detail.res.error.value;
      if (list === undefined) {
        const failed = wide ? oskDown.value && fallback.state.value === 'error' : detail.res.state.value === 'error';
        ctx.status(failed ? { state: 'error', note } : { state: 'loading' });
        return;
      }
      const n = countOf(list);
      ctx.status({ state: n === 0 ? 'empty' : 'ready', count: n, updatedAt: wide ? (osk.updatedAt.value ?? fallback.updatedAt.value ?? milRes.updatedAt.value) : detail.res.updatedAt.value, note });
    });

    // --- selected aircraft: route line + card enrichment ---
    const mine = new WeakSet<InspectCard>();
    const selHex = signal<string | null>(null);
    const version = signal(0);
    const bump = () => { version.value++; };
    const trackOf = (hex: string): TrackObject | undefined => liveSeen.get(hex) ?? world.peek()?.find((t) => t.id === hex);
    const posOf = (t: TrackObject): [number, number] => extrapolate(t, Date.now(), 30_000);

    const cardOf = (t: TrackObject, now: number): InspectCard => {
      const p = t.props as unknown as AircraftProps;
      const en = enrichCache.get(p.hex);
      const rec = en?.rec;
      const sq = SQUAWK[p.sq];
      const reg = p.reg || rec?.registration || '';
      const title = p.call || reg || p.hex.toUpperCase();
      const age = Math.max(0, Math.round((now - t.t) / 1000));
      const facts: { label: string; value: string; emphasis?: boolean }[] = [];
      if (sq) facts.push({ label: 'Notfall-Squawk', value: `${p.sq} – ${sq}`, emphasis: true });
      if (en?.route) {
        const r = en.route;
        facts.push({ label: 'Route', value: `${r.origin.iata || r.origin.icao} ${r.origin.city} → ${r.destination.iata || r.destination.icao} ${r.destination.city}` });
        if (r.airline) facts.push({ label: 'Fluggesellschaft', value: r.airline });
      }
      const typ = p.desc ? `${p.desc}${p.type ? ` (${p.type})` : ''}` : p.type ? p.type : rec ? `${[rec.manufacturer, rec.type].filter(Boolean).join(' ')}${rec.icaoType ? ` (${rec.icaoType})` : ''}` : '';
      if (typ.trim()) facts.push({ label: 'Typ', value: typ });
      if (reg) facts.push({ label: 'Kennzeichen', value: reg });
      if (rec?.owner) facts.push({ label: 'Halter', value: rec.owner });
      facts.push({ label: 'Höhe', value: p.gnd ? 'am Boden' : altitudeText(p.alt), emphasis: !p.gnd });
      if (t.speed !== undefined) facts.push({ label: 'Geschwindigkeit', value: speedText(t.speed) });
      if (t.heading !== undefined) facts.push({ label: 'Kurs', value: `${formatNumber(t.heading, 0)}°` });
      if (!p.gnd && Math.abs(p.vr) >= 0.3) facts.push({ label: 'Steigrate', value: rateText(p.vr) });
      if (p.sq && !sq) facts.push({ label: 'Squawk', value: p.sq });
      if (p.country || rec?.country) facts.push({ label: 'Registriert in', value: p.country || rec!.country });
      if (p.cat && CATEGORY[p.cat]) facts.push({ label: 'Kategorie', value: CATEGORY[p.cat]! });
      if (p.mil) facts.push({ label: 'Hinweis', value: 'Militärisch (Datenbankflag)' });
      if (en?.photo) facts.push({ label: 'Foto', value: `© ${en.photo.photographer} (Planespotters.net)` });
      facts.push({ label: 'Letzte Meldung', value: age < 2 ? 'gerade eben' : `vor ${age}${NNBSP}s` });
      const actions = tracksChannel.actionsFor(p.hex);
      return {
        ...(actions.length ? { actions } : {}),
        title,
        subtitle: p.call && reg ? reg : sq ?? (p.heli ? 'Hubschrauber' : p.mil ? 'Militärflugzeug' : 'Flugzeug'),
        color: sq ? EMERGENCY : p.mil ? MILITARY : COLOR,
        icon: 'plane',
        facts,
        ...(en?.photo ? { media: { type: 'image' as const, url: en.photo.src } } : {}),
        links: [
          ...(en?.photo ? [{ label: `Foto von ${en.photo.photographer} (Planespotters.net)`, url: en.photo.link }] : []),
          { label: 'Auf adsb.lol ansehen', url: `https://globe.adsb.lol/?icao=${p.hex}` },
          ...(reg && !en?.photo ? [{ label: 'Fotos (Planespotters)', url: `https://www.planespotters.net/search?q=${encodeURIComponent(reg)}` }] : []),
        ],
      };
    };

    const describe = (t: TrackObject, now: number): InspectCard => {
      const p = t.props as unknown as AircraftProps;
      if (!enrichCache.has(p.hex)) void loadEnrich(p.hex, p.call, p.reg, bump);
      selHex.value = p.hex;
      const card = cardOf(t, now);
      mine.add(card);
      return card;
    };
    // --- channel for extensions (3D): the detailed view plus the rest of the overview, filtered like the 2D icons; built only while someone listens ---
    const samples = (): TrackSample[] => {
      const out: TrackSample[] = [];
      for (const t of preferFirst(detail.res.data.peek() ?? [], world.peek() ?? [])) {
        if (!passes(t)) continue;
        const p = t.props as unknown as AircraftProps;
        out.push({
          id: t.id, lng: t.lng, lat: t.lat, altM: p.gnd ? 0 : p.alt, track: p.trk >= 0 ? p.trk : t.heading, speedMs: t.speed ?? 0, vrMs: p.vr,
          ground: p.gnd, heli: p.heli, category: p.cat, emergency: p.emerg, military: p.mil, color: aircraftColor(p), label: p.call || p.reg || p.hex.toUpperCase(), t: t.t,
        });
      }
      return out;
    };
    const stopPublish = effect(() => { detail.res.data.value; world.value; ctx.options.value; tracksChannel.publish(samples); });
    const stopSelectedId = effect(() => { tracksChannel.setSelectedId(selHex.value); });
    // an extension changed its card buttons: rebuild the card (version.peek: the effect must not read what it writes)
    const stopActions = effect(() => { tracksChannel.actionsVersion.value; version.value = version.peek() + 1; });
    const offSelect = tracksChannel.onSelect((id) => {
      if (id === null) { if (selHex.peek()) ctx.select(null); return; }
      const t = detail.res.data.peek()?.find((x) => x.id === id) ?? trackOf(id);
      if (!t) return;
      const card = describe(t, Date.now());
      card.location ??= posOf(t);
      ctx.select(card);
    });

    // a card of another layer (or none) in the inspector: forget the selection
    const stopSel = effect(() => { const c = ctx.selection.value; if (!c || !mine.has(c)) selHex.value = null; });
    // enrichment arrived: update the card in place (ownSelection keeps the selection ring)
    let lastVersion = 0;
    const stopUpdate = effect(() => {
      const v = version.value;
      const hex = selHex.peek();
      if (!hex || v === lastVersion) return;
      lastVersion = v;
      const t = trackOf(hex);
      if (!t) return;
      const card = { ...cardOf(t, Date.now()), location: posOf(t) };
      mine.add(card);
      ctx.select(card);
    });

    // route layer
    const rsrc = `${ctx.id}.route-src`;
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    ctx.map.addSource(rsrc, { type: 'geojson', data: empty });
    const lines = (id: string, part: string, dash: number[], colorStr: string, opacity: number) => ({
      id: `${ctx.id}.route-${id}`, type: 'line' as const, source: rsrc, filter: ['==', ['get', 'part'], part] as FilterSpecification,
      layout: { 'line-cap': 'butt' as const }, paint: { 'line-color': colorStr, 'line-width': 1.8, 'line-dasharray': dash, 'line-opacity': opacity },
    });
    ctx.map.addLayer(lines('flown', 'flown', [1.5, 2], '#bcd6ff', 0.95), 'lines');
    ctx.map.addLayer(lines('ahead', 'ahead', [3, 2.5], '#7fa8f0', 0.8), 'lines');
    ctx.map.addLayer({
      id: `${ctx.id}.route-ap`, type: 'circle', source: rsrc, filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 4.5, 'circle-color': '#0e1626', 'circle-stroke-color': '#bcd6ff', 'circle-stroke-width': 2 },
    }, 'lines');
    ctx.map.addLayer({
      id: `${ctx.id}.route-ap-label`, type: 'symbol', source: rsrc, filter: ['==', ['geometry-type'], 'Point'],
      layout: { 'text-field': ['get', 'label'] as unknown as ExpressionSpecification, 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.0], 'text-anchor': 'top', 'text-allow-overlap': true },
      paint: { 'text-color': '#e6f0ff', 'text-halo-color': 'rgba(10, 15, 24, 0.9)', 'text-halo-width': 1.5 },
    }, 'lines');
    const pushRoute = () => {
      const hex = selHex.peek();
      const route = hex ? enrichCache.get(hex)?.route : undefined;
      const t = hex ? trackOf(hex) : undefined;
      const src = ml.getSource(rsrc) as { setData(d: unknown): void } | undefined;
      if (!src) return;
      if (!route || !t) { src.setData(empty); return; }
      const fc = routeFeatures(route, posOf(t));
      const pt = (a: FlightRoute['origin']): GeoJSON.Feature<GeoJSON.Point> => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [a.lng, a.lat] }, properties: { id: a.icao, label: a.iata || a.icao } });
      src.setData({ type: 'FeatureCollection', features: [...fc.features, pt(route.origin), pt(route.destination)] });
    };
    const stopRoute = effect(() => { selHex.value; version.value; pushRoute(); });
    const routeTimer = setInterval(() => { if (selHex.peek()) pushRoute(); }, 3000);

    // --- layers ---
    const worldH = trackLayer(silent, {
      name: 'world', data: world, color, symbol: { icon: 'plane', size: worldSize }, ringRadius: 12, maxExtrapolateMs: 5 * MINUTE, tickMs: 2000,
      filter, describe, hidden: tracksChannel.presented,
      feed: (tracks) =>
        tracks.filter((t) => (t.props as unknown as AircraftProps).emerg).map((t) => {
          const p = t.props as unknown as AircraftProps;
          return { id: t.id, title: `${p.call || p.reg || p.hex} – ${SQUAWK[p.sq] ?? 'Notfall'}`, subtitle: `Squawk ${p.sq}`, color: EMERGENCY, location: [t.lng, t.lat] as [number, number] };
        }),
    });
    const detailH = trackLayer(silent, {
      data: detail.res, color, symbol: { icon: 'plane', size }, ringRadius: 16, maxExtrapolateMs: 30_000, filter, minZoom: DETAIL_SHOW_ZOOM, describe, hidden: tracksChannel.presented,
    });
    // the overview ends where the detailed view starts (layer ranges are disjoint, so no aircraft is drawn twice)
    for (const id of [`${ctx.id}.world-symbols`, `${ctx.id}.world-ring`]) if (ml.getLayer(id)) ml.setLayerZoomRange(id, 0, DETAIL_SHOW_ZOOM);

    return {
      destroy() {
        stopStatus(); stopSel(); stopUpdate(); stopPublish(); stopSelectedId(); stopActions(); offSelect(); tracksChannel.reset(); stopRoute(); stopFallback(); stopRemember();
        clearInterval(routeTimer);
        ml.off('zoomend', onZoom);
        ml.off('moveend', onZoom);
        worldH.destroy();
        detailH.destroy();
        ctx.map.remove({ layers: [`${ctx.id}.route-ap-label`, `${ctx.id}.route-ap`, `${ctx.id}.route-ahead`, `${ctx.id}.route-flown`], sources: [rsrc] });
        fallback.dispose();
        detail.release();
      },
    };
  },
});
