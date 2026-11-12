// Road markings over the basemap, where roads are plain lines: (1) lines derived from the vector tiles (dashed centre
// line, edge lines), (2) markings mapped in OpenStreetMap, loaded from Overpass for the view: zebra crossings, marked
// crossings, road_marking lines, no-overtaking lines and traffic islands. Coverage depends on mapping density.
import { effect } from '@preact/signals';
import type { ExpressionSpecification, GeoJSONSource, LayerSpecification } from 'maplibre-gl';
import { overpassArea } from '../../data/parsers/overpassarea';
import { roadmarkQuery, type MarkProps } from '../../data/parsers/roadmark';
import { defineLayer } from '../define';
import type { InspectCard } from '../types';

const EMPTY = { type: 'FeatureCollection', features: [] } as const;
const WHITE = '#e8ebf0';
const edgeOffset = (s: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 15, 1.3 * s, 18, 3.4 * s] as unknown as ExpressionSpecification;
const MINOR = ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary', 'minor', 'street']]];

export default defineLayer({
  id: 'strassenmarkierungen',
  category: 'verkehr',
  title: 'Straßenmarkierungen',
  summary: 'Mittellinien, Fahrbahnkanten, Zebrastreifen, Sperrlinien und Verkehrsinseln ab Stadtzoom',
  icon: 'car',
  color: '#c9ced8',
  form: 'lines',
  cadence: 'daily',
  coverage: 'Ausschnitt',
  minZoom: 14,
  sources: [{ name: 'OpenStreetMap-Mitwirkende (Overpass API), OpenFreeMap', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0' }],
  legend: { type: 'classes', items: [
    { color: WHITE, label: 'Mittel- und Randlinien (aus Straßenklassen abgeleitet)', shape: 'line' },
    { color: WHITE, label: 'Zebrastreifen und Querungen (OpenStreetMap)', shape: 'line' },
    { color: '#cfd8dc', label: 'Verkehrsinseln', shape: 'square' },
  ] },
  keywords: ['markierung', 'zebrastreifen', 'fahrbahn', 'mittellinie', 'sperrlinie', 'überholverbot', 'verkehrsinsel', 'road markings', 'crossing'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const src = `${ctx.id}.osm`;
    ctx.map.addSource(src, { type: 'geojson', data: EMPTY as never });
    const L = (spec: Record<string, unknown>) => ({ ...spec, type: spec.type ?? 'line' }) as unknown as LayerSpecification;
    const osm = (id: string, kind: unknown, minzoom: number, paint: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      L({ id: `${ctx.id}.${id}`, source: src, minzoom, filter: kind, paint, ...extra });
    const specs: LayerSpecification[] = [
      ...[-1, 1].map((side) => L({
        id: `${ctx.id}.edge${side}`, source: 'ofm', 'source-layer': 'transportation', minzoom: 15, filter: MINOR, layout: { 'line-join': 'round' },
        paint: { 'line-color': WHITE, 'line-width': 0.9, 'line-offset': edgeOffset(side), 'line-opacity': 0.85 },
      })),
      L({
        id: `${ctx.id}.dash`, source: 'ofm', 'source-layer': 'transportation', minzoom: 14, filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
        paint: { 'line-color': WHITE, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.7, 18, 1.6], 'line-dasharray': [1.6, 2.4], 'line-opacity': 0.85 },
      }),
      L({ id: `${ctx.id}.island-fill`, type: 'fill', source: src, minzoom: 14, filter: ['all', ['==', ['get', 'kind'], 'island'], ['==', ['geometry-type'], 'Polygon']], paint: { 'fill-color': '#cfd8dc', 'fill-opacity': 0.4 } }),
      osm('island-line', ['==', ['get', 'kind'], 'island'], 14, { 'line-color': WHITE, 'line-width': 1, 'line-opacity': 0.7 }),
      osm('zebra', ['==', ['get', 'kind'], 'zebra'], 15, { 'line-color': WHITE, 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 2.5, 19, 9], 'line-dasharray': [0.35, 1], 'line-opacity': 0.9 }),
      osm('cross', ['==', ['get', 'kind'], 'cross'], 15, { 'line-color': WHITE, 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.2, 19, 3.2], 'line-dasharray': [2, 2.4], 'line-opacity': 0.8 }),
      osm('line', ['all', ['in', ['get', 'kind'], ['literal', ['marking', 'over']]], ['!=', ['get', 'dash'], true]], 14, { 'line-color': WHITE, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.9, 18, 2], 'line-opacity': 0.9 }, { layout: { 'line-cap': 'butt' } }),
      osm('line-dash', ['all', ['in', ['get', 'kind'], ['literal', ['marking', 'over']]], ['==', ['get', 'dash'], true]], 14, { 'line-color': WHITE, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.9, 18, 2], 'line-dasharray': [1.4, 1.7], 'line-opacity': 0.9 }, { layout: { 'line-cap': 'butt' } }),
    ];
    for (const s of specs) ctx.map.addLayer(s, 'lines');
    const ids = specs.map((s) => s.id);
    const OPACITY: Record<string, 'line-opacity' | 'fill-opacity'> = { fill: 'fill-opacity', line: 'line-opacity' };

    const res = overpassArea(ctx, { parser: 'overpassRoadmarks', query: roadmarkQuery, empty: { type: 'FeatureCollection', features: [] }, minZoom: 14, grid: 0.05 });
    const stopData = effect(() => {
      const d = res.data.value;
      (ml.getSource(src) as GeoJSONSource | undefined)?.setData((d ?? EMPTY) as never);
      const zoomedOut = ml.getZoom() < 14;
      if (d === undefined) ctx.status(res.error.value ? { state: 'error', note: res.error.value } : { state: 'loading' });
      else ctx.status({ state: d.features.length || !zoomedOut ? 'ready' : 'empty', count: d.features.length, updatedAt: res.updatedAt.value, note: d.features.length ? `${d.features.filter((f) => f.properties.kind === 'zebra').length} Zebrastreifen in OpenStreetMap erfasst` : zoomedOut ? undefined : 'In diesem Ausschnitt sind keine Markierungen erfasst' });
    });
    const stopOpacity = effect(() => {
      const o = ctx.opacity.value;
      for (const id of ids) {
        const l = ml.getLayer(id);
        if (l) ml.setPaintProperty(id, OPACITY[l.type] ?? 'line-opacity', Math.max(0.05, 0.9 * o));
      }
    });
    const off = ctx.map.onPick([`${ctx.id}.zebra`, `${ctx.id}.cross`, `${ctx.id}.line`, `${ctx.id}.line-dash`, `${ctx.id}.island-line`], {
      click(f, ll) {
        const p = f.properties as unknown as MarkProps;
        const card: InspectCard = { title: p.title, subtitle: 'Markierung nach OpenStreetMap', icon: 'car', facts: p.marking ? [{ label: 'Markierung', value: p.marking }] : [], links: [{ label: 'OpenStreetMap', url: p.url }], location: [ll[0], ll[1]] };
        ctx.select(card);
      },
    });
    return { destroy: () => { off(); stopData(); stopOpacity(); res.dispose(); ctx.map.remove({ layers: [...ids].reverse(), sources: [src] }); } };
  },
});
