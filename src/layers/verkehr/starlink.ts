// Starlink constellation (≈ 10 000 objects) from CelesTrak element sets. Propagated with satellite.js in slices of
// 2 500 objects (yielding to the event loop in between), the source is refreshed every 3 s; small dots, no rotation.
import { effect, signal } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { formatAge, formatDateTime, formatNumber } from '../../core/format';
import { HOUR, MINUTE } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import { groundTrack, initSats, positionAt, type Sat, type SatLib } from '../../data/parsers/orbit';
import type { TleRec } from '../../data/parsers/tle';
import type { AnyFeature } from '../../render/common';
import { EMPTY_FC } from '../../render/common';
import { lineLayer } from '../../render/lines';
import { pointLayer } from '../../render/points';
import { defineLayer } from '../define';
import type { InspectCard } from '../types';

const COLOR = '#59d7ff';
const SLICE = 2500;
const STOPS: [number, string][] = [[320, '#ffd166'], [450, '#7ee0d2'], [570, '#59a8ff'], [1200, '#b06bff']];
const color = ['interpolate', ['linear'], ['get', 'alt'], ...STOPS.flat()] as unknown as ExpressionSpecification;
const radius = ['interpolate', ['linear'], ['zoom'], 1, 1.1, 4, 1.8, 7, 2.6, 10, 3.5] as unknown as ExpressionSpecification;
const isLive = (t: number) => Math.abs(t - Date.now()) < 2 * MINUTE;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export default defineLayer({
  id: 'starlink',
  category: 'verkehr',
  title: 'Starlink',
  summary: 'Die Starlink-Konstellation, rund 10 000 Satelliten, Farbe nach Bahnhöhe',
  icon: 'orbit',
  color: COLOR,
  form: 'points',
  cadence: 'live',
  sources: [
    { name: 'CelesTrak (Bahnelemente)', url: 'https://celestrak.org/', license: 'frei, Quellenangabe', manifest: { bucket: 'live', key: 'space/tle/starlink.txt' } },
    { name: 'satellite.js (SGP4)', url: 'https://github.com/shashwatak/satellite-js', license: 'MIT' },
  ],
  options: [{ id: 'track', label: 'Bodenspur der Auswahl', type: 'toggle', default: true }],
  legend: { type: 'scale', unit: 'km', stops: STOPS, ticks: [320, 450, 570, 1200] },
  keywords: ['starlink', 'spacex', 'satelliten', 'internet', 'konstellation'],

  async mount(ctx) {
    const lib: SatLib = await import('satellite.js');
    const res = ctx.resource<TleRec[]>({
      key: 'live:tle-starlink',
      url: bucketUrl('live', 'space/tle/starlink.txt'),
      format: 'text',
      parse: 'tleParse',
      refresh: 6 * HOUR,
      timeout: 60_000,
    });
    const sats = signal<Sat[]>([]);
    const byId = new Map<string, Sat>();
    const fc = signal<FeatureCollection<Point> | undefined>(undefined);
    const stopInit = effect(() => {
      const recs = res.data.value;
      if (!recs) return;
      const list = initSats(lib, recs);
      byId.clear();
      for (const s of list) byId.set(String(s.rec.id), s);
      sats.value = list;
    });

    let busy = false;
    let stopped = false;
    async function pass() {
      if (busy || stopped) return;
      const list = sats.peek();
      if (!list.length) return;
      busy = true;
      performance.mark('starlink-pass-start');
      const t = isLive(ctx.time.peek()) ? Date.now() : ctx.time.peek();
      const date = new Date(t);
      const gmst = lib.gstime(date);
      const features: Feature<Point>[] = [];
      for (let i = 0; i < list.length; i += SLICE) {
        for (const s of list.slice(i, i + SLICE)) {
          const p = positionAt(lib, s, date, gmst);
          if (p) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [Math.round(p.lng * 1e4) / 1e4, Math.round(p.lat * 1e4) / 1e4] }, properties: { id: s.rec.id, alt: Math.round(p.alt) } });
        }
        if (stopped) break;
        await tick();
      }
      if (!stopped) fc.value = { type: 'FeatureCollection', features };
      performance.measure('starlink-pass', 'starlink-pass-start');
      busy = false;
    }
    const stopPass = effect(() => { void sats.value; void ctx.time.value; void pass(); });
    const timer = setInterval(() => { if (!document.hidden && isLive(ctx.time.peek())) void pass(); }, 3000);

    // ground track of the selected satellite (one orbit, from now)
    const selected = signal<string | null>(null);
    let lastCard: InspectCard | null = null;
    const trackFc = signal<FeatureCollection>(EMPTY_FC);
    const at = () => (isLive(ctx.time.peek()) ? Date.now() : ctx.time.peek());
    const stopSel = effect(() => { if (ctx.selection.value !== lastCard) selected.value = null; });
    const updateTrack = () => {
      const id = selected.peek();
      const s = id ? byId.get(id) : undefined;
      if (!s || !ctx.options.peek().track) { trackFc.value = EMPTY_FC; return; }
      const segs = groundTrack(lib, s, at(), s.rec.period * MINUTE, 120);
      const features: Feature[] = segs.map((c, i) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: c }, properties: { id: `track-${i}` } }));
      trackFc.value = { type: 'FeatureCollection', features };
    };
    const stopTrack = effect(() => { void selected.value; void ctx.options.value.track; void sats.value; updateTrack(); });
    const trackTimer = setInterval(() => { if (!document.hidden && selected.peek() && isLive(ctx.time.peek())) updateTrack(); }, 30_000);
    const line = lineLayer(ctx, { data: trackFc, name: 'track', color: '#ffffff', width: 1.4, opacity: 0.55, casing: false });

    const handle = pointLayer(ctx, {
      data: fc,
      resources: [res],
      radius,
      color,
      stroke: { width: 0 },
      describe: (f: AnyFeature) => {
        const s = byId.get(String(f.properties.id));
        const r = s?.rec;
        const p = s ? positionAt(lib, s, new Date(isLive(ctx.time.peek()) ? Date.now() : ctx.time.peek())) : undefined;
        const card: InspectCard = {
          title: r?.name ?? `Starlink ${f.properties.id}`,
          subtitle: 'Starlink',
          color: COLOR,
          icon: 'orbit',
          facts: r ? [
            { label: 'NORAD-Nr.', value: String(r.id) },
            ...(r.intl ? [{ label: 'Kennung', value: r.intl }] : []),
            ...(p ? [{ label: 'Höhe', value: `${formatNumber(p.alt)} km`, emphasis: true }, { label: 'Geschwindigkeit', value: `${formatNumber(p.v, 2)} km/s (${formatNumber(p.v * 3600)} km/h)` }] : []),
            { label: 'Umlaufzeit', value: `${formatNumber(r.period, 1)} min` },
            { label: 'Bahnneigung', value: `${formatNumber(r.inc, 1)}°` },
            { label: 'Bahndaten', value: `${formatDateTime(r.epoch)} (${formatAge(r.epoch)})` },
          ] : [],
        };
        lastCard = card;
        selected.value = r ? String(r.id) : null;
        return card;
      },
    });
    return {
      destroy() {
        stopped = true;
        clearInterval(timer);
        clearInterval(trackTimer);
        stopInit(); stopPass(); stopSel(); stopTrack();
        handle.destroy();
        line.destroy();
      },
    };
  },
});
