// Airport ground plan (2D) from zoom 11: runways with numbers, taxiways, aprons, terminals, gates and stands from OSM
// `aeroway=*`. 443 airports ship as prebuilt files in the assets bucket (`data/airports/<ICAO>.json`, ~0.5 MB each);
// for every other airport in view (zoom 13+) Overpass answers through the proxy, once per airport (cached).
// The parsed plan keeps heights (`h`, `minh`), widths (`w`) and surfaces, so the later 3D view can extrude it.
import { computed, effect, signal } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import { bucketUrl, proxied } from '../../data/endpoints';
import { fetchJson } from '../../data/http';
import { airportIndex, airportsInView, overpassQuery, planFromOverpass, planFromStatic, pxPerMetre, runwayEnds, type AirportIndexEntry, type AirportPlan, type PlanLine, type PlanPolygon } from '../../data/parsers/airportplan';
import type { AirportProps } from '../../data/parsers/airports';
import { areaLayer } from '../../render/areas';
import { lineLayer } from '../../render/lines';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#9fb4d0';
const MIN_ZOOM = 11;
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const assetsUrl = (icao: string) => bucketUrl('assets', `data/airports/${icao}.json`);
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const AIRPORTS_URL = `${env.BASE_URL ?? './'}data/airports.json`;

const planCache = new Map<string, Promise<AirportPlan>>();
function loadPlan(a: { icao: string; lng: number; lat: number; prebuilt: boolean }, signal: AbortSignal): Promise<AirportPlan> {
  let p = planCache.get(a.icao);
  if (!p) {
    p = a.prebuilt
      ? fetchJson<unknown>(assetsUrl(a.icao), { timeout: 30_000, signal }).then((r) => planFromStatic(r.data))
      : (async () => {
          const q = overpassQuery({ west: a.lng - 0.035, south: a.lat - 0.025, east: a.lng + 0.035, north: a.lat + 0.025 });
          let last: unknown;
          for (const host of OVERPASS) {
            try { return planFromOverpass((await fetchJson<unknown>(proxied(`${host}?data=${encodeURIComponent(q)}`), { timeout: 50_000, signal })).data, a.icao); } catch (e) { last = e; }
          }
          throw last;
        })();
    planCache.set(a.icao, p);
    p.catch(() => planCache.delete(a.icao));
  }
  return p;
}

const fc = <G extends Polygon | LineString | Point>(features: Feature<G>[]): FeatureCollection<G> => ({ type: 'FeatureCollection', features });
const SURFACE: Record<string, string> = { asphalt: 'Asphalt', concrete: 'Beton', paved: 'befestigt', grass: 'Gras', gravel: 'Schotter', unpaved: 'unbefestigt', dirt: 'Erde', sand: 'Sand' };

export default defineLayer({
  id: 'flughafen-plan',
  category: 'verkehr',
  title: 'Flughafenplan',
  summary: 'Pisten, Rollwege, Vorfelder, Terminals und Stellplätze ab Zoom 11',
  icon: 'plane',
  color: COLOR,
  form: 'areas',
  cadence: 'static',
  minZoom: MIN_ZOOM,
  sources: [
    { name: 'OpenStreetMap (aeroway=*)', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0' },
    { name: 'Vorab erzeugte Flughafendateien (443 Flughäfen)', url: 'https://orbis-assets.maltee.dev/data/airports/index.json', license: 'ODbL 1.0 (OpenStreetMap)' },
  ],
  legend: { type: 'classes', items: [{ color: '#d5dbe6', label: 'Piste', shape: 'line' }, { color: '#7d8da6', label: 'Rollweg', shape: 'line' }, { color: '#3b4960', label: 'Vorfeld', shape: 'square' }, { color: '#6f86b0', label: 'Terminal, Hangar', shape: 'square' }, { color: '#ffd166', label: 'Gate, Stellplatz', shape: 'dot' }] },
  keywords: ['flughafen', 'airport', 'piste', 'runway', 'rollweg', 'taxiway', 'gate', 'vorfeld', 'apron', 'terminal'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const index = ctx.resource<AirportIndexEntry[]>({ key: 'assets:airports-index', url: bucketUrl('assets', 'data/airports/index.json'), parse: airportIndex, timeout: 20_000 });
    const ourAirports = ctx.resource<FeatureCollection<Point, AirportProps>>({ key: 'static:airports', url: AIRPORTS_URL, parse: 'airportsParse' });
    const plans = signal<AirportPlan[]>([]);
    const lat = signal(45);
    const failed = signal<string | undefined>(undefined);
    const loading = signal(0);
    let ctl = new AbortController();
    const open = new Set<string>();

    async function refresh() {
      if (ml.getZoom() < MIN_ZOOM - 0.05) return;
      const b = ml.getBounds();
      const view: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const c = ml.getCenter();
      lat.value = c.lat;
      const wanted: { icao: string; lng: number; lat: number; prebuilt: boolean }[] = airportsInView(index.data.value ?? [], view).map((a) => ({ icao: a.icao, lng: (a.bbox[0] + a.bbox[2]) / 2, lat: (a.bbox[1] + a.bbox[3]) / 2, prebuilt: true }));
      if (!wanted.length && ml.getZoom() >= 13) {
        // not prebuilt: the nearest OurAirports airport within 2.5 km of the view centre
        let best: { icao: string; lng: number; lat: number; d: number } | undefined;
        for (const f of ourAirports.data.value?.features ?? []) {
          const [x, y] = f.geometry.coordinates as [number, number];
          const d = Math.hypot((x - c.lng) * Math.cos((c.lat * Math.PI) / 180), y - c.lat) * 111.2;
          if (d < 2.5 && (!best || d < best.d)) best = { icao: f.properties.icao, lng: x, lat: y, d };
        }
        if (best) wanted.push({ ...best, prebuilt: false });
      }
      for (const w of wanted) {
        if (open.has(w.icao)) continue;
        open.add(w.icao);
        loading.value++;
        loadPlan(w, ctl.signal).then((p) => { plans.value = [...plans.peek().filter((x) => x.icao !== p.icao), p].slice(-4); failed.value = undefined; }, (e) => { open.delete(w.icao); if (!ctl.signal.aborted) failed.value = e instanceof Error ? e.message : String(e); }).finally(() => { loading.value--; });
      }
    }
    let t: ReturnType<typeof setTimeout> | undefined;
    const onMove = () => { clearTimeout(t); t = setTimeout(() => { void refresh(); }, 350); };
    ml.on('moveend', onMove);
    const stopIdx = effect(() => { index.data.value; ourAirports.data.value; onMove(); });

    const polys = computed(() => fc(plans.value.flatMap((p) => p.polygons)) as FeatureCollection<Polygon>);
    const lines = computed(() => plans.value.flatMap((p) => p.lines));
    const runwayLines = computed(() => lines.value.filter((l) => l.properties.kind === 'runway'));
    const taxiLines = computed(() => lines.value.filter((l) => l.properties.kind !== 'runway'));
    const runways = computed(() => fc(runwayLines.value));
    const taxis = computed(() => fc(taxiLines.value));
    const points = computed(() => fc(plans.value.flatMap((p) => p.points)));

    // widths in metres -> px at the current latitude (exact for the zoom range 10..21)
    const widthExpr = computed(() => {
      const k10 = pxPerMetre(10, lat.value);
      const k21 = pxPerMetre(21, lat.value);
      return ['interpolate', ['exponential', 2], ['zoom'], 10, ['max', 0.8, ['*', ['get', 'w'], k10]], 21, ['max', 1.5, ['*', ['get', 'w'], k21]]] as unknown as ExpressionSpecification;
    });

    const stopStatus = effect(() => {
      const n = plans.value.length;
      if (loading.value > 0 && !n) ctx.status({ state: 'loading' });
      else if (failed.value && !n) ctx.status({ state: 'error', note: failed.value });
      else ctx.status({ state: n ? 'ready' : 'empty', count: n, note: n ? plans.value.map((p) => p.icao).join(', ') : 'Zoome auf einen Flughafen (ab Zoom 11)' });
    });

    const handles = [
      areaLayer(ctx, {
        data: polys, name: 'areas', minZoom: MIN_ZOOM,
        fill: ['match', ['get', 'kind'], 'apron', '#3b4960', 'terminal', '#6f86b0', 'hangar', '#5d7092', 'helipad', '#4a5a74', '#3b4960'] as unknown as ExpressionSpecification,
        fillOpacity: 0.85, outline: { color: '#7d8da6', width: 0.6 },
        describe: (f: AnyFeature) => {
          const p = f.properties as PlanPolygon['properties'];
          const name = { apron: 'Vorfeld', terminal: 'Terminal', hangar: 'Hangar', helipad: 'Hubschrauberlandeplatz' }[p.kind as string] ?? 'Fläche';
          return { title: p.name || name, subtitle: p.name ? name : undefined, color: COLOR, icon: 'plane', facts: [...(p.ref ? [{ label: 'Kennung', value: p.ref }] : []), ...(p.h > 0 ? [{ label: 'Höhe', value: `${Math.round(p.h)} m` }] : [])] };
        },
      }),
      lineLayer(ctx, { data: taxis, name: 'taxiways', minZoom: MIN_ZOOM, color: '#7d8da6', width: widthExpr, casing: false, opacity: 0.95 }),
      lineLayer(ctx, {
        data: runways, name: 'runways', minZoom: MIN_ZOOM, color: '#d5dbe6', width: widthExpr, casing: { color: '#1b2433', extra: 1 },
        describe: (f: AnyFeature) => {
          const p = f.properties as PlanLine['properties'];
          return { title: `Piste ${p.ref || ''}`.trim(), color: COLOR, icon: 'plane', facts: [{ label: 'Breite', value: `${Math.round(p.w)} m` }, ...(p.surface ? [{ label: 'Belag', value: SURFACE[p.surface] ?? p.surface }] : [])] };
        },
      }),
    ];

    // labels and stands in an own source: runway numbers, taxiway names, gates
    const lsrc = `${ctx.id}.labels-src`;
    const psrc = `${ctx.id}.stands-src`;
    const tsrc = `${ctx.id}.taxi-src`;
    ctx.map.addSource(lsrc, { type: 'geojson', data: fc([]) });
    ctx.map.addSource(psrc, { type: 'geojson', data: fc([]) });
    ctx.map.addSource(tsrc, { type: 'geojson', data: fc([]) });
    const halo = { 'text-halo-color': 'rgba(10, 15, 24, 0.9)', 'text-halo-width': 1.4 };
    ctx.map.addLayer({
      id: `${ctx.id}.stands`, type: 'circle', source: psrc, minzoom: 15.5,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15.5, 1.5, 19, 4], 'circle-color': ['case', ['==', ['get', 'kind'], 'gate'], '#ffd166', '#8ea3c4'], 'circle-stroke-color': 'rgba(10,15,24,0.8)', 'circle-stroke-width': 0.8 },
    } as never, 'points');
    ctx.map.addLayer({
      id: `${ctx.id}.stand-labels`, type: 'symbol', source: psrc, minzoom: 17, filter: ['!=', ['get', 'ref'], ''],
      layout: { 'text-field': ['get', 'ref'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 17, 9, 20, 12], 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true },
      paint: { 'text-color': '#ffe9b0', ...halo },
    } as never, 'labels');
    ctx.map.addLayer({
      id: `${ctx.id}.taxi-labels`, type: 'symbol', source: tsrc, minzoom: 14.5, filter: ['!=', ['get', 'ref'], ''],
      layout: { 'symbol-placement': 'line', 'text-field': ['get', 'ref'], 'text-font': ['Noto Sans Regular'], 'text-size': 10.5, 'symbol-spacing': 280, 'text-max-angle': 30 },
      paint: { 'text-color': '#f4d35e', ...halo },
    } as never, 'labels');
    ctx.map.addLayer({
      id: `${ctx.id}.runway-numbers`, type: 'symbol', source: lsrc, minzoom: 12,
      layout: { 'text-field': ['get', 'text'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 18, 19, 26], 'text-rotate': ['get', 'rot'], 'text-rotation-alignment': 'map', 'text-pitch-alignment': 'map', 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': '#ffffff', ...halo },
    } as never, 'labels');
    const stopLabels = effect(() => {
      const set = (id: string, d: FeatureCollection) => (ml.getSource(id) as { setData(d: unknown): void } | undefined)?.setData(d);
      set(lsrc, fc(runwayEnds(runwayLines.value)));
      set(psrc, points.value);
      set(tsrc, fc(taxiLines.value.filter((f) => f.properties.ref)));
    });

    return {
      destroy() {
        clearTimeout(t);
        ctl.abort();
        ctl = new AbortController();
        ml.off('moveend', onMove);
        stopIdx(); stopStatus(); stopLabels();
        ctx.map.remove({ layers: [`${ctx.id}.runway-numbers`, `${ctx.id}.taxi-labels`, `${ctx.id}.stand-labels`, `${ctx.id}.stands`], sources: [lsrc, psrc, tsrc] });
        for (const h of handles.reverse()) h.destroy();
      },
    };
  },
});
