// Ships from AIS. Worldwide: aisstream.io through the proxy's /ais WebSocket relay (the worker holds the key; subscribes to
// the view from zoom 3, throttled to one map update per second, reconnect with back-off, at most 8000 ships), merged with
// Digitraffic Marine (Fintraffic) for the Baltic. The visitor's own aisstream key (settings) is the fallback when the
// relay is unavailable. Selected ship: destination and ETA from AIS static data, trail of the positions seen in this
// session, photo from Wikimedia Commons when one can be matched by IMO number or name.
import { computed, effect, signal } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { formatNumber } from '../../core/format';
import { MINUTE } from '../../core/time';
import { AisClient } from '../../data/parsers/aisclient';
import { AisBook, etaText, parseAisMessage, subscriptionBoxes } from '../../data/parsers/aisstream';
import { SHIP_CLASSES, shipClass, shipTypeName, type ShipProps, type ShipVessel } from '../../data/parsers/ais';
import { greatCircle } from '../../data/parsers/flightinfo';
import { PortIndex, type DestPort, type PortRow } from '../../data/parsers/shipdest';
import { commonsFileUrl, commonsSearchUrl, parseCommonsFile, parseCommonsPhoto, parseWikidataImage, wikidataImoUrl, type ShipPhoto } from '../../data/parsers/shipphoto';
import { speedText } from '../../data/parsers/traffic';
import { extrapolate, trackLayer, type TrackObject } from '../../render/tracks';
import { fetchJson } from '../../data/http';
import { defineLayer } from '../define';
import type { InspectCard } from '../types';

const COLOR = '#4fc3f7';
const BASE = 'https://meri.digitraffic.fi/api/ais/v1';
const colorExpr = ['match', ['get', 'cls'], ...SHIP_CLASSES.slice(0, -1).flatMap((c) => [c.id, c.color]), SHIP_CLASSES[SHIP_CLASSES.length - 1]!.color] as unknown as ExpressionSpecification;
const size = ['interpolate', ['linear'], ['zoom'], 3, 0.2, 7, 0.3, 11, 0.5, 14, 0.7] as unknown as ExpressionSpecification;
const AIS_MIN_ZOOM = 3;
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const PORTS_URL = `${env.BASE_URL ?? './'}data/ports.json`;

// ports for the destination text: loaded once, only when a ship is selected
let portIndex: Promise<PortIndex | null> | undefined;
const loadPorts = (): Promise<PortIndex | null> => (portIndex ??= fetchJson<{ ports?: PortRow[] }>(PORTS_URL, { timeout: 30_000 }).then((r) => new PortIndex(r.data.ports ?? [])).catch(() => { portIndex = undefined; return null; }));

type Photo = ShipPhoto | null;
const photoCache = new Map<string, Promise<Photo>>();
function shipPhoto(imo: number, name: string): Promise<Photo> {
  const key = `${imo}|${name}`;
  let p = photoCache.get(key);
  if (!p) {
    const viaWikidata = async (): Promise<Photo> => {
      if (imo <= 0) return null;
      try {
        const file = parseWikidataImage((await fetchJson<unknown>(wikidataImoUrl(imo), { timeout: 12_000 })).data);
        return file ? parseCommonsFile((await fetchJson<unknown>(commonsFileUrl(file), { timeout: 10_000 })).data) : null;
      } catch { return null; }
    };
    const tries = [imo > 0 ? `IMO ${imo}` : '', name.length >= 5 ? `"${name}" ship` : ''].filter(Boolean);
    p = (async () => {
      const w = await viaWikidata();
      if (w) return w;
      for (const q of tries) {
        try {
          const r = parseCommonsPhoto((await fetchJson<unknown>(commonsSearchUrl(q), { timeout: 10_000 })).data, { imo, name });
          if (r) return r;
        } catch { /* next */ }
      }
      return null;
    })();
    photoCache.set(key, p);
    if (photoCache.size > 200) photoCache.delete(photoCache.keys().next().value as string);
  }
  return p;
}

export default defineLayer({
  id: 'schiffe',
  category: 'verkehr',
  title: 'Schiffe',
  summary: 'Schiffe weltweit nach AIS, Farbe nach Schiffstyp, Ziel, ETA und Spur',
  icon: 'ship',
  color: COLOR,
  form: 'tracks',
  cadence: 'live',
  coverage: 'Welt (AIS-Stream im Ausschnitt ab Zoom 3) · Ostsee komplett',
  sources: [
    { name: 'aisstream.io (über den Daten-Proxy)', url: 'https://aisstream.io/', license: 'kostenlos, Quellenangabe' },
    { name: 'Fintraffic Digitraffic Marine (AIS)', url: 'https://www.digitraffic.fi/en/marine-traffic/', license: 'CC BY 4.0' },
    { name: 'Wikidata + Wikimedia Commons (Fotos über die IMO-Nummer, wenn vorhanden)', url: 'https://www.wikidata.org/', license: 'je Foto, Urheber und Lizenz in der Karte' },
    { name: 'World Port Index (NGA) / UN/LOCODE (Zielhafen aus dem AIS-Zieltext)', url: 'https://msi.nga.mil/Publications/WPI', license: 'gemeinfrei bzw. CC BY 4.0' },
  ],
  keys: [{ id: 'aisstream', required: false }],
  options: [
    { id: 'moving', label: 'Nur fahrende Schiffe', type: 'toggle', default: false },
    {
      id: 'cls', label: 'Schiffstyp', type: 'select', default: 'all',
      choices: [{ value: 'all', label: 'Alle' }, ...SHIP_CLASSES.map((c) => ({ value: c.id, label: c.label }))],
    },
  ],
  legend: { type: 'classes', items: SHIP_CLASSES.map((c) => ({ color: c.color, label: c.label })) },
  keywords: ['schiff', 'ais', 'fähre', 'ostsee', 'finnland', 'ship', 'vessel', 'tanker', 'frachter', 'hafen', 'weltweit', 'aisstream'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const loc = ctx.resource<TrackObject[]>({
      key: 'digitraffic:ais-locations',
      url: () => `${BASE}/locations?from=${Date.now() - 30 * MINUTE}`, // last 30 minutes; newest position per vessel
      parse: 'aisLocations',
      refresh: MINUTE,
      timeout: 40_000,
    });
    const vessels = ctx.resource<Record<string, ShipVessel>>({ key: 'digitraffic:ais-vessels', url: `${BASE}/vessels`, parse: 'aisVessels', refresh: 30 * MINUTE, timeout: 60_000 });

    // --- worldwide stream ---
    const book = new AisBook(8000);
    const streamTracks = signal<TrackObject[]>([]);
    const link = signal<{ state: 'relay' | 'key' | 'down' | 'idle'; note?: string }>({ state: 'idle' });
    let dirty = false;
    const client = new AisClient({
      onMessage(text) {
        const m = parseAisMessage(text);
        if (!m) return;
        if (m.kind === 'error') { link.value = { state: 'down', note: `aisstream.io: ${m.text}` }; return; }
        book.apply(m);
        dirty = true;
      },
      onState: (state, note) => { link.value = { state, note }; },
      getKey: () => ctx.key('aisstream').peek(),
    });
    const zoom = signal(ml.getZoom());
    const subscribe = () => {
      zoom.value = ml.getZoom();
      if (zoom.value < AIS_MIN_ZOOM) { client.setBoxes(null); return; }
      const b = ml.getBounds();
      client.setBoxes(subscriptionBoxes({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }));
    };
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const onMove = () => { clearTimeout(debounce); debounce = setTimeout(subscribe, 1000); };
    ml.on('moveend', onMove);
    subscribe();
    // throttle: at most one map update per second
    const flush = setInterval(() => {
      if (!dirty || (typeof document !== 'undefined' && document.hidden)) return;
      dirty = false;
      book.prune();
      streamTracks.value = book.tracks();
    }, 1000);
    // a new key is a reason to retry the connection right away
    const stopKey = effect(() => { ctx.key('aisstream').value; if (ml && zoom.peek() >= AIS_MIN_ZOOM && link.peek().state === 'down') subscribe(); });

    // Digitraffic: class/name from master data; positions also feed the trails
    const baltic = computed<TrackObject[] | undefined>(() => {
      const l = loc.data.value;
      if (!l) return undefined;
      const v = vessels.data.value;
      return l.map((t) => {
        const m = v?.[t.id];
        return { ...t, props: { ...t.props, cls: shipClass(m?.type), name: m?.name ?? '' } };
      });
    });
    const stopTrail = effect(() => { for (const t of loc.data.value ?? []) book.addTrail(Number(t.id), t.lng, t.lat, t.t); });
    const tracks = computed<TrackObject[] | undefined>(() => {
      const b = baltic.value;
      const s = streamTracks.value;
      if (!b && !s.length) return undefined;
      const m = new Map<string, TrackObject>();
      for (const t of b ?? []) m.set(t.id, t);
      for (const t of s) { const o = m.get(t.id); if (!o || t.t >= o.t) m.set(t.id, t); }
      return [...m.values()];
    });

    const filter = computed<FilterSpecification | undefined>(() => {
      const o = ctx.options.value;
      const clauses: unknown[] = [];
      if (o.moving) clauses.push(['get', 'moving']);
      if (o.cls && o.cls !== 'all') clauses.push(['==', ['get', 'cls'], String(o.cls)]);
      return clauses.length ? (['all', ...clauses] as FilterSpecification) : undefined;
    });
    const count = computed(() => {
      const t = tracks.value;
      if (!t) return undefined;
      const o = ctx.options.value;
      return t.filter((x) => (!o.moving || (x.props as unknown as ShipProps).moving) && (!o.cls || o.cls === 'all' || (x.props as { cls: string }).cls === o.cls)).length;
    });

    // --- card with destination, ETA, photo ---
    const mine = new WeakSet<InspectCard>();
    const selId = signal<string | null>(null);
    const version = signal(0);
    const photos = new Map<string, Photo>();
    let ports: PortIndex | null = null;
    const destPortOf = (t: TrackObject, dest: string | undefined): DestPort | null => (dest && ports ? ports.resolve(dest, [t.lng, t.lat]) : null);
    const trackOf = (id: string) => tracks.peek()?.find((t) => t.id === id);
    const cardOf = (t: TrackObject, now: number): InspectCard => {
      const p = t.props as unknown as ShipProps & { cls: string; name: string };
      const m = vessels.data.peek()?.[t.id];
      const st = book.statics.get(p.mmsi);
      const type = st?.type || m?.type;
      const cls = SHIP_CLASSES.find((c) => c.id === p.cls) ?? SHIP_CLASSES[SHIP_CLASSES.length - 1]!;
      const name = st?.name || m?.name || p.name;
      const dest = st?.dest || m?.dest;
      const eta = etaText(st?.eta ?? m?.eta ?? null);
      const draught = st?.draught || m?.draught;
      const len = st?.len || m?.len;
      const wid = st?.wid || m?.wid;
      const imo = st?.imo || m?.imo || 0;
      const call = st?.call || m?.call;
      const photo = photos.get(`${imo}|${name}`);
      const facts: InspectCard['facts'] = [{ label: 'Typ', value: shipTypeName(type) }];
      if (dest) facts.push({ label: 'Ziel', value: dest, emphasis: true });
      const dport = destPortOf(t, dest);
      if (dport) facts.push({ label: 'Zielhafen (zugeordnet)', value: dport.code ? `${dport.name} (${dport.code})` : dport.name });
      if (eta) facts.push({ label: 'Ankunft (ETA, gemeldet)', value: eta });
      facts.push({ label: 'Geschwindigkeit', value: p.moving ? speedText(p.sog * 0.514444) : 'liegt still' });
      if (p.cog >= 0 && p.moving) facts.push({ label: 'Kurs', value: `${formatNumber(p.cog, 0)}°` });
      if (draught) facts.push({ label: 'Tiefgang', value: `${formatNumber(draught, 1)} m` });
      if (len) facts.push({ label: 'Größe', value: `${formatNumber(len)} × ${formatNumber(wid ?? 0)} m` });
      if (call) facts.push({ label: 'Rufzeichen', value: call });
      facts.push({ label: 'MMSI', value: String(p.mmsi) });
      if (imo) facts.push({ label: 'IMO', value: String(imo) });
      if (photo) facts.push({ label: 'Foto', value: `${photo.author}, ${photo.license} (Wikimedia Commons)` });
      const trail = book.trails.get(p.mmsi)?.length ?? 0;
      if (trail > 1) facts.push({ label: 'Spur', value: `${trail} Positionen seit dem Öffnen der Karte` });
      const age = Math.round((now - t.t) / MINUTE);
      facts.push({ label: 'Letzte Meldung', value: age < 1 ? 'gerade eben' : `vor ${age} min` });
      return {
        title: name || `MMSI ${p.mmsi}`,
        subtitle: cls.label,
        color: cls.color,
        icon: 'ship',
        facts,
        ...(photo ? { media: { type: 'image' as const, url: photo.src } } : {}),
        links: [
          ...(photo ? [{ label: `Foto: ${photo.author} (${photo.license}), Wikimedia Commons`, url: photo.link }] : []),
          ...(imo ? [{ label: 'Fotos bei ShipSpotting', url: `https://www.shipspotting.com/photos/gallery?imo=${imo}` }] : []),
          { label: 'Auf MarineTraffic ansehen', url: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${p.mmsi}` },
        ],
      };
    };
    const describe = (t: TrackObject, now: number): InspectCard => {
      const p = t.props as unknown as ShipProps & { name: string };
      selId.value = t.id;
      const st = book.statics.get(p.mmsi);
      const m = vessels.data.peek()?.[t.id];
      const imo = st?.imo || m?.imo || 0;
      const name = st?.name || m?.name || p.name;
      const key = `${imo}|${name}`;
      if ((imo > 0 || name.length >= 5) && !photos.has(key)) {
        photos.set(key, null);
        void shipPhoto(imo, name).then((r) => { photos.set(key, r); if (r) version.value++; });
      }
      if (!ports) void loadPorts().then((i) => { if (i && !ports) { ports = i; version.value++; } });
      const card = cardOf(t, now);
      mine.add(card);
      return card;
    };
    const stopSel = effect(() => { const c = ctx.selection.value; if (!c || !mine.has(c)) selId.value = null; });
    let lastVersion = 0;
    const stopUpdate = effect(() => {
      const v = version.value;
      const id = selId.peek();
      if (!id || v === lastVersion) return;
      lastVersion = v;
      const t = trackOf(id);
      if (!t) return;
      const card = { ...cardOf(t, Date.now()), location: extrapolate(t, Date.now(), 10 * MINUTE) };
      mine.add(card);
      ctx.select(card);
    });

    // trail of the selected ship
    const tsrc = `${ctx.id}.trail-src`;
    ctx.map.addSource(tsrc, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    ctx.map.addLayer({ id: `${ctx.id}.trail`, type: 'line', source: tsrc, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#bfe9ff', 'line-width': 2, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.9 }, filter: ['==', ['get', 'part'], 'trail'] }, 'lines');
    ctx.map.addLayer({ id: `${ctx.id}.route`, type: 'line', source: tsrc, layout: { 'line-cap': 'butt' }, paint: { 'line-color': '#7fa8f0', 'line-width': 1.8, 'line-dasharray': [3, 2.5], 'line-opacity': 0.8 }, filter: ['==', ['get', 'part'], 'ahead'] }, 'lines');
    ctx.map.addLayer({ id: `${ctx.id}.route-port`, type: 'circle', source: tsrc, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4.5, 'circle-color': '#0e1626', 'circle-stroke-color': '#bfe9ff', 'circle-stroke-width': 2 } }, 'lines');
    const pushTrail = () => {
      const src = ml.getSource(tsrc) as { setData(d: unknown): void } | undefined;
      const id = selId.peek();
      const t = id ? trackOf(id) : undefined;
      const pts = t ? (book.trails.get(Number(id)) ?? []).map((p): [number, number] => [p[0], p[1]]) : [];
      const features: GeoJSON.Feature[] = [];
      if (t) pts.push(extrapolate(t, Date.now(), 10 * MINUTE));
      if (pts.length > 1) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: { part: 'trail' } });
      if (t) {
        const p = t.props as unknown as ShipProps;
        const st = book.statics.get(p.mmsi);
        const dp = destPortOf(t, st?.dest || vessels.data.peek()?.[t.id]?.dest);
        if (dp) {
          // the line continues on the same side of the antimeridian as the ship
          const at = pts[pts.length - 1]!;
          const dest: [number, number] = [dp.lng + Math.round((at[0] - dp.lng) / 360) * 360, dp.lat];
          features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: greatCircle(at, dest, 40) }, properties: { part: 'ahead' } });
          features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [dp.lng, dp.lat] }, properties: { part: 'port' } });
        }
      }
      src?.setData({ type: 'FeatureCollection', features });
    };
    const stopTrailDraw = effect(() => { selId.value; version.value; pushTrail(); });
    const trailTimer = setInterval(() => { if (selId.peek()) pushTrail(); }, 5000);

    // status: what the user needs to know about coverage
    const stopStatus = effect(() => {
      const s = link.value;
      const z = zoom.value;
      const n = count.value;
      const note = z < AIS_MIN_ZOOM ? 'Weltweite AIS-Daten ab Zoom 3, hier nur die Ostsee'
        : s.state === 'relay' ? 'Weltweit live über den Daten-Proxy (aisstream.io)'
        : s.state === 'key' ? 'Weltweit live mit deinem aisstream.io-Schlüssel'
        : s.state === 'down' ? `${s.note ?? 'AIS-Stream nicht erreichbar'}; Ostsee über Digitraffic` : 'Verbinde mit dem AIS-Stream …';
      if (n === undefined) { ctx.status(loc.state.value === 'error' && s.state !== 'relay' && s.state !== 'key' ? { state: 'error', note: loc.error.value } : { state: 'loading' }); return; }
      ctx.status({ state: n === 0 ? 'empty' : 'ready', count: n, updatedAt: loc.updatedAt.value, note });
    });

    const handle = trackLayer({ ...ctx, status: () => {} }, {
      data: tracks,
      resources: [loc, vessels],
      color: colorExpr,
      symbol: { icon: 'ship', size },
      filter,
      count,
      maxExtrapolateMs: 10 * MINUTE,
      tickMs: 1000,
      describe,
    });
    return {
      destroy() {
        clearTimeout(debounce);
        clearInterval(flush);
        clearInterval(trailTimer);
        ml.off('moveend', onMove);
        client.close();
        stopKey(); stopTrail(); stopSel(); stopUpdate(); stopTrailDraw(); stopStatus();
        handle.destroy();
        ctx.map.remove({ layers: [`${ctx.id}.route-port`, `${ctx.id}.route`, `${ctx.id}.trail`], sources: [tsrc] });
      },
    };
  },
});
