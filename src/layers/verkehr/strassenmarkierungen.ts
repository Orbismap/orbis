// Road surface and markings at street scale. The basemap draws roads as thin lines of constant width, so from zoom 15
// this layer paints REAL-SIZE roads (metres, scaled with the zoom) and the markings on them:
//   (1) from the OpenFreeMap vector tiles, for every road class: smoothed asphalt, dashed centre lines that stop at junctions,
//       oneway arrows (no edge lines), zebra crossings derived from footways that cross a street.
// Everything comes from the tiles (no extra requests): the tile rendering assumes the usual layout of each road class. Mapped
// details from OpenStreetMap (stop lines, turn arrows, mapped crossings, lane counts) are not drawn for now.
import { effect } from '@preact/signals';
import type { ExpressionSpecification, GeoJSONSource, LayerSpecification } from 'maplibre-gl';
import { runParser } from '../../data/worker/pool';
import { addArrowIcons, arrowId } from '../../render/roadicons';
import { KERB_BRIDGE, KERB_GROUND, roadClass, type RawRoad } from '../../render/roadnet';
import { defineLayer } from '../define';

type Expr = ExpressionSpecification;
type Num = number | Expr;
const EMPTY = { type: 'FeatureCollection', features: [] } as const;
const WHITE = '#c3c9d6';
const ASPHALT = '#262a35';
const KERB = KERB_GROUND;
const BRIDGE_KERB = KERB_BRIDGE;
const TUNNEL = '#1b1e27';
const FOOT = '#3b4660';
const CYCLE = '#35505a';
const STEPS = '#5d6a88';
const ZEBRA = '#8d95a6';
const TUNNEL_KERB = '#2a3142';
const RAD = Math.PI / 180;

/** Screen pixels per metre at zoom 16 for a latitude (Web Mercator, 512 px tiles). */
export const pxPerMetre16 = (lat: number) => 0.8373 / Math.cos(Math.min(85, Math.abs(lat)) * RAD);

/**
 * A length in metres as a line width/offset: proportional to 2^zoom, so it stays glued to the road. Constants may get a
 * minimum in pixels (thin markings stay visible when the true width would be below a pixel).
 */
export const metres = (v: Num, k: number, minPx = -Infinity): Expr => {
  if (typeof v === 'number') {
    const f = (z: number) => Math.max(minPx, v * k * 2 ** (z - 16));
    return ['interpolate', ['exponential', 2], ['zoom'], 16, f(16), 18, f(18), 22, v * k * 64] as unknown as Expr;
  }
  return ['interpolate', ['exponential', 2], ['zoom'], 16, ['*', v, k], 22, ['*', v, k * 64]] as unknown as Expr;
};

const all = (...f: Expr[]): Expr => ['all', ...f] as unknown as Expr;
const MID_W = 0.18;
/** dash length / gap in metres per centre-line pattern of roadnet.ts */
const MID: Record<string, [number, number]> = { a: [3, 6], b: [4, 8], c: [6, 12], d: [2, 6] };

/** Level of a tile road: the OSM layer (-1..2), at least 1 on a bridge, below ground in a tunnel. */
export const levelOf = (p: { brunnel?: string; layer?: number | string }): number => {
  const lay = Math.max(-1, Math.min(2, Math.round(Number(p.layer)) || 0));
  if (p.brunnel === 'tunnel') return -1;
  return p.brunnel === 'bridge' ? Math.max(1, lay) : lay;
};

export default defineLayer({
  id: 'strassenmarkierungen',
  category: 'verkehr',
  title: 'Straßenmarkierungen',
  summary: 'Fahrbahnen in echter Breite mit Mittellinien, Pfeilen, Haltelinien, Zebrastreifen und Fahrstreifen ab Stadtzoom',
  icon: 'car',
  color: '#c9ced8',
  form: 'lines',
  cadence: 'daily',
  coverage: 'Ausschnitt',
  minZoom: 15,
  sources: [{ name: 'OpenStreetMap-Mitwirkende, OpenFreeMap', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0' }],
  legend: { type: 'classes', items: [
    { color: WHITE, label: 'Mittellinien (aus der Straßenklasse abgeleitet)', shape: 'line' },
    { color: WHITE, label: 'Zebrastreifen, Haltelinien, Pfeile (OpenStreetMap)', shape: 'line' },
    { color: ASPHALT, label: 'Fahrbahn in echter Breite', shape: 'line' },
    { color: '#cfd8dc', label: 'Verkehrsinseln', shape: 'square' },
  ] },
  keywords: ['markierung', 'zebrastreifen', 'fahrbahn', 'mittellinie', 'haltelinie', 'pfeil', 'abbiegen', 'fahrstreifen', 'spur', 'sperrlinie', 'überholverbot', 'verkehrsinsel', 'road markings', 'crossing', 'lanes'],

  mount(ctx) {
    const ml = ctx.map.ml;
    addArrowIcons(ml);
    const onMissing = (e: { id: string }) => { if (e.id.startsWith('rm-arrow-')) addArrowIcons(ml); };
    ml.on('styleimagemissing', onMissing);

    let k = pxPerMetre16(ml.getCenter().lat);
    const dyn: { id: string; prop: string; make(k: number): Expr }[] = [];
    const fades = new Map<string, { prop: string; z0: number; z1: number; max: number }>();
    const specs: LayerSpecification[] = [];
    /** Registers a layer; `w`/`off` are lengths in metres that follow the zoom (and the latitude, see below). */
    const add = (id: string, spec: Record<string, unknown>, o: {
      w?: [Num, number?]; off?: Num; fade: [number, number, number]; dash?: [number, number]; filter?: Expr;
    }) => {
      const full = `${ctx.id}.${id}`;
      const type = (spec.type as string) ?? 'line';
      const paint: Record<string, unknown> = { ...(spec.paint as object) };
      if (o.w) { const [v, floor] = o.w; paint['line-width'] = metres(v, k, floor); dyn.push({ id: full, prop: 'line-width', make: (kk) => metres(v, kk, floor) }); }
      if (o.off !== undefined) { const v = o.off; paint['line-offset'] = metres(v, k); dyn.push({ id: full, prop: 'line-offset', make: (kk) => metres(v, kk) }); }
      if (o.dash) paint['line-dasharray'] = o.dash;
      fades.set(full, { prop: type === 'fill' ? 'fill-opacity' : type === 'symbol' ? 'icon-opacity' : 'line-opacity', z0: o.fade[0], z1: o.fade[1], max: o.fade[2] });
      specs.push({ ...spec, id: full, type, paint, ...(o.filter ? { filter: o.filter } : {}) } as unknown as LayerSpecification);
    };
    const round = { 'line-cap': 'round', 'line-join': 'round' };
    const roads = `${ctx.id}.roads`, marks = `${ctx.id}.marks`, kerbs = `${ctx.id}.kerbs`, zebras = `${ctx.id}.zebras`, arrowPts = `${ctx.id}.arrows`;
    ctx.map.addSource(arrowPts, { type: 'geojson', data: EMPTY as never });
    ctx.map.addSource(zebras, { type: 'geojson', data: EMPTY as never });
    ctx.map.addSource(kerbs, { type: 'geojson', data: EMPTY as never });
    ctx.map.addSource(roads, { type: 'geojson', data: EMPTY as never });
    ctx.map.addSource(marks, { type: 'geojson', data: EMPTY as never });
    // round ends (dead ends are round); a side road ends exactly on the centreline of the road it joins (snapNetwork), so its cap stays inside
    const sorted = { ...round, 'line-sort-key': ['get', 'rank'] };

    // Levels from the OSM `layer` tag (OpenMapTiles keeps it), drawn bottom to top: below ground (dim, no markings), ground,
    // raised 1 and 2 (bridges, bridges over bridges; own kerb, above everything below them).
    const lvIs = (lv: number): Expr => ['==', ['get', 'lv'], lv] as unknown as Expr;
    const LEVELS = [
      { lv: -1, id: 't', surf: TUNNEL, kerb: TUNNEL_KERB, kw: 0.8, a: 0.55, marks: false },
      { lv: 0, id: 'g', surf: ASPHALT, kerb: KERB, kw: 1, a: 1, marks: true },
      { lv: 1, id: 'b', surf: ASPHALT, kerb: BRIDGE_KERB, kw: 2.4, a: 1, marks: true },
      { lv: 2, id: 'c', surf: ASPHALT, kerb: BRIDGE_KERB, kw: 2.4, a: 1, marks: true },
    ];
    // a bridge kerb must stop at the bridge ends (flat caps): the asphalt on top keeps its round caps and blends into the approach road
    // bridge kerbs are one smooth outline polygon per bridge with flat ends (roadnet.ts): they widen gradually and never cut the approach road
    const notPath: Expr = ['!=', ['get', 'pth'], 1] as unknown as Expr;
    const isPath: Expr = ['==', ['get', 'pth'], 1] as unknown as Expr;
    // asphalt for roads; footways and cycle ways get their own tint
    const surfColour = (base: string): Expr => ['match', ['get', 'cls'], 'cycle', CYCLE, ['foot', 'steps', 'ped'], FOOT, base] as unknown as Expr;
    const netLevel = (L: (typeof LEVELS)[number]) => {
      const lvl = L.lv === 0 ? all(lvIs(0), notPath) : lvIs(L.lv); // ground footways are drawn below the roads; bridge and tunnel levels carry their own
      if (L.lv >= 1) add(`net.${L.id}.case`, { source: kerbs, type: 'fill', minzoom: 15, paint: { 'fill-color': ['get', 'c'], 'fill-antialias': true } }, { filter: lvIs(L.lv), fade: [15.2, 16, 1] });
      else add(`net.${L.id}.case`, { source: roads, minzoom: 15, layout: sorted, paint: { 'line-color': L.kerb } }, { filter: lvl, w: [['+', ['get', 'w'], L.kw] as unknown as Expr], fade: [15.2, 16, 0.9 * L.a] });
      add(`net.${L.id}.surf`, { source: roads, minzoom: 15, layout: sorted, paint: { 'line-color': L.lv === 0 ? L.surf : surfColour(L.surf) } }, { filter: lvl, w: [['get', 'w'] as unknown as Expr], fade: [15.2, 16, L.a] });
      if (!L.marks) return;
      for (const [m, [d, g]] of Object.entries(MID)) {
        add(`net.${L.id}.mid-${m}`, { source: marks, minzoom: 16.4, paint: { 'line-color': WHITE } }, { filter: all(lvIs(L.lv), ['==', ['get', 'mid'], m] as unknown as Expr), w: [MID_W, 0.7], dash: [d / MID_W, g / MID_W], fade: [16.4, 17, 0.75] });
      }
    };
    // footways and cycle ways lie UNDER the roads (a mapped crossing then shows as the road, not as a pale bar across it)
    const pathLayer = () => {
      add('net.paths', { source: roads, minzoom: 15, layout: sorted, paint: { 'line-color': surfColour(FOOT) } }, { filter: all(isPath, lvIs(0)), w: [['get', 'w'] as unknown as Expr], fade: [15.2, 16, 0.95] });
      add('net.steps', { source: roads, minzoom: 16, layout: { 'line-cap': 'butt' }, paint: { 'line-color': STEPS } }, { filter: all(['==', ['get', 'cls'], 'steps'] as unknown as Expr, lvIs(0)), w: [['get', 'w'] as unknown as Expr], dash: [0.2, 0.2], fade: [16, 16.8, 0.9] });
    };
    netLevel(LEVELS[0]!);
    pathLayer();
    netLevel(LEVELS[1]!);
    netLevel(LEVELS[2]!);
    netLevel(LEVELS[3]!);
    // arrows are the first markings to appear (before centre lines): from 15.8 on, never smaller than a readable minimum
    const ARROW_FROM = 15.8;
    const arrowSizeOf = (metresLong: number) => (kk: number): Expr => {
      const real = (z: number) => (metresLong * kk * 2 ** (z - 16)) / 32;
      return ['interpolate', ['exponential', 2], ['zoom'], ARROW_FROM, Math.max(0.32, real(ARROW_FROM)), 18, Math.max(0.32, real(18)), 22, real(22)] as unknown as Expr;
    };
    const arrowSize = arrowSizeOf(3.2);
    add('oneway', {
      source: arrowPts, type: 'symbol', minzoom: ARROW_FROM,
      layout: {
        'icon-image': arrowId('s'), 'icon-rotate': ['get', 'rot'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
        'icon-size': arrowSize(k),
      },
      paint: {},
    }, { fade: [ARROW_FROM, 16.4, 0.7] });
    dyn.push({ id: `${ctx.id}.oneway`, prop: 'icon-size', make: arrowSize });

    // zebra crossings derived from the network (a footway crossing a street): 
    add('zebra.derived', { source: zebras, type: 'fill', minzoom: 15.5, paint: { 'fill-color': ZEBRA, 'fill-antialias': true } }, { fade: [15.5, 16.2, 0.95] });

    for (const s of specs) ctx.map.addLayer(s, 'lines');
    const ids = specs.map((s) => s.id);

    // the zoom-to-metres factor depends on the latitude: refresh when the view moved far enough north/south to matter
    const onMove = () => {
      const kk = pxPerMetre16(ml.getCenter().lat);
      if (Math.abs(kk / k - 1) < 0.04) return;
      k = kk;
      for (const d of dyn) if (ml.getLayer(d.id)) {
        if (d.prop === 'icon-size') ml.setLayoutProperty(d.id, 'icon-size', d.make(k));
        else ml.setPaintProperty(d.id, d.prop as never, d.make(k) as never);
      }
    };
    ml.on('moveend', onMove);

    // the road network is rebuilt from the tiles that are loaded for the view (smoothed, deduplicated, markings cut at junctions).
    // Cheap by design: the heavy part runs in a worker, it only runs when the view left the area built last time or new
    // tiles arrived, and an answer for an outdated view is dropped.
    const NET_ZOOM = 15.2;
    type DerivedZebra = { type: 'Feature'; geometry: unknown; properties: { lv: number; mid: number[] } };
    let derived: DerivedZebra[] = [];
    const showDerived = () => (ml.getSource(zebras) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: derived } as never);
    let hadNet = false;
    let dirty = true;
    let seq = 0;
    let built: { w: number; s: number; e: number; n: number } | undefined;
    let netTimer: ReturnType<typeof setTimeout> | undefined;
    const rebuild = async () => {
      const rs = ml.getSource(roads) as GeoJSONSource | undefined, ms = ml.getSource(marks) as GeoJSONSource | undefined;
      if (!rs || !ms) return;
      if (ml.getZoom() < NET_ZOOM) {
        seq++; built = undefined; dirty = true;
        if (hadNet) { rs.setData(EMPTY as never); ms.setData(EMPTY as never); (ml.getSource(kerbs) as GeoJSONSource | undefined)?.setData(EMPTY as never); (ml.getSource(arrowPts) as GeoJSONSource | undefined)?.setData(EMPTY as never); derived = []; showDerived(); hadNet = false; }
        return;
      }
      const b = ml.getBounds();
      const inside = built && b.getWest() >= built.w && b.getEast() <= built.e && b.getSouth() >= built.s && b.getNorth() <= built.n;
      if (inside && !dirty) return;
      dirty = false;
      const padX = (b.getEast() - b.getWest()) * 0.5, padY = (b.getNorth() - b.getSouth()) * 0.5;
      const area = { w: b.getWest() - padX, e: b.getEast() + padX, s: b.getSouth() - padY, n: b.getNorth() + padY };
      const inView = (c: number[]) => c[0]! > area.w && c[0]! < area.e && c[1]! > area.s && c[1]! < area.n;
      const raw: RawRoad[] = [];
      for (const f of ml.querySourceFeatures('ofm', { sourceLayer: 'transportation' })) {
        const p = f.properties as { class?: string; subclass?: string; ramp?: number; oneway?: number; brunnel?: string; layer?: number | string };
        const cls = roadClass(p);
        if (!cls) continue;
        const g = f.geometry;
        const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
        for (const coords of parts) if (coords.some(inView)) raw.push({ cls, oneway: Number(p.oneway) || 0, level: levelOf(p), coords });
      }
      const c = ml.getCenter();
      const mine = ++seq;
      try {
        const net = await runParser('roadNet', { roads: raw, lon0: c.lng, lat0: c.lat }, { signal: ctx.signal });
        if (mine !== seq) return;
        rs.setData(net.roads as never);
        ms.setData(net.marks as never);
        (ml.getSource(kerbs) as GeoJSONSource | undefined)?.setData(net.kerbs as never);
        (ml.getSource(arrowPts) as GeoJSONSource | undefined)?.setData(net.arrows as never);
        derived = net.zebras.features as DerivedZebra[];
        showDerived();
        built = area;
        hadNet = true;
      } catch { dirty = true; }
    };
    const schedule = () => { clearTimeout(netTimer); netTimer = setTimeout(() => void rebuild(), 300); };
    const onSource = (e: { sourceId?: string; tile?: unknown }) => { if (e.sourceId === 'ofm' && e.tile) { dirty = true; schedule(); } };
    ml.on('moveend', schedule);
    ml.on('sourcedata', onSource);
    schedule();

    ctx.status({ state: 'ready', note: 'Fahrbahnen und Markierungen aus den Kartenkacheln (ohne OpenStreetMap-Detailabfrage)' });
    const stopOpacity = effect(() => {
      const o = ctx.opacity.value;
      for (const [id, f] of fades) {
        if (!ml.getLayer(id)) continue;
        const v = ['interpolate', ['linear'], ['zoom'], f.z0, 0, f.z1, Math.max(0.03, f.max * o)];
        if (f.prop === 'icon-opacity') ml.setPaintProperty(id, 'icon-opacity', v as never);
        else ml.setPaintProperty(id, f.prop as never, v as never);
      }
    });
    return { destroy: () => { stopOpacity(); ml.off('moveend', onMove); ml.off('moveend', schedule); ml.off('sourcedata', onSource); clearTimeout(netTimer); ml.off('styleimagemissing', onMissing); ctx.map.remove({ layers: [...ids].reverse(), sources: [roads, marks, kerbs, zebras, arrowPts] }); } };
  },
});
