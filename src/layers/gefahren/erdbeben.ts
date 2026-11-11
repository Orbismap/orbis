// Reference layer: points from two resources (USGS world + EMSC Europe), merged, styled by magnitude and age.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { convert, formatQuantity } from '../../core/units';
import { formatAge, formatDateTime, formatNumber } from '../../core/format';
import { DAY, MINUTE } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import { fetchJson } from '../../data/http';
import { mergeQuakes, type QuakeCollection, type QuakeProps } from '../../data/parsers/quakes';
import { usgsQuakes } from '../../data/parsers/usgs';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#F2B45A';
const USGS_ORIGINAL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson';

/** Radius in px by magnitude, growing with zoom. */
const radius = ['interpolate', ['linear'], ['zoom'],
  1, ['interpolate', ['linear'], ['get', 'mag'], 1.5, 2, 4, 3.5, 6, 7, 8, 12],
  8, ['interpolate', ['linear'], ['get', 'mag'], 1.5, 5, 4, 9, 6, 18, 8, 32],
] as ExpressionSpecification;

/** Fresh events bright, older ones dim; age is measured against the selected time. */
const ageColor = (now: number) => ['interpolate', ['linear'], ['-', now, ['get', 'time']],
  0, '#fff3c4', 3 * 3600_000, '#ffd07a', 24 * 3600_000, '#f2a24a', 3 * DAY, '#c9703a', 7 * DAY, '#7a5a4a',
] as ExpressionSpecification;

export default defineLayer({
  id: 'erdbeben',
  category: 'gefahren',
  title: 'Erdbeben',
  summary: 'Beben der letzten 7 Tage, Größe nach Stärke, Helligkeit nach Alter',
  icon: 'quake',
  color: COLOR,
  form: 'points',
  cadence: 'minutes',
  sources: [
    { name: 'USGS Earthquake Hazards Program', url: 'https://earthquake.usgs.gov/earthquakes/feed/', license: 'gemeinfrei (US-Regierung)', manifest: { bucket: 'live', key: 'events/usgs-2.5_week.geojson' } },
    { name: 'EMSC (Europa)', url: 'https://www.emsc-csem.org/', license: 'EMSC, Quellenangabe', manifest: { bucket: 'live', key: 'events/emsc-europe.json' } },
  ],
  time: { mode: 'window', range: () => ({ start: -7 * DAY, end: 0, step: 3600_000 }) },
  options: [{ id: 'minMag', label: 'Mindeststärke', type: 'range', min: 1.5, max: 7, step: 0.1, default: 2.5, unit: 'M' }],
  legend: () => ({
    type: 'size', unit: 'Magnitude', color: COLOR,
    items: [{ size: 3, label: 'M 2' }, { size: 6, label: 'M 4' }, { size: 12, label: 'M 6' }, { size: 22, label: 'M 8' }],
  }),
  keywords: ['beben', 'seismik', 'earthquake', 'usgs', 'emsc'],

  mount(ctx) {
    const usgs = ctx.resource<QuakeCollection>({
      key: 'live:usgs-2.5_week',
      url: bucketUrl('live', 'events/usgs-2.5_week.geojson'),
      parse: 'usgsQuakes',
      refresh: 5 * MINUTE,
      fallback: async () => usgsQuakes((await fetchJson(USGS_ORIGINAL)).data),
    });
    const emsc = ctx.resource<QuakeCollection>({
      key: 'live:emsc-europe',
      url: bucketUrl('live', 'events/emsc-europe.json'),
      parse: 'emscQuakes',
      refresh: 5 * MINUTE,
    });

    // merged and reduced to what the options and the selected time allow: map, feed and count all see the same set
    const visible = computed<QuakeCollection | undefined>(() => {
      const u = usgs.data.value;
      const e = emsc.data.value;
      if (!u && !e) return undefined;
      const min = Number(ctx.options.value.minMag ?? 2.5);
      const t = ctx.time.value;
      const m = mergeQuakes([u, e]);
      return { type: 'FeatureCollection', features: m.features.filter((f) => f.properties.mag >= min && f.properties.time <= t) };
    });
    const color = computed(() => ageColor(ctx.time.value));

    return pointLayer(ctx, {
      data: visible,
      resources: [usgs, emsc],
      radius,
      color,
      sortKey: ['-', ['get', 'mag']] as ExpressionSpecification, // larger events on top
      describe: (f: AnyFeature) => {
        const p = f.properties as QuakeProps;
        return {
          title: p.place,
          subtitle: `Magnitude ${formatNumber(p.mag, 1)}`,
          time: p.time,
          color: COLOR,
          icon: 'quake',
          facts: [
            { label: 'Stärke', value: `M ${formatNumber(p.mag, 1)}`, emphasis: true },
            { label: 'Tiefe', value: formatQuantity('distance', p.depth, { digits: convert('distance', p.depth) < 10 ? 1 : 0 }) },
            { label: 'Zeit', value: `${formatDateTime(p.time)} (${formatAge(p.time)})` },
            { label: 'Quelle', value: p.src === 'usgs' ? 'USGS' : 'EMSC' },
            ...(p.tsunami ? [{ label: 'Hinweis', value: 'Tsunami-Meldung' }] : []),
          ],
          links: [{ label: p.src === 'usgs' ? 'Seite beim USGS' : 'Seite beim EMSC', url: p.url }],
        };
      },
      feed: (features) =>
        [...features]
          .sort((a, b) => b.properties.time - a.properties.time)
          .slice(0, 200)
          .map((f) => {
            const p = f.properties as QuakeProps;
            const c = (f.geometry as { coordinates: number[] }).coordinates;
            return { id: p.id, title: `M ${formatNumber(p.mag, 1)}`, subtitle: p.place, time: p.time, magnitude: p.mag, color: COLOR, location: [c[0]!, c[1]!] as [number, number] };
          }),
    });
  },
});
