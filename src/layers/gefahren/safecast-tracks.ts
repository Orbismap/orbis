// Safecast bGeigie mobile measurement drives: tracks (LineStrings) of citizen science radiation campaigns (CC0).
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatDateTime, formatNumber, withUnit } from '../../core/format';
import { type TrackCollection, type TrackProps } from '../../data/parsers/radiation';
import type { AnyFeature } from '../../render/common';
import { lineLayer } from '../../render/lines';
import { defineLayer } from '../define';

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

const colorAt = (v: number) => {
  if (v <= STOPS[0]![0]) return STOPS[0]![1];
  for (let i = STOPS.length - 1; i >= 0; i--) if (v >= STOPS[i]![0]) return STOPS[i]![1];
  return STOPS[0]![1];
};

const URL_ = `${import.meta.env.BASE_URL}data/safecast-tracks.json`;

export default defineLayer({
  id: 'safecast-tracks',
  category: 'gefahren',
  title: 'Safecast bGeigie-Fahrten',
  summary: 'Mobile Strahlungsmessfahrten von Safecast als Spuren, Wert in µSv/h (CC0)',
  icon: 'radiation',
  color: '#FFB347',
  form: 'lines',
  cadence: 'daily',
  coverage: 'Welt (bGeigie-Fahrten, Schwerpunkt Japan/USA/Europa)',
  sources: [
    { name: 'Safecast bGeigie imports', url: 'https://map.safecast.org/', license: 'CC0', manifest: { bucket: 'data', key: 'safecast-tracks.json' } },
  ],
  legend: {
    type: 'scale',
    unit: 'µSv/h (Mittelwert der Fahrt)',
    stops: STOPS,
    ticks: [0.05, 0.1, 0.2, 0.5, 1, 5],
    format: (v) => formatNumber(v, v < 1 ? 2 : 0),
  },
  keywords: ['safecast', 'bgeigie', 'strahlung', 'radiation', 'track', 'fahrt', 'mobil', 'gamma', 'sievert'],

  mount(ctx) {
    const data = ctx.resource<TrackCollection>({ key: 'static:safecast-tracks', url: URL_, parse: 'safecastTrack', timeout: 60_000 });
    return lineLayer(ctx, {
      data,
      color: ['interpolate', ['linear'], ['coalesce', ['get', 'avg'], 0.1], ...STOPS.flat()] as ExpressionSpecification,
      width: ['interpolate', ['linear'], ['zoom'], 1, 1.4, 6, 2.4, 10, 3.5] as ExpressionSpecification,
      casing: true,
      opacity: 0.9,
      describe: (f: AnyFeature) => {
        const p = f.properties as TrackProps;
        const min = p.min;
        const max = p.max;
        const avg = p.avg;
        const range = min !== undefined && max !== undefined ? `${formatNumber(min, 3)} – ${formatNumber(max, 3)} µSv/h` : '—';
        return {
          title: `Safecast bGeigie-Fahrt #${String(p.id).replace('safecast-track:', '')}`,
          subtitle: p.credits ? `${p.credits} · Safecast` : 'Safecast bGeigie',
          time: p.t || undefined,
          color: colorAt(avg ?? 0.1),
          icon: 'radiation',
          facts: [
            ...(avg !== undefined ? [{ label: 'Mittelwert', value: withUnit(formatNumber(avg, 3), 'µSv/h'), emphasis: true }] : []),
            { label: 'Wertebereich', value: range },
            ...(p.count !== undefined ? [{ label: 'Messpunkte', value: formatNumber(p.count, 0) }] : []),
            ...(p.t ? [{ label: 'Importiert', value: formatDateTime(p.t) }] : []),
            { label: 'Quelle', value: p.source },
            { label: 'Lizenz', value: 'CC0' },
          ],
          text: 'Mobile Messkampagne mit einem bGeigie-Gerät. Die Spur zeigt den Verlauf der Messfahrt; Werte sind in µSv/h umgerechnet (LND 7318).',
          links: [{ label: 'Safecast-Karte', url: 'https://map.safecast.org/' }],
        };
      },
    });
  },
});
