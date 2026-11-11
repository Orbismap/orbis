// NASA FIRMS (VIIRS) active fire detections: heatmap when zoomed out, single detections up close.
// Own layers instead of a kit: the heatmap layer type has no kit, the rest is the same pattern as pointLayer.
import { computed, effect } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification, MapGeoJSONFeature } from 'maplibre-gl';
import { formatAge, formatDateTime, formatNumber, withUnit } from '../../core/format';
import { MINUTE } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import type { FireCollection, FireProps } from '../../data/parsers/firms';
import { Cleanup, EMPTY_FC, idBase, trackStatus } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#FF7A1A';
const ex = (e: unknown) => e as ExpressionSpecification;

export default defineLayer({
  id: 'feuer',
  category: 'gefahren',
  title: 'Brände',
  summary: 'Aktive Feuer der letzten Stunden aus Satellitenmessungen, Helligkeit nach Feuerleistung',
  icon: 'flame',
  color: COLOR,
  form: 'points',
  cadence: 'minutes',
  sources: [{ name: 'NASA FIRMS (VIIRS)', url: 'https://firms.modaps.eosdis.nasa.gov/', license: 'NASA, frei nutzbar mit Quellenangabe', manifest: { bucket: 'live', key: 'firms/world.json' } }],
  time: { mode: 'window', range: () => ({ start: -48 * 3600_000, end: 0, step: 3600_000 }) },
  options: [
    { id: 'hours', label: 'Zeitfenster', type: 'range', min: 3, max: 48, step: 1, default: 48, unit: 'h' },
    { id: 'minFrp', label: 'Mindest-Feuerleistung', type: 'range', min: 0, max: 100, step: 5, default: 0, unit: 'MW' },
    { id: 'high', label: 'Nur sichere Erkennungen', type: 'toggle', default: false },
  ],
  legend: () => ({
    type: 'scale',
    unit: 'Alter der Erkennung',
    stops: [[0, '#FFF1A8'], [3, '#FF8A1F'], [12, '#E5501A'], [24, '#9C2E12']],
    ticks: [0, 3, 12, 24],
    format: (v) => `${v} h`,
  }),
  keywords: ['feuer', 'brand', 'waldbrand', 'fire', 'hotspot', 'firms', 'viirs', 'wildfire', 'buschfeuer'],

  mount(ctx) {
    const res = ctx.resource<FireCollection>({
      key: 'live:firms-world',
      url: bucketUrl('live', 'firms/world.json'),
      parse: 'firmsFires',
      refresh: 10 * MINUTE,
      timeout: 60_000,
    });
    const ml = ctx.map.ml;
    const ageColor = (nowMin: number) => ex(['interpolate', ['linear'], ['-', nowMin, ['get', 't']], 0, '#FFF1A8', 180, '#FF8A1F', 720, '#E5501A', 1440, '#9C2E12']);
    const base = idBase(ctx);
    const src = `${base}-src`;
    const heat = `${base}-heat`;
    const dots = `${base}-dots`;
    const clean = new Cleanup();

    ctx.map.addSource(src, { type: 'geojson', data: EMPTY_FC });

    // window [from, to] in minutes since 1970
    const range = computed(() => {
      const to = Math.floor(ctx.time.value / 60_000);
      return { from: to - Number(ctx.options.value.hours ?? 48) * 60, to };
    });
    const filter = computed<FilterSpecification>(() => {
      const o = ctx.options.value;
      const r = range.value;
      const f: unknown[] = ['all', ['<=', ['get', 't'], r.to], ['>=', ['get', 't'], r.from]];
      if (Number(o.minFrp) > 0) f.push(['>=', ['get', 'frp'], Number(o.minFrp)]);
      if (o.high) f.push(['>=', ['get', 'c'], 2]);
      return f as FilterSpecification;
    });
    const count = computed(() => {
      const d = res.data.value;
      if (!d) return undefined;
      const r = range.value;
      const o = ctx.options.value;
      const minFrp = Number(o.minFrp);
      let n = 0;
      for (const f of d.features) {
        const p = f.properties;
        if (p.t <= r.to && p.t >= r.from && p.frp >= minFrp && (!o.high || p.c >= 2)) n++;
      }
      return n;
    });

    ctx.map.addLayer(
      {
        id: heat, type: 'heatmap', source: src, maxzoom: 9, filter: filter.peek(),
        paint: {
          'heatmap-weight': ex(['interpolate', ['linear'], ['get', 'frp'], 0, 0.12, 10, 0.35, 100, 1]),
          'heatmap-intensity': ex(['interpolate', ['linear'], ['zoom'], 0, 0.15, 3, 0.35, 5, 0.8, 8, 1.8]),
          'heatmap-radius': ex(['interpolate', ['linear'], ['zoom'], 0, 2, 3, 5, 6, 9, 9, 16]),
          'heatmap-color': ex([
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)', 0.08, 'rgba(110,20,0,0.35)', 0.25, 'rgba(190,50,10,0.65)', 0.5, 'rgba(255,110,25,0.85)', 0.78, 'rgba(255,178,40,0.95)', 1, 'rgba(255,222,110,1)',
          ]),
          'heatmap-opacity': 0.9,
        },
      },
      'areas',
    );
    ctx.map.addLayer(
      {
        id: dots, type: 'circle', source: src, minzoom: 5.5, filter: filter.peek(),
        layout: { 'circle-sort-key': ex(['get', 'frp']) },
        paint: {
          'circle-radius': ex(['interpolate', ['linear'], ['zoom'], 5.5, ['interpolate', ['linear'], ['get', 'frp'], 0, 1.5, 50, 3.5, 500, 7], 12, ['interpolate', ['linear'], ['get', 'frp'], 0, 4, 50, 9, 500, 20]]),
          'circle-color': ageColor(range.peek().to),
          'circle-opacity': 0.9,
          'circle-stroke-color': 'rgba(10,15,24,0.8)',
          'circle-stroke-width': 0.8,
          'circle-pitch-alignment': 'map',
        },
      },
      'points',
    );

    // data, filter, colour by age relative to the selected time, opacity
    clean.add(effect(() => ((ml.getSource(src) as { setData(d: unknown): void } | undefined)?.setData(res.data.value ?? EMPTY_FC))));
    clean.add(effect(() => { const f = filter.value; for (const id of [heat, dots]) if (ml.getLayer(id)) ml.setFilter(id, f); }));
    clean.add(effect(() => {
      const nowMin = range.value.to;
      if (ml.getLayer(dots)) ml.setPaintProperty(dots, 'circle-color', ageColor(nowMin));
    }));
    clean.add(effect(() => {
      const o = ctx.opacity.value;
      if (ml.getLayer(heat)) ml.setPaintProperty(heat, 'heatmap-opacity', ex(['interpolate', ['linear'], ['zoom'], 5.5, 0.9 * o, 8.5, 0.12 * o]));
      if (ml.getLayer(dots)) {
        ml.setPaintProperty(dots, 'circle-opacity', 0.9 * o);
        ml.setPaintProperty(dots, 'circle-stroke-opacity', o);
      }
    }));
    clean.add(trackStatus(ctx, res.data as never, [res], count));

    clean.add(
      ctx.map.onPick([dots], {
        click(f: MapGeoJSONFeature) {
          const p = f.properties as unknown as FireProps;
          const t = p.t * 60_000;
          const c = (f.geometry as unknown as { coordinates: number[] }).coordinates;
          ctx.select({
            title: 'Aktives Feuer',
            subtitle: p.c >= 2 ? 'Sichere Erkennung' : 'Erkennung mit mittlerer Sicherheit',
            time: t,
            color: COLOR,
            icon: 'flame',
            facts: [
              { label: 'Feuerleistung', value: withUnit(formatNumber(p.frp, p.frp < 10 ? 1 : 0), 'MW'), emphasis: true },
              { label: 'Erkannt', value: `${formatDateTime(t)} (${formatAge(t)})` },
              { label: 'Satellit', value: 'VIIRS (Suomi NPP, NOAA-20/21)' },
            ],
            text: 'Wärmeanomalie im Satellitenbild, kein bestätigter Brand: Auch Gasfackeln und Industrie können auftauchen.',
            links: [{ label: 'NASA FIRMS Karte', url: `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${c[0]!.toFixed(2)},${c[1]!.toFixed(2)},10z` }],
            location: [c[0]!, c[1]!],
          });
        },
      }),
    );

    return {
      destroy() {
        clean.run();
        ctx.map.remove({ layers: [dots, heat], sources: [src] });
      },
    };
  },
});
