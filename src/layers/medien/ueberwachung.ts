// Surveillance cameras (OpenStreetMap): density heatmap from heat/cctv.json at low zoom,
// individual cameras from cctv.pmtiles from zoom 9 on.
import { effect } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatInt } from '../../core/format';
import { bucketUrl } from '../../data/endpoints';
import type { HeatCollection } from '../../data/parsers/heat';
import { pmtilesLayer } from '../../render/pmtiles';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#B388FF';
const DETAIL_ZOOM = 9;
const AREA: Record<string, { label: string; color: string }> = {
  public: { label: 'Öffentlicher Raum', color: '#C9A8FF' },
  outdoor: { label: 'Außen (privat)', color: '#7FA2FF' },
  indoor: { label: 'Innenraum', color: '#8E93AD' },
};
const TYPE: Record<string, string> = { fixed: 'fest', dome: 'Kuppel', panning: 'Schwenkkamera', ptz: 'PTZ-Kamera' };
const MOUNT: Record<string, string> = { pole: 'Mast', wall: 'Wand', street_lamp: 'Laterne', ceiling: 'Decke', bridge: 'Brücke', traffic_signals: 'Ampel', building: 'Gebäude', roof: 'Dach' };
const compass = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

export default defineLayer({
  id: 'ueberwachung',
  category: 'medien',
  title: 'Überwachungskameras',
  summary: 'Dichte der Videoüberwachung weltweit, einzelne Kameras ab Zoomstufe 9',
  icon: 'camera',
  color: COLOR,
  form: 'points',
  cadence: 'static',
  sources: [
    { name: 'OpenStreetMap-Mitwirkende (Geofabrik-Auszüge, Kameras)', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'osm', key: 'cctv.pmtiles' } },
    { name: 'OpenStreetMap-Mitwirkende (Dichtegitter)', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'osm', key: 'heat/cctv.json' } },
  ],
  legend: { type: 'classes', items: Object.values(AREA).map((a) => ({ color: a.color, label: a.label })) },
  keywords: ['cctv', 'kamera', 'überwachung', 'video', 'sicherheit', 'surveillance', 'osm'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const heat = ctx.resource<HeatCollection>({ key: 'osm:heat-cctv', url: bucketUrl('osm', 'heat/cctv.json'), parse: 'heatCells', timeout: 60_000 });

    const src = `${ctx.id}.heat-src`;
    const layer = `${ctx.id}.heat-density`;
    ctx.map.addSource(src, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const base = 0.9;
    ctx.map.addLayer({
      id: layer, type: 'heatmap', source: src, maxzoom: DETAIL_ZOOM + 2,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'n'], 1, 0.06, 10, 0.22, 100, 0.6, 500, 1],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 5, 7, 8, 14, 11, 24],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.15, 5, 0.3, 8, 0.8, 11, 1],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 6, base, DETAIL_ZOOM, base * 0.7, DETAIL_ZOOM + 2, 0],
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(179,136,255,0)', 0.2, 'rgba(150,110,255,0.4)', 0.5, '#B388FF', 0.8, '#E3D4FF', 1, '#FFFFFF'],
      },
    }, 'areas');
    const stopData = effect(() => {
      const d = heat.data.value;
      (ml.getSource(src) as { setData(d: unknown): void } | undefined)?.setData(d ?? { type: 'FeatureCollection', features: [] });
    });
    const stopStatus = effect(() => {
      const d = heat.data.value;
      const err = heat.error.value;
      if (!d) ctx.status(err ? { state: 'error', note: err } : { state: 'loading' });
      else ctx.status({ state: 'ready', count: d.features.reduce((s, f) => s + f.properties.n, 0), updatedAt: heat.updatedAt.value, note: ml.getZoom() < DETAIL_ZOOM ? 'Dichte, einzelne Kameras ab Zoomstufe 9' : undefined });
    });
    const stopOpacity = effect(() => {
      const o = ctx.opacity.value;
      if (ml.getLayer(layer)) ml.setPaintProperty(layer, 'heatmap-opacity', ['interpolate', ['linear'], ['zoom'], 6, base * o, DETAIL_ZOOM, base * 0.7 * o, DETAIL_ZOOM + 2, 0] as unknown as ExpressionSpecification);
    });

    // detail reports no status of its own (the heat grid carries count and age)
    const detail = pmtilesLayer({ ...ctx, status: () => {} }, {
      url: bucketUrl('osm', 'cctv.pmtiles'),
      sourceLayer: 'cctv',
      minZoom: DETAIL_ZOOM,
      radius: ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 2.2, 13, 4, 16, 7] as ExpressionSpecification,
      color: ['match', ['get', 'surveillance'], 'public', AREA.public!.color, 'outdoor', AREA.outdoor!.color, 'indoor', AREA.indoor!.color, COLOR] as unknown as ExpressionSpecification,
      stroke: { color: 'rgba(20, 10, 40, 0.85)', width: 0.8 },
      describe: (f: AnyFeature) => {
        const p = f.properties as { id: number; surveillance?: string; ctype?: string; mount?: string; guard?: number; operator?: string; dir?: number };
        const area = AREA[p.surveillance ?? ''];
        return {
          title: p.guard ? 'Wachpersonal / Sicherheitsdienst' : 'Überwachungskamera',
          subtitle: [p.ctype && (TYPE[p.ctype] ?? p.ctype), p.operator].filter(Boolean).join(' · ') || 'OpenStreetMap',
          color: area?.color ?? COLOR,
          icon: 'camera',
          facts: [
            ...(area ? [{ label: 'Überwachter Bereich', value: area.label }] : []),
            ...(p.ctype ? [{ label: 'Bauart', value: TYPE[p.ctype] ?? p.ctype }] : []),
            ...(p.mount ? [{ label: 'Montage', value: MOUNT[p.mount] ?? p.mount }] : []),
            ...(p.dir != null && p.dir >= 0 ? [{ label: 'Blickrichtung', value: `${formatInt(p.dir)}° (${compass[Math.round(p.dir / 45) % 8]})` }] : []),
            ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
          ],
          links: [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/node/${p.id}` }],
        };
      },
    });

    return {
      destroy() {
        stopData(); stopStatus(); stopOpacity();
        detail.destroy();
        ctx.map.remove({ layers: [layer], sources: [src] });
      },
    };
  },
});
