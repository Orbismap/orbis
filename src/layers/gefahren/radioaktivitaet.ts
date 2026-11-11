// Ambient gamma dose rate (µSv/h) from national networks (DE, FI, CA) and Safecast citizen sensors.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatAge, formatDateTime, formatNumber, withUnit } from '../../core/format';
import { HOUR, MINUTE } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import { fetchJson } from '../../data/http';
import { bfsDose, type DoseCollection, type DoseProps } from '../../data/parsers/radiation';
import type { AnyFeature } from '../../render/common';
import { pointLayer } from '../../render/points';
import { defineLayer } from '../define';

/** Dose rate stops (µSv/h): calm greens for the natural background, warm colours only when it gets elevated. */
const STOPS: [number, string][] = [
  [0.05, '#2E9E86'],
  [0.12, '#4DBF8B'],
  [0.2, '#8FD16A'],
  [0.3, '#F1D23A'],
  [0.5, '#FF9A1F'],
  [1, '#F4511E'],
  [5, '#C2185B'],
  [20, '#8E24AA'],
];
const NETS = {
  bfs: { name: 'BfS ODL-Messnetz', country: 'Deutschland', basis: 'Stundenmittel', url: 'https://odlinfo.bfs.de/', license: 'DL-DE/BY-2.0' },
  stuk: { name: 'STUK / FMI', country: 'Finnland', basis: '10-Minuten-Mittel', url: 'https://www.stuk.fi/en', license: 'CC BY 4.0' },
  hc: { name: 'Health Canada FPSN', country: 'Kanada', basis: 'Messwert der Station', url: 'https://open.canada.ca/', license: 'OGL-Canada' },
  safecast: { name: 'Safecast', country: 'Bürgermessnetz', basis: 'Messwert eines privaten Sensors', url: 'https://map.safecast.org/', license: 'CC0' },
} as const;

const colorAt = (v: number) => {
  if (v <= STOPS[0]![0]) return STOPS[0]![1];
  for (let i = STOPS.length - 1; i >= 0; i--) if (v >= STOPS[i]![0]) return STOPS[i]![1];
  return STOPS[0]![1];
};
const rating = (v: number) => (v < 0.2 ? 'unauffällig (natürlicher Untergrund)' : v < 0.5 ? 'leicht erhöht' : v < 1 ? 'erhöht' : v < 10 ? 'deutlich erhöht' : 'stark erhöht');
const dose = (v: number) => withUnit(formatNumber(v, v < 1 ? 3 : 2), 'µSv/h');

export default defineLayer({
  id: 'radioaktivitaet',
  category: 'gefahren',
  title: 'Radioaktivität',
  summary: 'Gamma-Ortsdosisleistung der Messnetze in Deutschland, Finnland und Kanada sowie Safecast, grün = unauffällig',
  icon: 'radiation',
  color: '#8FD16A',
  form: 'points',
  cadence: 'hourly',
  coverage: 'DE, FI, CA und Safecast',
  sources: [
    { name: 'Bundesamt für Strahlenschutz (ODL)', url: 'https://odlinfo.bfs.de/', license: 'DL-DE/BY-2.0', manifest: { bucket: 'live', key: 'bfs-odl.json' } },
    { name: 'STUK / Finnish Meteorological Institute', url: 'https://en.ilmatieteenlaitos.fi/open-data', license: 'CC BY 4.0', manifest: { bucket: 'live', key: 'stuk-fi.json' } },
    { name: 'Health Canada', url: 'https://open.canada.ca/', license: 'OGL-Canada', manifest: { bucket: 'live', key: 'hc-ca.json' } },
    { name: 'Safecast', url: 'https://safecast.org/', license: 'CC0', manifest: { bucket: 'live', key: 'safecast.json' } },
  ],
  options: [{ id: 'minDose', label: 'Nur ab Dosisleistung', type: 'range', min: 0, max: 1, step: 0.05, default: 0, unit: 'µSv/h' }],
  legend: () => ({
    type: 'scale',
    unit: 'µSv/h',
    stops: STOPS,
    ticks: [0.05, 0.1, 0.2, 0.5, 1, 5],
    format: (v) => formatNumber(v, v < 1 ? 2 : 0),
  }),
  keywords: ['radioaktivität', 'strahlung', 'gamma', 'dosis', 'odl', 'bfs', 'safecast', 'radiation', 'sievert', 'strahlenschutz'],

  mount(ctx) {
    const res = (key: string, parse: 'bfsDose' | 'stukDose' | 'hcDose' | 'safecastDose', file: string, fallback?: () => Promise<DoseCollection>) =>
      ctx.resource<DoseCollection>({ key: `live:${key}`, url: bucketUrl('live', file), parse, refresh: 30 * MINUTE, timeout: 40_000, fallback });
    const feeds = [
      res('bfs-odl', 'bfsDose', 'bfs-odl.json', async () =>
        bfsDose((await fetchJson('https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=opendata:odlinfo_odl_1h_latest&outputFormat=application/json', { timeout: 40_000 })).data)),
      res('stuk-fi', 'stukDose', 'stuk-fi.json'),
      res('hc-ca', 'hcDose', 'hc-ca.json'),
      res('safecast', 'safecastDose', 'safecast.json'),
    ];
    const visible = computed<DoseCollection | undefined>(() => {
      const parts = feeds.map((r) => r.data.value);
      if (parts.every((p) => !p)) return undefined;
      const min = Number(ctx.options.value.minDose ?? 0);
      const stale = Date.now() - 48 * HOUR;
      // values older than 2 days (not Safecast, whose devices report sparsely) are not "now"
      const features = parts.flatMap((p) => p?.features ?? []).filter((f) => f.properties.v >= min && (f.properties.net === 'safecast' || !f.properties.t || f.properties.t >= stale));
      return { type: 'FeatureCollection', features };
    });
    const interp = (a: number, b: number): ExpressionSpecification => ['interpolate', ['linear'], ['get', 'v'], 0.05, a, 0.3, a + (b - a) * 0.3, 1, a + (b - a) * 0.6, 5, b] as ExpressionSpecification;

    return pointLayer(ctx, {
      data: visible,
      resources: feeds,
      idKey: 'id',
      radius: ['interpolate', ['linear'], ['zoom'], 1, interp(1.8, 6), 4, interp(2.6, 8), 9, interp(5, 14)] as ExpressionSpecification,
      color: ['interpolate', ['linear'], ['get', 'v'], ...STOPS.flat()] as ExpressionSpecification,
      stroke: { color: 'rgba(10,15,24,0.7)', width: 0.8 },
      sortKey: ['get', 'v'] as ExpressionSpecification,
      describe: (f: AnyFeature) => {
        const p = f.properties as DoseProps;
        const n = NETS[p.net];
        return {
          title: p.name,
          subtitle: `${n.name} · ${n.country}`,
          time: p.t || undefined,
          color: colorAt(p.v),
          icon: 'radiation',
          facts: [
            { label: 'Dosisleistung', value: dose(p.v), emphasis: p.v >= 0.2 },
            { label: 'Einordnung', value: rating(p.v), emphasis: p.v >= 0.5 },
            ...(p.t ? [{ label: 'Messung', value: `${formatDateTime(p.t)} (${formatAge(p.t)})` }] : []),
            { label: 'Messart', value: n.basis },
            ...(p.terrestrial !== undefined && p.cosmic !== undefined ? [{ label: 'davon terrestrisch / kosmisch', value: `${formatNumber(p.terrestrial, 3)} / ${formatNumber(p.cosmic, 3)} µSv/h` }] : []),
            ...(p.alt !== undefined ? [{ label: 'Höhe', value: withUnit(formatNumber(p.alt), 'm ü. NN') }] : []),
            { label: 'Lizenz', value: n.license },
          ],
          text: 'Der natürliche Untergrund liegt in Mitteleuropa meist zwischen 0,05 und 0,2 µSv/h und schwankt mit Gestein, Höhe und Regen.',
          links: [{ label: n.name, url: n.url }],
        };
      },
      feed: (features) =>
        features
          .filter((f) => (f.properties as DoseProps).v >= 0.3)
          .sort((a, b) => (b.properties as DoseProps).v - (a.properties as DoseProps).v)
          .slice(0, 60)
          .map((f) => {
            const p = f.properties as DoseProps;
            const c = (f.geometry as { coordinates: number[] }).coordinates;
            return { id: p.id, title: dose(p.v), subtitle: `${p.name} · ${NETS[p.net].country}`, time: p.t || undefined, magnitude: p.v, color: colorAt(p.v), location: [c[0]!, c[1]!] as [number, number] };
          }),
    });
  },
});
