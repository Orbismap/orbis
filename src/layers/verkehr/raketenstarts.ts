// Upcoming rocket launches (Launch Library 2, mirrored in the live bucket) shown on their launch pads.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { formatDateTime } from '../../core/format';
import { DAY, HOUR, MINUTE } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import { groupByPad, type Launch, type LaunchPad } from '../../data/parsers/launches';
import { countdownText } from '../../data/parsers/traffic';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#ff7a45';
/** hours until the next launch -> colour, size */
const color = ['interpolate', ['linear'], ['get', 'hours'], 0, '#ff3d2e', 24, '#ff8a3d', 72, '#ffd166', 168, '#7ee0d2', 720, '#5b7a99'] as unknown as ExpressionSpecification;
const grow = (a: number, b: number, c: number) => ['interpolate', ['linear'], ['get', 'hours'], 0, a, 72, b, 720, c] as unknown as ExpressionSpecification;
const radius = ['interpolate', ['linear'], ['zoom'], 1, grow(5, 4, 3), 6, grow(11, 8, 6), 10, grow(15, 12, 9)] as unknown as ExpressionSpecification;

const RANGES = [{ value: '7', label: '7 Tage' }, { value: '30', label: '30 Tage' }, { value: '90', label: '90 Tage' }, { value: '365', label: 'Alle' }];

export default defineLayer({
  id: 'raketenstarts',
  category: 'verkehr',
  title: 'Raketenstarts',
  summary: 'Bevorstehende Raketenstarts an ihren Startplätzen, Größe und Farbe nach Zeit bis zum Start',
  icon: 'rocket',
  color: COLOR,
  form: 'points',
  cadence: 'minutes',
  sources: [{ name: 'The Space Devs – Launch Library 2', url: 'https://thespacedevs.com/llapi', license: 'frei, Quellenangabe', manifest: { bucket: 'live', key: 'space/launches/upcoming.json' } }],
  options: [{ id: 'days', label: 'Zeitraum', type: 'select', choices: RANGES, default: '30' }],
  legend: {
    type: 'scale', unit: 'Std. bis Start',
    stops: [[0, '#ff3d2e'], [24, '#ff8a3d'], [72, '#ffd166'], [168, '#7ee0d2'], [720, '#5b7a99']],
    ticks: [0, 24, 72, 168, 720],
  },
  keywords: ['rakete', 'start', 'launch', 'spacex', 'nasa', 'esa', 'raumfahrt', 'cape canaveral', 'startplatz'],

  mount(ctx) {
    const res = ctx.resource<Launch[]>({
      key: 'live:launches-upcoming',
      url: bucketUrl('live', 'space/launches/upcoming.json'),
      parse: 'launchesParse',
      refresh: 10 * MINUTE,
      timeout: 40_000,
    });
    // pads with their launches inside the chosen range; hours are relative to the selected time
    const pads = computed<LaunchPad[] | undefined>(() => {
      const l = res.data.value;
      if (!l) return undefined;
      const end = Date.now() + Number(ctx.options.value.days ?? 30) * DAY;
      return groupByPad(l.filter((x) => x.net <= end && x.net > Date.now() - 6 * HOUR));
    });
    const padById = computed(() => new Map((pads.value ?? []).map((p) => [String(p.id), p])));
    const fc = computed<FeatureCollection<Point> | undefined>(() => {
      const list = pads.value;
      if (!list) return undefined;
      const now = ctx.time.value;
      const features: Feature<Point>[] = list.map((p) => {
        const next = p.launches[0]!;
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { id: String(p.id), hours: Math.max(0, (next.net - now) / HOUR), net: next.net, n: p.launches.length },
        };
      });
      return { type: 'FeatureCollection', features };
    });

    return pointLayer(ctx, {
      data: fc,
      resources: [res],
      radius,
      symbol: { icon: 'rocket', size: ['interpolate', ['linear'], ['zoom'], 1, 0.42, 6, 0.62, 10, 0.85] as unknown as ExpressionSpecification },
      color,
      stroke: { color: 'rgba(10, 15, 24, 0.9)', width: 1.5 },
      sortKey: ['-', ['get', 'net']] as unknown as ExpressionSpecification, // nearest launch on top
      describe: (f: AnyFeature) => {
        const p = padById.value.get(String(f.properties.id));
        if (!p) return { title: 'Startplatz', facts: [] };
        const l = p.launches[0]!;
        const now = Date.now();
        const facts = [
          { label: 'Start (NET)', value: `${formatDateTime(l.net)} – ${countdownText(l.net, now)}`, emphasis: true },
          { label: 'Rakete', value: l.rocket || '–' },
          { label: 'Anbieter', value: l.provider || '–' },
          ...(l.mission ? [{ label: 'Mission', value: `${l.mission}${l.missionType ? ` (${l.missionType})` : ''}` }] : []),
          ...(l.orbit ? [{ label: 'Zielbahn', value: l.orbit }] : []),
          { label: 'Status', value: l.statusName || l.status },
          { label: 'Startplatz', value: `${l.pad}${l.location ? `, ${l.location}` : ''}` },
        ];
        const more = p.launches.slice(1, 6).map((x) => `${formatDateTime(x.net)}: ${x.name}`);
        return {
          title: l.name,
          subtitle: p.launches.length > 1 ? `${p.launches.length} geplante Starts an diesem Platz` : l.pad,
          time: l.net,
          color: COLOR,
          icon: 'rocket',
          facts,
          text: more.length ? `Danach: ${more.join(' · ')}` : undefined,
          links: [
            ...(l.webcast ? [{ label: l.webcastLive ? 'Livestream (läuft)' : 'Übertragung', url: l.webcast }] : []),
            ...(l.info ? [{ label: 'Mehr Informationen', url: l.info }] : []),
            { label: 'Launch Library', url: `https://thespacedevs.com/launch/${l.id}` },
          ],
        };
      },
      feed: (features) => {
        const out = features
          .map((f) => padById.value.get(String(f.properties.id)))
          .filter((p): p is LaunchPad => !!p)
          .flatMap((p) => p.launches.map((l) => ({ id: l.id, title: l.name, subtitle: `${l.pad} · ${countdownText(l.net)}`, time: l.net, color: COLOR, location: [p.lng, p.lat] as [number, number] })));
        return out.sort((a, b) => a.time - b.time).slice(0, 60);
      },
    });
  },
});
