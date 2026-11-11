// Live trains in Finland (Fintraffic Digitraffic Rail): GPS position of every train. The feed has no heading, so the
// layer derives it from consecutive fixes (trains stay hidden until they have moved once, unless they stand still).
import { computed, effect, signal } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { formatNumber } from '../../core/format';
import { SECOND } from '../../core/time';
import { fetchJson } from '../../data/http';
import { stationNames, trainDetail, withHeading, type TrainProps } from '../../data/parsers/trains';
import { speedText } from '../../data/parsers/traffic';
import { trackLayer, type TrackObject } from '../../render/tracks';
import { defineLayer } from '../define';
import type { InspectCard } from '../types';

const COLOR = '#ffca28';
const API = 'https://rata.digitraffic.fi/api/v1';
const STOPS: [number, string][] = [[0, '#7b8798'], [30, '#ffd166'], [90, '#ff9f43'], [150, '#ff5d8f'], [200, '#c06cff']];
const color = ['interpolate', ['linear'], ['get', 'kmh'], ...STOPS.flat()] as unknown as ExpressionSpecification;
const size = ['interpolate', ['linear'], ['zoom'], 4, 0.22, 8, 0.34, 12, 0.55] as unknown as ExpressionSpecification;
const visibleFilter = ['any', ['get', 'hd'], ['<', ['get', 'kmh'], 2]] as unknown as FilterSpecification;

export default defineLayer({
  id: 'zuege',
  category: 'verkehr',
  title: 'Züge',
  summary: 'Züge in Finnland live, Farbe nach Geschwindigkeit',
  icon: 'train',
  color: COLOR,
  form: 'tracks',
  cadence: 'live',
  coverage: 'Finnland',
  sources: [{ name: 'Fintraffic Digitraffic Rail', url: 'https://www.digitraffic.fi/en/railway-traffic/', license: 'CC BY 4.0' }],
  legend: { type: 'scale', unit: 'km/h', stops: STOPS, ticks: [0, 50, 100, 150, 200] },
  keywords: ['zug', 'bahn', 'finnland', 'train', 'rail', 'vr', 'helsinki'],

  mount(ctx) {
    const raw = ctx.resource<TrackObject[]>({ key: 'digitraffic:train-locations', url: `${API}/train-locations/latest`, parse: 'trainLocations', refresh: 10 * SECOND });
    const prev = new Map<string, { lng: number; lat: number; heading?: number }>();
    const tracks = signal<TrackObject[] | undefined>(undefined);
    const stop = effect(() => {
      const r = raw.data.value;
      if (r) tracks.value = withHeading(r, prev);
    });
    let names: Promise<Record<string, string>> | undefined;
    const loadNames = () => (names ??= fetchJson<unknown>(`${API}/metadata/stations`).then((r) => stationNames(r.data)).catch(() => ({})));
    const visible = computed(() => (tracks.value ?? []).filter((t) => (t.props as unknown as TrainProps).hd || (t.props as unknown as TrainProps).kmh < 2).length);

    const handle = trackLayer(ctx, {
      data: tracks,
      resources: [raw],
      color,
      symbol: { icon: 'arrow', size },
      filter: signal<FilterSpecification | undefined>(visibleFilter),
      count: visible,
      maxExtrapolateMs: 30 * SECOND,
      describe: (t, now) => {
        const p = t.props as unknown as TrainProps;
        const base: InspectCard = {
          title: `Zug ${p.num}`,
          subtitle: 'Finnland',
          color: COLOR,
          icon: 'train',
          facts: [
            { label: 'Geschwindigkeit', value: p.kmh < 2 ? 'steht' : speedText(p.kmh / 3.6, false), emphasis: true },
            ...(t.heading !== undefined && p.kmh >= 2 ? [{ label: 'Kurs', value: `${formatNumber(t.heading, 0)}°` }] : []),
            { label: 'Abfahrtstag', value: p.date },
          ],
          links: [{ label: 'Zug bei Fintraffic', url: `https://rata.digitraffic.fi/api/v1/trains/${p.date}/${p.num}` }],
        };
        // route and delay come from a second request; the card is replaced when it arrives
        void Promise.all([fetchJson<unknown>(`${API}/trains/${p.date}/${p.num}`), loadNames()])
          .then(([tr, n]) => {
            const d = trainDetail(tr.data, n, p.num);
            if (!d || ctx.signal.aborted || ctx.selection.peek() !== base) return;
            const facts = [...base.facts];
            facts.unshift({ label: 'Strecke', value: `${d.from} → ${d.to}`, emphasis: true });
            if (d.delay !== undefined) facts.push({ label: 'Verspätung', value: d.delay <= 0 ? 'pünktlich' : `${d.delay} min`, emphasis: d.delay >= 5 });
            if (d.lastStation) facts.push({ label: 'Letzter Halt', value: d.lastStation });
            if (d.operator) facts.push({ label: 'Betreiber', value: d.operator.toUpperCase() });
            ctx.select({ ...base, title: d.title, subtitle: d.category, facts, location: [t.lng, t.lat] });
          })
          .catch(() => undefined);
        void now;
        return base;
      },
    });
    return { destroy: () => { stop(); handle.destroy(); } };
  },
});
