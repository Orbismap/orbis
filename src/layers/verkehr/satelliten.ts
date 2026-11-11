// Satellites from CelesTrak element sets (live bucket), propagated with satellite.js (SGP4) at the selected time.
// Positions are recomputed every 2 s and dead-reckoned by trackLayer in between (live mode only).
import { computed, effect, signal } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { formatAge, formatDateTime, formatNumber } from '../../core/format';
import { HOUR, MINUTE } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import { groundMotion, groundTrack, initSats, positionAt, type Sat, type SatLib } from '../../data/parsers/orbit';
import type { TleRec } from '../../data/parsers/tle';
import { stopsExpr } from '../../data/parsers/traffic';
import { lineLayer } from '../../render/lines';
import { trackLayer, type TrackObject } from '../../render/tracks';
import { EMPTY_FC } from '../../render/common';
import type { Resource } from '../../data/resource';
import { defineLayer } from '../define';
import type { InspectCard } from '../types';

const COLOR = '#ffd166';
const GROUPS = [
  { value: 'stations', label: 'Raumstationen (ISS, Tiangong)', file: 'stations' },
  { value: 'visual', label: 'Mit bloßem Auge sichtbar', file: 'visual' },
  { value: 'weather', label: 'Wettersatelliten', file: 'weather' },
  { value: 'science', label: 'Wissenschaft', file: 'science' },
  { value: 'gps', label: 'GPS', file: 'gps-ops' },
  { value: 'galileo', label: 'Galileo', file: 'galileo' },
];
// altitude in km: low Earth orbit warm, geostationary-ish cold
const ALT: [number, string][] = [[300, '#ff9d3d'], [600, '#ffd84a'], [1500, '#8fe05c'], [8000, '#2fcfc4'], [20000, '#4a8dff'], [36000, '#b06bff']];
const color = stopsExpr('alt', ALT);
const size = ['interpolate', ['linear'], ['zoom'],
  1, ['case', ['get', 'big'], 0.34, 0.2],
  5, ['case', ['get', 'big'], 0.5, 0.3],
  10, ['case', ['get', 'big'], 0.8, 0.5],
] as unknown as ExpressionSpecification;

const isLive = (t: number) => Math.abs(t - Date.now()) < 2 * MINUTE;

export default defineLayer({
  id: 'satelliten',
  category: 'verkehr',
  title: 'Satelliten',
  summary: 'Satelliten und Raumstationen in Echtzeit, Farbe nach Bahnhöhe',
  icon: 'satellite',
  color: COLOR,
  form: 'tracks',
  cadence: 'live',
  sources: [
    { name: 'CelesTrak (Bahnelemente)', url: 'https://celestrak.org/', license: 'frei, Quellenangabe', manifest: { bucket: 'live', key: 'space/tle/stations.txt' } },
    { name: 'satellite.js (SGP4)', url: 'https://github.com/shashwatak/satellite-js', license: 'MIT' },
  ],
  options: [
    { id: 'group', label: 'Gruppe', type: 'select', choices: GROUPS.map((g) => ({ value: g.value, label: g.label })), default: 'stations' },
    { id: 'track', label: 'Bodenspur der Auswahl', type: 'toggle', default: true },
  ],
  legend: { type: 'scale', unit: 'km', stops: ALT, ticks: [400, 2000, 20000, 36000] },
  keywords: ['satellit', 'iss', 'tiangong', 'raumstation', 'gps', 'galileo', 'wettersatellit', 'orbit', 'tle'],

  async mount(ctx) {
    const lib: SatLib = await import('satellite.js');
    const resources: Resource<unknown>[] = [];
    let res: Resource<TleRec[]> | undefined;
    const sats = signal<Sat[] | undefined>(undefined);
    const tracks = signal<TrackObject[] | undefined>(undefined);
    const byId = new Map<string, Sat>();
    // computed: re-runs only when the group really changes, not on every options write
    const groupSig = computed(() => String(ctx.options.value.group ?? 'stations'));
    const group = () => groupSig.value;
    const col = (g: string) => (g === 'stations' ? '#ffd166' : '#4fc3f7');

    // one resource per chosen group; the previous one is released
    const stopGroup = effect(() => {
      const g = GROUPS.find((x) => x.value === group()) ?? GROUPS[0]!;
      res?.dispose();
      resources.length = 0;
      sats.value = undefined;
      tracks.value = undefined;
      const r = ctx.resource<TleRec[]>({
        key: `live:tle-${g.file}`,
        url: bucketUrl('live', `space/tle/${g.file}.txt`),
        format: 'text',
        parse: 'tleParse',
        parseArgs: g.value === 'stations' ? { dedupe: true, only: '^(ISS \\(ZARYA\\)|CSS \\(TIANHE\\))' } : undefined,
        refresh: 6 * HOUR,
      });
      res = r;
      resources.push(r);
      const stop = effect(() => {
        const recs = r.data.value;
        if (!recs) return;
        const list = initSats(lib, recs);
        byId.clear();
        for (const s of list) byId.set(String(s.rec.id), s);
        sats.value = list;
      });
      return () => stop();
    });

    const at = () => (isLive(ctx.time.peek()) ? Date.now() : ctx.time.peek());
    const compute = () => {
      const list = sats.peek();
      if (!list) return;
      const t = at();
      const live = isLive(ctx.time.peek());
      const now = Date.now();
      const big = group() === 'stations';
      const out: TrackObject[] = [];
      const date = new Date(t);
      const gmst = lib.gstime(date);
      const date2 = new Date(t + 5000);
      const gmst2 = lib.gstime(date2);
      for (const s of list) {
        const p = positionAt(lib, s, date, gmst);
        if (!p) continue;
        const q = positionAt(lib, s, date2, gmst2);
        const m = q ? groundMotion(p, q, 5) : undefined;
        out.push({
          id: String(s.rec.id), lng: p.lng, lat: p.lat,
          heading: m?.heading, speed: live ? m?.speed : 0, t: now,
          props: { alt: Math.round(p.alt), big },
        });
      }
      tracks.value = out;
    };
    const stopCompute = effect(() => {
      void sats.value;
      void ctx.time.value;
      void groupSig.value;
      compute();
    });
    const timer = setInterval(() => { if (!document.hidden && isLive(ctx.time.peek())) compute(); }, 2000);

    // ground track of the selected satellite (±1 orbit)
    const selected = signal<string | null>(null);
    let lastCard: InspectCard | null = null;
    const trackFc = signal<FeatureCollection>(EMPTY_FC);
    const stopSel = effect(() => { if (ctx.selection.value !== lastCard) selected.value = null; });
    const updateTrack = () => {
      const id = selected.peek();
      const s = id ? byId.get(id) : undefined;
      if (!s || !ctx.options.peek().track) { trackFc.value = EMPTY_FC; return; }
      const span = s.rec.period * MINUTE;
      const segs = groundTrack(lib, s, at(), span, 120);
      const features: Feature[] = segs.map((c, i) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: c }, properties: { id: `track-${i}` } }));
      trackFc.value = { type: 'FeatureCollection', features };
    };
    const stopTrack = effect(() => { void selected.value; void ctx.options.value.track; void sats.value; updateTrack(); });
    const trackTimer = setInterval(() => { if (!document.hidden && selected.peek() && isLive(ctx.time.peek())) updateTrack(); }, 30_000);

    const line = lineLayer(ctx, { data: trackFc, name: 'track', color: '#ffffff', width: 1.4, opacity: 0.55, casing: false });
    const handle = trackLayer(ctx, {
      data: tracks,
      resources,
      color,
      symbol: { icon: 'satellite', size, rotate: 0 },
      maxExtrapolateMs: 15_000,
      tickMs: 200,
      describe: (t) => {
        const s = byId.get(t.id);
        if (!s) return { title: 'Satellit', facts: [] };
        const now = new Date(at());
        const p = positionAt(lib, s, now);
        const r = s.rec;
        const facts = [
          { label: 'NORAD-Nr.', value: String(r.id) },
          ...(r.intl ? [{ label: 'Kennung', value: r.intl }] : []),
          ...(p ? [
            { label: 'Höhe', value: `${formatNumber(p.alt)} km`, emphasis: true },
            { label: 'Geschwindigkeit', value: `${formatNumber(p.v, 2)} km/s (${formatNumber(p.v * 3600)} km/h)` },
          ] : []),
          { label: 'Umlaufzeit', value: `${formatNumber(r.period, r.period < 200 ? 1 : 0)} min` },
          { label: 'Bahnneigung', value: `${formatNumber(r.inc, 1)}°` },
          { label: 'Bahndaten', value: `${formatDateTime(r.epoch)} (${formatAge(r.epoch)})` },
        ];
        const card: InspectCard = {
          title: r.name, subtitle: GROUPS.find((g) => g.value === group())?.label, color: col(group()), icon: 'satellite', facts,
          links: [{ label: 'Bei CelesTrak', url: `https://celestrak.org/NORAD/elements/gp.php?CATNR=${r.id}` }],
        };
        lastCard = card;
        selected.value = t.id;
        return card;
      },
    });
    return {
      destroy() {
        clearInterval(timer);
        clearInterval(trackTimer);
        stopGroup(); stopCompute(); stopSel(); stopTrack();
        handle.destroy();
        line.destroy();
      },
    };
  },
});
