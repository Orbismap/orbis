// Safecast AirNote: citizen particulate sensors worldwide (CC0), mirrored with the dose snapshot.
// PM2.5 is the lead value, size and colour follow it; only sensors of the last 24 h (or 30 days) are shown.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatAge, formatDateTime, formatNumber, withUnit } from '../../core/format';
import { DAY, MINUTE } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import type { AirCollection, AirProps } from '../../data/parsers/radiation';
import type { AnyFeature } from '../../render/common';
import { pointLayer } from '../../render/points';
import { defineLayer } from '../define';

/** PM2.5 stops (µg/m³), green below the WHO daily guideline, warm colours above it. */
const STOPS: [number, string][] = [
  [0, '#4DBF8B'],
  [5, '#8FD16A'],
  [15, '#F1D23A'],
  [25, '#FF9A1F'],
  [40, '#F4511E'],
  [75, '#C2185B'],
  [150, '#8E24AA'],
];
const COLOR = '#E0A93B';

const colorAt = (v: number) => {
  if (v <= STOPS[0]![0]) return STOPS[0]![1];
  for (let i = STOPS.length - 1; i >= 0; i--) if (v >= STOPS[i]![0]) return STOPS[i]![1];
  return STOPS[0]![1];
};
const rating = (v: number) =>
  v < 5 ? 'sehr niedrig' : v < 15 ? 'unter dem WHO-Tagesrichtwert' : v < 25 ? 'über dem WHO-Tagesrichtwert' : v < 40 ? 'über dem EU-Jahresgrenzwert' : 'deutlich erhöht';
const pm = (v: number) => withUnit(formatNumber(v, v < 10 ? 1 : 0), 'µg/m³');

export default defineLayer({
  id: 'feinstaub',
  category: 'wetter',
  title: 'Feinstaub (Bürgersensoren)',
  summary: 'PM2,5 aus Safecast-AirNote-Sensoren weltweit, grün = unter dem WHO-Richtwert, dicht auch außerhalb der Messnetze',
  icon: 'wind',
  color: COLOR,
  form: 'points',
  cadence: 'hourly',
  coverage: 'Welt (Bürgersensoren)',
  sources: [{ name: 'Safecast AirNote', url: 'https://safecast.org/', license: 'CC0', manifest: { bucket: 'live', key: 'safecast.json' } }],
  options: [{ id: 'recent', label: 'Nur letzte 24 Stunden', type: 'toggle', default: true }],
  legend: () => ({
    type: 'scale',
    unit: 'µg/m³',
    stops: STOPS,
    ticks: [0, 5, 15, 25, 40, 75],
    format: (v) => formatNumber(v, 0),
  }),
  keywords: ['feinstaub', 'pm2,5', 'pm25', 'luft', 'luftqualität', 'safecast', 'airnote', 'staub', 'smog', 'partikel'],

  mount(ctx) {
    const res = ctx.resource<AirCollection>({
      key: 'live:safecast-air',
      url: bucketUrl('live', 'safecast.json'),
      parse: 'safecastAir',
      parseArgs: { maxAgeDays: 30 },
      refresh: 30 * MINUTE,
      timeout: 40_000,
    });
    const visible = computed<AirCollection | undefined>(() => {
      const d = res.data.value;
      if (!d) return undefined;
      if (ctx.options.value.recent === false) return d;
      const cutoff = Date.now() - DAY;
      return { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.t >= cutoff) };
    });
    return pointLayer(ctx, {
      data: visible,
      resources: [res],
      idKey: 'id',
      radius: ['interpolate', ['linear'], ['zoom'], 1, 2.4, 8, 4.5, 13, 7] as ExpressionSpecification,
      color: ['interpolate', ['linear'], ['get', 'pm25'], ...STOPS.flat()] as ExpressionSpecification,
      stroke: { color: 'rgba(10, 15, 24, 0.7)', width: 0.7 },
      sortKey: ['get', 'pm25'] as ExpressionSpecification,
      describe: (f: AnyFeature) => {
        const p = f.properties as AirProps;
        const climate = [p.temp, p.humid, p.press]
          .map((v, i) => (v === undefined ? '' : i === 0 ? `${formatNumber(v, 1)} °C` : i === 1 ? `${formatNumber(v, 0)} %` : `${formatNumber(v, 0)} hPa`))
          .filter(Boolean)
          .join(' · ');
        return {
          title: p.name,
          subtitle: [p.country, 'AirNote'].filter(Boolean).join(' · '),
          time: p.t || undefined,
          color: colorAt(p.pm25),
          icon: 'wind',
          facts: [
            { label: 'PM2,5', value: pm(p.pm25), emphasis: true },
            { label: 'Einordnung', value: rating(p.pm25), emphasis: p.pm25 >= 15 },
            ...(p.pm10 !== undefined ? [{ label: 'PM10', value: pm(p.pm10) }] : []),
            ...(p.pm1 !== undefined ? [{ label: 'PM1', value: pm(p.pm1) }] : []),
            ...(p.t ? [{ label: 'Messung', value: `${formatDateTime(p.t)} (${formatAge(p.t)})` }] : []),
            ...(climate ? [{ label: 'Gerät: Klima', value: climate }] : []),
            ...(p.bat !== undefined ? [{ label: 'Batterie', value: withUnit(formatNumber(p.bat, 2), 'V') }] : []),
            { label: 'Lizenz', value: 'CC0' },
          ],
          text: 'Die WHO empfiehlt im Jahresmittel höchstens 5 µg/m³ PM2,5 und an einem Tag höchstens 15 µg/m³. AirNote-Sensoren sind günstige Bürgermessgeräte: Die Werte zeigen Trends und Unterschiede zwischen Stadtteilen, sind aber nicht laborgeeicht.',
          links: [
            ...(p.dash ? [{ label: 'Gerätedashboard', url: p.dash }] : []),
            { label: 'Safecast-Karte', url: 'https://map.safecast.org/' },
          ],
        };
      },
      feed: (features) =>
        features
          .filter((f) => (f.properties as AirProps).pm25 >= 25)
          .sort((a, b) => (b.properties as AirProps).pm25 - (a.properties as AirProps).pm25)
          .slice(0, 60)
          .map((f) => {
            const p = f.properties as AirProps;
            const c = (f.geometry as { coordinates: number[] }).coordinates;
            return { id: p.id, title: pm(p.pm25), subtitle: `${p.name}${p.country ? ` · ${p.country}` : ''}`, time: p.t || undefined, magnitude: p.pm25, color: colorAt(p.pm25), location: [c[0]!, c[1]!] as [number, number] };
          }),
    });
  },
});
