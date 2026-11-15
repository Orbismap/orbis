// Combined airport layer: airports as points at low zoom, airport ground plan from zoom 11, indoor plan from zoom 16.
import { computed, effect, signal } from '@preact/signals';
import { Marker } from 'maplibre-gl';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import { bucketUrl } from '../../data/endpoints';
import { fetchJson } from '../../data/http';
import { airportIndex, airportsInView, overpassQuery, planFromOverpass, planFromStatic, pxPerMetre, runwayEnds, type AirportIndexEntry, type AirportPlan, type PlanLine, type PlanPolygon } from '../../data/parsers/airportplan';
import { indoorLevels, indoorOverpassQuery, indoorPlanFromOverpass, type IndoorFeature } from '../../data/parsers/indoor';
import type { AirportProps } from '../../data/parsers/airports';
import { M_PER_FT } from '../../data/parsers/traffic';
import { formatNumber } from '../../core/format';
import { areaLayer } from '../../render/areas';
import { lineLayer } from '../../render/lines';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const AIRPORT_COLOR = '#90caf9';
const PLAN_COLOR = '#9fb4d0';
const MIN_PLAN_ZOOM = 11;
const MIN_INDOOR_ZOOM = 16;
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const AIRPORTS_URL = `${env.BASE_URL ?? './'}data/airports.json`;
const assetsUrl = (icao: string) => bucketUrl('assets', `data/airports/${icao}.json`);

// ---------- airport point styling ----------
const large = ['interpolate', ['linear'], ['zoom'], 1, 2.5, 5, 4.5, 9, 7, 13, 10] as unknown as ExpressionSpecification;
const medium = ['interpolate', ['linear'], ['zoom'], 6, 2.5, 9, 4.5, 13, 7] as unknown as ExpressionSpecification;

const describeAirport = (f: AnyFeature) => {
  const p = f.properties as AirportProps;
  const code = [p.iata, p.icao].filter(Boolean).join(' / ');
  return {
    title: p.name,
    subtitle: `${code}${p.city ? ` · ${p.city}` : ''}`,
    color: AIRPORT_COLOR,
    icon: 'plane' as const,
    facts: [
      ...(p.iata ? [{ label: 'IATA', value: p.iata, emphasis: true }] : []),
      { label: 'ICAO', value: p.icao },
      ...(p.elevFt !== null && p.elevFt !== undefined ? [{ label: 'Höhe', value: `${formatNumber(Math.round(p.elevFt * M_PER_FT))} m (${formatNumber(p.elevFt)} ft)` }] : []),
      { label: 'Größe', value: p.large ? 'Großflughafen' : 'Regionalflughafen' },
      ...(p.country ? [{ label: 'Land', value: p.country }] : []),
    ],
    text: 'Ab Zoom 11 zeigt die Ebene den Flughafenplan (Pisten, Rollwege, Vorfelder, Gates). Ab Zoom 16 den Innenplan.',
    links: [
      { label: 'Flughafen bei OurAirports', url: `https://ourairports.com/airports/${encodeURIComponent(p.icao)}/` },
      ...(p.iata ? [{ label: 'Abflüge und Ankünfte (OpenSky)', url: `https://opensky-network.org/network/explorer?airport=${encodeURIComponent(p.icao)}` }] : []),
    ],
  };
};

export default defineLayer({
  id: 'flughafen',
  category: 'verkehr',
  title: 'Flughafen',
  summary: 'Flughäfen, ab Zoom 11 Flughafenplan, ab Zoom 16 Innenplan',
  icon: 'plane',
  color: AIRPORT_COLOR,
  form: 'areas',
  cadence: 'static',
  minZoom: 0,
  sources: [
    { name: 'OurAirports', url: 'https://ourairports.com/data/', license: 'gemeinfrei (Public Domain)' },
    { name: 'OpenStreetMap (aeroway=*)', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0' },
    { name: 'OpenStreetMap (Simple Indoor Tagging)', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0' },
  ],
  legend: { type: 'classes', items: [
    { color: '#2b313b', label: 'Piste', shape: 'line' },
    { color: '#4b5360', label: 'Rollweg', shape: 'line' },
    { color: '#3b4960', label: 'Vorfeld', shape: 'square' },
    { color: '#6f86b0', label: 'Terminal, Hangar', shape: 'square' },
    { color: '#ffd166', label: 'Gate, Stellplatz', shape: 'dot' },
  ] },
  keywords: ['flughafen', 'airport', 'iata', 'icao', 'terminal', 'piste', 'runway', 'rollweg', 'gate', 'innen', 'indoor', 'gebäude'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const kitCtx = { ...ctx, status: () => {} } as typeof ctx;

    // ---------- airports (OurAirports) ----------
    const res = ctx.resource<FeatureCollection<Point, AirportProps>>({
      key: 'static:airports',
      url: AIRPORTS_URL,
      parse: 'airportsParse',
    });
    const pick = (isLarge: boolean) =>
      computed<FeatureCollection<Point, AirportProps> | undefined>(() => {
        const d = res.data.value;
        return d ? { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.large === isLarge) } : undefined;
      });
    const big = pick(true);
    const mid = pick(false);

    const zoomSig = signal(ml.getZoom());
    const showAirports = signal(ml.getZoom() < MIN_PLAN_ZOOM);
    const airportFilter = computed<FilterSpecification | undefined>(() => (showAirports.value ? undefined : false));

    // ---------- plan state ----------
    const index = ctx.resource<AirportIndexEntry[]>({ key: 'assets:airports-index', url: bucketUrl('assets', 'data/airports/index.json'), parse: airportIndex, timeout: 20_000 });
    const ourAirports = ctx.resource<FeatureCollection<Point, AirportProps>>({ key: 'static:airports', url: AIRPORTS_URL, parse: 'airportsParse' });

    const plans = signal<AirportPlan[]>([]);
    const planLat = signal(ml.getCenter().lat);
    const planFailed = signal<string | undefined>(undefined);
    const planLoading = signal(0);
    let planCtl = new AbortController();
    const open = new Set<string>();

    const planCache = new Map<string, Promise<AirportPlan>>();
    function loadPlan(a: { icao: string; lng: number; lat: number; prebuilt: boolean }, signal: AbortSignal): Promise<AirportPlan> {
      let p = planCache.get(a.icao);
      if (!p) {
        p = a.prebuilt
          ? fetchJson<unknown>(assetsUrl(a.icao), { timeout: 30_000, signal, revalidate: true }).then((r) => planFromStatic(r.data))
          : (async () => {
              const q = overpassQuery({ west: a.lng - 0.035, south: a.lat - 0.025, east: a.lng + 0.035, north: a.lat + 0.025 });
              let last: unknown;
              for (const host of OVERPASS) {
                try { return planFromOverpass((await fetchJson<unknown>(`${host}?data=${encodeURIComponent(q)}`, { timeout: 50_000, signal })).data, a.icao); } catch (e) { last = e; }
              }
              throw last;
            })();
        planCache.set(a.icao, p);
        p.catch(() => planCache.delete(a.icao));
      }
      return p;
    }

    async function refreshPlan() {
      if (ml.getZoom() < MIN_PLAN_ZOOM - 0.05) return;
      const b = ml.getBounds();
      const view: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const c = ml.getCenter();
      planLat.value = c.lat;
      // index may be loaded via resource; fallback empty
      const idxData = index.data.value ?? [];
      const wanted: { icao: string; lng: number; lat: number; prebuilt: boolean }[] = airportsInView(idxData, view).map((a) => ({ icao: a.icao, lng: (a.bbox[0] + a.bbox[2]) / 2, lat: (a.bbox[1] + a.bbox[3]) / 2, prebuilt: true }));
      if (!wanted.length && ml.getZoom() >= 13) {
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
        planLoading.value++;
        loadPlan(w, planCtl.signal).then((p) => { plans.value = [...plans.peek().filter((x) => x.icao !== p.icao), p].slice(-4); planFailed.value = undefined; }, (e) => { open.delete(w.icao); if (!planCtl.signal.aborted) planFailed.value = e instanceof Error ? e.message : String(e); }).finally(() => { planLoading.value--; });
      }
    }

    // ---------- indoor state ----------
    const indoorCache = new Map<string, IndoorFeature[]>();
    const indoorFeatures = signal<IndoorFeature[]>([]);
    const indoorLevel = signal('');
    const indoorLoading = signal(0);
    const indoorFailed = signal<string | undefined>(undefined);
    let indoorCtl = new AbortController();
    let indoorT: ReturnType<typeof setTimeout> | undefined;

    async function loadIndoor(bbox: [number, number, number, number]) {
      const key = bbox.map((n) => n.toFixed(4)).join(',');
      const cached = indoorCache.get(key);
      if (cached) { indoorFeatures.value = cached; return; }

      // nearest airport within 2.5 km (from airport index, small + fast)
      const c = ml.getCenter();
      let best: { icao: string; lng: number; lat: number; d: number } | undefined;
      for (const a of index.data.value ?? []) {
        const lng = (a.bbox[0] + a.bbox[2]) / 2;
        const lat = (a.bbox[1] + a.bbox[3]) / 2;
        const d = Math.hypot((lng - c.lng) * Math.cos((c.lat * Math.PI) / 180), lat - c.lat) * 111.2;
        if (d < 2.5 && (!best || d < best.d)) best = { icao: a.icao, lng, lat, d };
      }

      indoorLoading.value++;
      try {
        if (best) {
          const cacheKey = `icao:${best.icao}`;
          const cachedStatic = indoorCache.get(cacheKey);
          if (cachedStatic) {
            indoorFeatures.value = cachedStatic;
            indoorFailed.value = undefined;
            indoorLoading.value--;
            return;
          }
          try {
            const r = await fetchJson<unknown>(assetsUrl(best.icao), { timeout: 20_000, signal: indoorCtl.signal, revalidate: true });
            const indoor = (r.data as { indoor?: IndoorFeature[] } | null)?.indoor;
            if (Array.isArray(indoor)) {
              indoorCache.set(cacheKey, indoor);
              indoorCache.set(key, indoor);
              indoorFeatures.value = indoor;
              indoorFailed.value = undefined;
              indoorLoading.value--;
              return;
            }
          } catch (e) {
            if (indoorCtl.signal.aborted) throw e;
            // fall through to Overpass fallback
          }
        }

        // Fallback: Overpass with BBox
        const q = indoorOverpassQuery({ west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3] });
        let last: unknown;
        for (const host of OVERPASS) {
          try {
            const res = await fetchJson<unknown>(`${host}?data=${encodeURIComponent(q)}`, { timeout: 45_000, signal: indoorCtl.signal });
            const parsed = indoorPlanFromOverpass(res.data);
            indoorCache.set(key, parsed);
            indoorFeatures.value = parsed;
            indoorFailed.value = undefined;
            indoorLoading.value--;
            return;
          } catch (e) { last = e; }
        }
        indoorLoading.value--;
        if (!indoorCtl.signal.aborted) indoorFailed.value = last instanceof Error ? last.message : String(last);
      } catch (e) {
        indoorLoading.value--;
        if (!indoorCtl.signal.aborted) indoorFailed.value = e instanceof Error ? e.message : String(e);
      }
    }

    const refreshIndoor = () => {
      if (ml.getZoom() < MIN_INDOOR_ZOOM - 0.05) return;
      const b = ml.getBounds();
      void loadIndoor([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };

    // ---------- events ----------
    let planT: ReturnType<typeof setTimeout> | undefined;
    const onMove = () => {
      clearTimeout(planT);
      clearTimeout(indoorT);
      planT = setTimeout(() => { void refreshPlan(); }, 350);
      indoorT = setTimeout(refreshIndoor, 400);
      updateZoom();
    };
    const updateZoom = () => {
      zoomSig.value = ml.getZoom();
      showAirports.value = ml.getZoom() < MIN_PLAN_ZOOM;
    };
    ml.on('moveend', onMove);
    ml.on('zoomend', updateZoom);
    const stopIdx = effect(() => { index.data.value; ourAirports.data.value; onMove(); });

    // ---------- plan computeds ----------
    const fc = <G extends Polygon | LineString | Point>(features: Feature<G>[]): FeatureCollection<G> => ({ type: 'FeatureCollection', features });
    const SURFACE: Record<string, string> = { asphalt: 'Asphalt', concrete: 'Beton', paved: 'befestigt', grass: 'Gras', gravel: 'Schotter', unpaved: 'unbefestigt', dirt: 'Erde', sand: 'Sand' };

    const polys = computed(() => fc(plans.value.flatMap((p) => p.polygons)) as FeatureCollection<Polygon>);
    const lines = computed(() => plans.value.flatMap((p) => p.lines));
    const runwayLines = computed(() => lines.value.filter((l) => l.properties.kind === 'runway'));
    const taxiLines = computed(() => lines.value.filter((l) => l.properties.kind !== 'runway'));
    const runways = computed(() => fc(runwayLines.value));
    const taxis = computed(() => fc(taxiLines.value));
    const standPoints = computed(() => fc(plans.value.flatMap((p) => p.points.filter((pt) => pt.properties.kind !== 'light' && pt.properties.kind !== 'gate'))));
    const lightPoints = computed(() => fc(plans.value.flatMap((p) => p.points.filter((pt) => pt.properties.kind === 'light'))));

    const widthExpr = computed(() => {
      const k10 = pxPerMetre(10, planLat.value);
      const k21 = pxPerMetre(21, planLat.value);
      return ['interpolate', ['exponential', 2], ['zoom'], 10, ['max', 0.8, ['*', ['get', 'w'], k10]], 21, ['max', 1.5, ['*', ['get', 'w'], k21]]] as unknown as ExpressionSpecification;
    });

    // ---------- indoor computeds ----------
    const levels = computed(() => indoorLevels(indoorFeatures.value));
    const stopLevelSync = effect(() => {
      const ls = levels.value;
      if (!ls.length) { indoorLevel.value = ''; return; }
      if (!ls.includes(indoorLevel.value)) indoorLevel.value = ls[0] ?? '';
    });

    const selected = computed(() => {
      const lv = indoorLevel.value;
      if (!lv) return indoorFeatures.value;
      return indoorFeatures.value.filter((f) => f.properties.level === lv || !f.properties.level);
    });

    const rooms = computed(() => fc(selected.value.filter((f) => f.geometry.type !== 'Point' && f.properties.kind !== 'wall')));
    const walls = computed(() => fc(selected.value.filter((f) => f.geometry.type === 'LineString' && f.properties.kind === 'wall')));
    const extraLines = computed(() => fc(selected.value.filter((f) => f.geometry.type === 'LineString' && f.properties.kind !== 'wall')));
    const indoorPoints = computed(() => fc(selected.value.filter((f) => f.geometry.type === 'Point')));

    // ---------- render: airports ----------
    const label = (name: string, src: string, minzoom: number): any => ({
      id: `${ctx.id}.${name}-labels`, type: 'symbol', source: src, minzoom, maxzoom: 10.9,
      layout: {
        'text-field': ['coalesce', ['get', 'iata'], ['get', 'icao']] as unknown as ExpressionSpecification,
        'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true,
      },
      paint: { 'text-color': '#d8ecff', 'text-halo-color': 'rgba(10, 15, 24, 0.9)', 'text-halo-width': 1.4 },
    });
    const airportHandles = [
      pointLayer(kitCtx, { data: big, resources: [res], name: 'large', radius: large, color: AIRPORT_COLOR, stroke: { color: '#0a0f18', width: 1.5 }, describe: describeAirport, filter: airportFilter }),
      pointLayer(kitCtx, { data: mid, name: 'medium', minZoom: 6, radius: medium, color: '#6fa8d8', stroke: { color: '#0a0f18', width: 1.2 }, describe: describeAirport, filter: airportFilter }),
    ];
    ctx.map.addLayer(label('large', `${ctx.id}.large-src`, 4.5), 'labels');
    ctx.map.addLayer(label('medium', `${ctx.id}.medium-src`, 7), 'labels');

    // ---------- render: plan ----------
    const planHandles = [
      areaLayer(kitCtx, {
        data: polys, name: 'areas', minZoom: MIN_PLAN_ZOOM,
        fill: ['match', ['get', 'kind'], 'apron', '#3b4960', 'terminal', '#6f86b0', 'hangar', '#5d7092', 'building', '#6b7280', 'helipad', '#4a5a74', '#3b4960'] as unknown as ExpressionSpecification,
        fillOpacity: 0.85, outline: { color: '#7d8da6', width: 0.6 },
        describe: (f: AnyFeature) => {
          const p = f.properties as PlanPolygon['properties'];
          const name = { apron: 'Vorfeld', terminal: 'Terminal', hangar: 'Hangar', helipad: 'Hubschrauberlandeplatz' }[p.kind as string] ?? 'Fläche';
          return { title: p.name || name, subtitle: p.name ? name : undefined, color: PLAN_COLOR, icon: 'plane', facts: [...(p.ref ? [{ label: 'Kennung', value: p.ref }] : []), ...(p.h > 0 ? [{ label: 'Höhe', value: `${Math.round(p.h)} m` }] : [])] };
        },
      }),
      lineLayer(kitCtx, { data: taxis, name: 'taxiways', minZoom: MIN_PLAN_ZOOM, color: '#4b5360', width: widthExpr, casing: false, opacity: 1 }),
      lineLayer(kitCtx, {
        data: runways, name: 'runways', minZoom: MIN_PLAN_ZOOM, color: '#2b313b', width: widthExpr, casing: { color: '#1b2433', extra: 1 },
        describe: (f: AnyFeature) => {
          const p = f.properties as PlanLine['properties'];
          return { title: `Piste ${p.ref || ''}`.trim(), color: PLAN_COLOR, icon: 'plane', facts: [{ label: 'Breite', value: `${Math.round(p.w)} m` }, ...(p.surface ? [{ label: 'Belag', value: SURFACE[p.surface] ?? p.surface }] : [])] };
        },
      }),
    ];

    // plan labels
    const lsrc = `${ctx.id}.labels-src`;
    const psrc = `${ctx.id}.stands-src`;
    const tsrc = `${ctx.id}.taxi-src`;
    const rsrc = `${ctx.id}.lights-src`;
    ctx.map.addSource(lsrc, { type: 'geojson', data: fc([]) } as any);
    ctx.map.addSource(psrc, { type: 'geojson', data: fc([]) } as any);
    ctx.map.addSource(tsrc, { type: 'geojson', data: fc([]) } as any);
    ctx.map.addSource(rsrc, { type: 'geojson', data: fc([]) } as any);
    const halo = { 'text-halo-color': 'rgba(10, 15, 24, 0.9)', 'text-halo-width': 1.4 };
    ctx.map.addLayer({ id: `${ctx.id}.stands`, type: 'circle', source: psrc, minzoom: 15.5, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15.5, 1.5, 19, 4], 'circle-color': ['case', ['==', ['get', 'kind'], 'gate'], '#ffd166', '#8ea3c4'], 'circle-stroke-color': 'rgba(10,15,24,0.8)', 'circle-stroke-width': 0.8 } } as any, 'points');
    ctx.map.addLayer({ id: `${ctx.id}.lights`, type: 'circle', source: rsrc, minzoom: 11, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 1, 16, 2.5, 19, 4], 'circle-color': ['match', ['get', 'col'], 'blue', '#4a78ff', 'green', '#2bd47d', 'red', '#ff4b4b', 'yellow', '#ffd23f', '#f4f6f8'] as unknown as ExpressionSpecification, 'circle-opacity': ['match', ['get', 'lt'], 'txc', 0.75, 0.95], 'circle-stroke-width': 0 } } as any, 'points');
    ctx.map.addLayer({ id: `${ctx.id}.stand-labels`, type: 'symbol', source: psrc, minzoom: 17, filter: ['!=', ['get', 'ref'], ''], layout: { 'text-field': ['get', 'ref'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 17, 9, 20, 12], 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#ffe9b0', ...halo } } as any, 'labels');
    ctx.map.addLayer({ id: `${ctx.id}.taxi-labels`, type: 'symbol', source: tsrc, minzoom: 14.5, filter: ['!=', ['get', 'ref'], ''], layout: { 'symbol-placement': 'line', 'text-field': ['get', 'ref'], 'text-font': ['Noto Sans Regular'], 'text-size': 10.5, 'symbol-spacing': 280, 'text-max-angle': 30 }, paint: { 'text-color': '#f4d35e', ...halo } } as any, 'labels');
    ctx.map.addLayer({ id: `${ctx.id}.runway-numbers`, type: 'symbol', source: lsrc, minzoom: 12, layout: { 'text-field': ['get', 'text'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 18, 19, 26], 'text-rotate': ['get', 'rot'], 'text-rotation-alignment': 'map', 'text-pitch-alignment': 'map', 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#ffffff', ...halo } } as any, 'labels');
    const stopPlanLabels = effect(() => {
      const set = (id: string, d: FeatureCollection) => (ml.getSource(id) as { setData(d: unknown): void } | undefined)?.setData(d);
      set(lsrc, fc(runwayEnds(runwayLines.value)));
      set(psrc, standPoints.value);
      set(tsrc, fc(taxiLines.value.filter((f) => f.properties.ref)));
      set(rsrc, lightPoints.value);
    });

    // gate badges as HTML markers (fixed border-radius) with simple collision hiding
    type GateMarker = { marker: Marker; el: HTMLDivElement; coord: [number, number] };
    const gateMarkers: GateMarker[] = [];
    const layoutGateMarkers = () => {
      const kept: { x: number; y: number; w: number; h: number }[] = [];
      for (const g of gateMarkers) {
        if (ml.getZoom() < 15.5) { g.el.style.display = 'none'; continue; }
        const pos = ml.project(g.coord);
        const w = g.el.offsetWidth || 24;
        const h = g.el.offsetHeight || 14;
        const box = { x: pos.x - w / 2, y: pos.y - h / 2, w, h };
        let collide = false;
        for (const k of kept) {
          if (box.x < k.x + k.w && box.x + box.w > k.x && box.y < k.y + k.h && box.y + box.h > k.y) { collide = true; break; }
        }
        if (collide) {
          g.el.style.display = 'none';
        } else {
          g.el.style.display = '';
          kept.push(box);
        }
      }
    };
    const syncGateMarkers = () => {
      for (const g of gateMarkers) g.marker.remove();
      gateMarkers.length = 0;
      if (ml.getZoom() < 15.5) return;
      for (const p of plans.value.flatMap((pl) => pl.points)) {
        if (p.properties.kind !== 'gate' || !p.properties.ref) continue;
        const el = document.createElement('div');
        el.textContent = String(p.properties.ref);
        el.style.cssText = 'background:#e0aa4d;color:#1b2433;font:700 10px/1 system-ui,sans-serif;padding:2px 5px;border-radius:6px;border:2px solid #fff;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.4);opacity:0;transition:opacity 0.35s ease;display:none;';
        const m = new Marker({ element: el, anchor: 'center' }).setLngLat(p.geometry.coordinates as [number, number]).addTo(ml);
        requestAnimationFrame(() => { el.style.opacity = '1'; });
        gateMarkers.push({ marker: m, el, coord: p.geometry.coordinates as [number, number] });
      }
      layoutGateMarkers();
    };
    const stopGateMarkers = effect(() => { plans.value; syncGateMarkers(); });
    const onGateMove = () => layoutGateMarkers();
    ml.on('moveend', onGateMove);
    const onGateZoom = () => syncGateMarkers();
    ml.on('zoomend', onGateZoom);

    // ---------- render: indoor ----------
    const indoorHandles = [
      areaLayer(kitCtx, {
        data: rooms,
        name: 'rooms',
        minZoom: MIN_INDOOR_ZOOM,
        fill: ['match', ['get', 'kind'], 'corridor', '#2a3446', 'shop', '#3b2f4a', 'amenity', '#2f3f3a', 'poi', '#3a3a3a', 'stairs', '#3a3320', 'elevator', '#2a3a3a', '#1f2a3a'] as unknown as ExpressionSpecification,
        fillOpacity: 0.78,
        outline: { color: '#7d8da6', width: 0.5 },
        describe: (f: AnyFeature) => {
          const p = f.properties as IndoorFeature['properties'];
          return { title: p.name || p.kind, subtitle: `Ebene ${p.level || '?'}`, color: PLAN_COLOR, icon: 'map', facts: [...(p.ref ? [{ label: 'Kennung', value: p.ref }] : []), { label: 'Art', value: p.kind }, ...(p.category ? [{ label: 'Kategorie', value: p.category }] : [])] };
        },
      }),
      lineLayer(kitCtx, { data: walls, name: 'walls', minZoom: MIN_INDOOR_ZOOM, color: '#c9d6ea', width: 1.4, casing: false, opacity: 0.95 }),
      lineLayer(kitCtx, { data: extraLines, name: 'paths', minZoom: MIN_INDOOR_ZOOM, color: '#7d8da6', width: 1, casing: false, opacity: 0.7 }),
      pointLayer(kitCtx, {
        data: indoorPoints,
        name: 'points',
        minZoom: MIN_INDOOR_ZOOM,
        radius: 4,
        color: ['match', ['get', 'kind'], 'stairs', '#ffd166', 'elevator', '#7de2d1', 'door', '#ffffff', 'shop', '#c084fc', 'amenity', '#fb7185', 'poi', '#9fb4d0', '#9fb4d0'] as unknown as ExpressionSpecification,
        describe: (f: AnyFeature) => {
          const p = f.properties as IndoorFeature['properties'];
          return { title: p.name || p.kind, subtitle: `Ebene ${p.level || '?'}`, color: PLAN_COLOR, icon: 'map', facts: [{ label: 'Art', value: p.kind }, ...(p.category ? [{ label: 'Kategorie', value: p.category }] : []), ...(p.ref ? [{ label: 'Kennung', value: p.ref }] : [])] };
        },
      }),
    ];

    // indoor level switcher overlay
    const container = ml.getContainer();
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.right = '12px';
    overlay.style.bottom = '90px';
    overlay.style.zIndex = '10';
    overlay.style.display = 'none';
    overlay.style.flexDirection = 'column';
    overlay.style.gap = '4px';
    container.appendChild(overlay);
    const stopOverlay = effect(() => {
      overlay.innerHTML = '';
      const ls = levels.value;
      if (ls.length <= 1) { overlay.style.display = 'none'; return; }
      overlay.style.display = 'flex';
      for (const l of ls) {
        const btn = document.createElement('button');
        btn.textContent = `Ebene ${l}`;
        btn.style.padding = '6px 10px';
        btn.style.borderRadius = '8px';
        btn.style.border = '1px solid rgba(255,255,255,0.25)';
        btn.style.background = l === indoorLevel.value ? '#4DA3FF' : 'rgba(0,0,29,0.85)';
        btn.style.color = '#fff';
        btn.style.cursor = 'pointer';
        btn.style.font = '600 0.75rem/1 Roboto, sans-serif';
        btn.onclick = () => { indoorLevel.value = l; };
        overlay.appendChild(btn);
      }
    });

    // indoor labels
    const indoorLsrc = `${ctx.id}.indoor-labels-src`;
    ctx.map.addSource(indoorLsrc, { type: 'geojson', data: fc([]) } as any);
    ctx.map.addLayer({ id: `${ctx.id}.room-labels`, type: 'symbol', source: indoorLsrc, minzoom: 17, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10.5, 'text-optional': true, 'text-max-width': 8 }, paint: { 'text-color': '#e8eef7', 'text-halo-color': 'rgba(10,15,24,0.9)', 'text-halo-width': 1.2 } } as any, 'labels');
    const stopIndoorLabels = effect(() => {
      const src = ml.getSource(indoorLsrc) as { setData(d: unknown): void } | undefined;
      const feats = rooms.value.features.filter((f: any) => f?.properties?.name);
      src?.setData({ type: 'FeatureCollection', features: feats });
    });

    // ---------- status ----------
    const stopStatus = effect(() => {
      const z = zoomSig.value;
      if (z < MIN_PLAN_ZOOM) {
        const d = res.data.value;
        const err = res.error.value;
        if (d === undefined) {
          if (err) ctx.status({ state: 'error', note: err });
          else ctx.status({ state: 'loading' });
        } else {
          const n = d.features.length;
          ctx.status({ state: n ? 'ready' : 'empty', count: n, note: 'Flughäfen weltweit' });
        }
        return;
      }
      if (z < MIN_INDOOR_ZOOM) {
        const n = plans.value.length;
        if (planLoading.value > 0 && !n) ctx.status({ state: 'loading' });
        else if (planFailed.value && !n) ctx.status({ state: 'error', note: planFailed.value });
        else ctx.status({ state: n ? 'ready' : 'empty', count: n, note: n ? plans.value.map((p) => p.icao).join(', ') : 'Zoome auf einen Flughafen (ab Zoom 11)' });
        return;
      }
      const n = indoorFeatures.value.length;
      if (indoorLoading.value > 0 && !n) ctx.status({ state: 'loading' });
      else if (indoorFailed.value && !n) ctx.status({ state: 'error', note: indoorFailed.value });
      else {
        const ls = indoorLevels(indoorFeatures.value);
        ctx.status({ state: n ? 'ready' : 'empty', count: n, note: n ? `${ls.length} Ebenen` : 'Zoome auf ein Gebäude (ab Zoom 16)' });
      }
    });

    const allHandles = [...airportHandles, ...planHandles, ...indoorHandles];

    return {
      destroy() {
        clearTimeout(planT);
        clearTimeout(indoorT);
        planCtl.abort();
        indoorCtl.abort();
        ml.off('moveend', onMove);
        ml.off('zoomend', updateZoom);
        stopIdx();
        stopLevelSync();
        stopOverlay();
        stopPlanLabels();
        stopGateMarkers();
        for (const g of gateMarkers) g.marker.remove();
        gateMarkers.length = 0;
        ml.off('moveend', onGateMove);
        ml.off('zoomend', onGateZoom);
        stopIndoorLabels();
        stopStatus();
        try { container.removeChild(overlay); } catch { /* */ }
        // remove plan labels
        try { ctx.map.remove({ layers: [`${ctx.id}.runway-numbers`, `${ctx.id}.taxi-labels`, `${ctx.id}.stand-labels`, `${ctx.id}.stands`, `${ctx.id}.lights`], sources: [lsrc, psrc, tsrc, rsrc] }); } catch { /* */ }
        // remove indoor labels
        try { ctx.map.remove({ layers: [`${ctx.id}.room-labels`], sources: [indoorLsrc] }); } catch { /* */ }
        // remove airport labels
        try { ctx.map.remove({ layers: [`${ctx.id}.large-labels`, `${ctx.id}.medium-labels`] }); } catch { /* */ }
        for (const h of allHandles.reverse()) { try { h.destroy(); } catch { /* */ } }
      },
    };
  },
});
