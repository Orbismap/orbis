// Rocket launches (Launch Library 2, mirrored in the live bucket) on their launch pads. Launches in progress or within the
// next hours get a live countdown / T+ time, the mission phase, the webcast links and a SIMULATED ground track (there is no
// public rocket telemetry; the track is modelled from pad, target orbit and inclination). The card of a selected pad
// updates every second while a launch is near.
import { computed, effect, signal } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { formatDateTime, formatNumber } from '../../core/format';
import { DAY, HOUR, MINUTE } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import { groupByPad, type Launch, type LaunchPad } from '../../data/parsers/launches';
import { groundTrack, phaseAt, STATUS_DE, tLabel, type LaunchDetail } from '../../data/parsers/launchtrack';
import { countdownText } from '../../data/parsers/traffic';
import { lineLayer } from '../../render/lines';
import { pointLayer } from '../../render/points';
import { markEventTimes, type AnyFeature } from '../../render/common';
import { defineLayer } from '../define';
import type { InspectCard, LayerContext } from '../types';

const COLOR = '#ff7a45';
/** hours until the next launch -> colour, size */
const color = ['interpolate', ['linear'], ['get', 'hours'], 0, '#ff3d2e', 24, '#ff8a3d', 72, '#ffd166', 168, '#7ee0d2', 720, '#5b7a99'] as unknown as ExpressionSpecification;
const grow = (a: number, b: number, c: number) => ['interpolate', ['linear'], ['get', 'hours'], 0, a, 72, b, 720, c] as unknown as ExpressionSpecification;
const radius = ['interpolate', ['linear'], ['zoom'], 1, grow(5, 4, 3), 6, grow(11, 8, 6), 10, grow(15, 12, 9)] as unknown as ExpressionSpecification;

const RANGES = [{ value: '7', label: '7 Tage' }, { value: '30', label: '30 Tage' }, { value: '90', label: '90 Tage' }, { value: '365', label: 'Alle' }];
/** A launch is "near" from this long before T-0 to this long after: tracks are drawn, the card ticks every second. */
const PRE = 6 * HOUR;
const POST = 15 * MINUTE;

export default defineLayer({
  id: 'raketenstarts',
  category: 'verkehr',
  title: 'Raketenstarts',
  summary: 'Raketenstarts an ihren Startplätzen mit Countdown, Flugphase und Livestream',
  icon: 'rocket',
  color: COLOR,
  form: 'points',
  cadence: 'minutes',
  sources: [
    { name: 'The Space Devs – Launch Library 2', url: 'https://thespacedevs.com/llapi', license: 'frei, Quellenangabe', manifest: { bucket: 'live', key: 'space/launches/upcoming.json' } },
    { name: 'Launch Library 2 (Detail, nächste Starts)', url: 'https://thespacedevs.com/llapi', license: 'frei, Quellenangabe', manifest: { bucket: 'live', key: 'space/launches/tracker.json' } },
  ],
  // Zeitleiste: von kurz vor jetzt bis 7 Tage voraus (weiter hinaus gibt es nur wenige, unsichere Termine); Bahnen und Countdown folgen der gewählten Zeit
  time: { mode: 'window', range: () => ({ start: -PRE, end: 7 * DAY, step: HOUR }) },
  options: [{ id: 'days', label: 'Zeitraum', type: 'select', choices: RANGES, default: '30' }, { id: 'track', label: 'Simulierte Flugbahn', type: 'toggle', default: true }],
  legend: {
    type: 'scale', unit: 'Std. bis Start',
    stops: [[0, '#ff3d2e'], [24, '#ff8a3d'], [72, '#ffd166'], [168, '#7ee0d2'], [720, '#5b7a99']],
    ticks: [0, 24, 72, 168, 720],
  },
  keywords: ['rakete', 'start', 'launch', 'spacex', 'nasa', 'esa', 'raumfahrt', 'cape canaveral', 'startplatz', 'livestream', 'countdown'],

  mount(ctx) {
    const res = ctx.resource<Launch[]>({
      key: 'live:launches-upcoming',
      url: bucketUrl('live', 'space/launches/upcoming.json'),
      parse: 'launchesParse',
      refresh: 10 * MINUTE,
      timeout: 40_000,
    });
    const tracker = ctx.resource<LaunchDetail[]>({
      key: 'live:launches-tracker',
      url: bucketUrl('live', 'space/launches/tracker.json'),
      parse: 'launchTracker',
      refresh: 5 * MINUTE,
      timeout: 40_000,
    });
    const details = computed(() => new Map((tracker.data.value ?? []).map((d) => [d.id, d])));

    // clock: every second while a launch is near, else every 30 s
    const clock = signal(Date.now());
    const near = (now: number) => (tracker.data.peek() ?? []).some((d) => now - d.net > -PRE && now - d.net < PRE + POST);
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      clock.value = Date.now();
      timer = setTimeout(tick, near(clock.value) ? 1000 : 30_000);
    };
    timer = setTimeout(tick, 1000);
    /** the selected time; "live" while it follows the clock */
    const nowOf = () => (Math.abs(ctx.time.peek() - Date.now()) < 2 * MINUTE ? Date.now() : ctx.time.peek());

    // pads with their launches inside the chosen range; hours are relative to the selected time
    const pads = computed<LaunchPad[] | undefined>(() => {
      const l = res.data.value;
      if (!l) return undefined;
      const end = Date.now() + Number(ctx.options.value.days ?? 30) * DAY;
      return groupByPad(l.filter((x) => x.net <= end && x.net > Date.now() - 6 * HOUR));
    });
    // Striche in der Zeitleiste: alle Starts im gewählten Zeitraum, nicht nur die 60 der Liste
    markEventTimes(ctx, () => pads.value?.flatMap((p) => p.launches.map((l) => l.net)));
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

    // --- simulated tracks ---
    const trackOn = computed(() => ctx.options.value.track !== false);
    const coarse = computed(() => Math.floor(clock.value / (30 * 1000)));
    /** dashed predicted ground track of launches that are near */
    const planned = computed<FeatureCollection<LineString> | undefined>(() => {
      coarse.value;
      if (!trackOn.value) return { type: 'FeatureCollection', features: [] };
      const now = nowOf();
      const features: Feature<LineString>[] = [];
      for (const d of tracker.data.value ?? []) {
        if (now - d.net < -PRE || now - d.net > PRE + POST) continue;
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: groundTrack(d, 1500, 30) }, properties: { id: `plan-${d.id}`, kind: 'plan' } });
      }
      return { type: 'FeatureCollection', features };
    });
    /** flown part + rocket position of launches in flight (updates every second) */
    const flight = computed(() => {
      const now = trackOn.value ? (clock.value, nowOf()) : 0;
      const lines: Feature<LineString>[] = [];
      const pts: Feature<Point>[] = [];
      for (const d of trackOn.value ? (tracker.data.value ?? []) : []) {
        const ph = phaseAt(d, now);
        if (ph.phase !== 'active' || !ph.at) continue;
        lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: groundTrack(d, ph.tSec, 10) }, properties: { id: `flown-${d.id}`, kind: 'flown' } });
        pts.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [ph.at.lng, ph.at.lat] }, properties: { id: String(padIdOf(d)), when: tLabel(ph.tSec), hours: 0 } });
      }
      return { lines: { type: 'FeatureCollection', features: lines } as FeatureCollection<LineString>, pts: { type: 'FeatureCollection', features: pts } as FeatureCollection<Point> };
    });
    const padIdOf = (d: LaunchDetail) => (res.data.peek() ?? []).find((l) => l.id === d.id)?.padId ?? d.id;
    const flownLines = computed(() => flight.value.lines);
    const rocketPts = computed(() => flight.value.pts);

    // --- card ---
    const cardOf = (padId: string): InspectCard => {
      const p = padById.value.get(padId);
      if (!p) return { title: 'Startplatz', facts: [] };
      const l = p.launches[0]!;
      const d = details.value.get(l.id);
      const now = nowOf();
      const ph = d ? phaseAt(d, now) : undefined;
      const rel = l.net - now;
      const facts: InspectCard['facts'] = [];
      if (ph && (ph.phase !== 'orbit' || now - l.net < 3 * HOUR)) facts.push({ label: ph.tSec < 0 ? 'Countdown' : 'Flugzeit', value: tLabel(ph.tSec), emphasis: true });
      else if (Math.abs(rel) < 3 * HOUR) facts.push({ label: rel >= 0 ? 'Countdown' : 'Flugzeit', value: tLabel(Math.round(-rel / 1000)), emphasis: true });
      if (ph) facts.push({ label: 'Phase', value: ph.label, emphasis: ph.phase === 'active' });
      if (ph?.at) {
        facts.push({ label: 'Höhe (simuliert)', value: `${formatNumber(Math.round(ph.at.altKm))} km` });
        facts.push({ label: 'Geschwindigkeit (simuliert)', value: `${formatNumber(Math.round(ph.at.speedKmh))} km/h` });
        facts.push({ label: 'Entfernung zum Startplatz', value: `${formatNumber(Math.round(ph.at.downrangeKm))} km` });
      }
      facts.push({ label: 'Start (NET)', value: `${formatDateTime(l.net)} – ${countdownText(l.net, now)}`, emphasis: !ph });
      if (d?.windowStart && d.windowEnd && d.windowEnd > d.windowStart) facts.push({ label: 'Startfenster', value: `${formatDateTime(d.windowStart)} bis ${formatDateTime(d.windowEnd)}` });
      facts.push({ label: 'Status', value: `${STATUS_DE[l.status] ?? l.statusName ?? l.status}${d?.holdReason ? ` (${d.holdReason})` : ''}` });
      if (d?.probability !== null && d?.probability !== undefined) facts.push({ label: 'Startwahrscheinlichkeit', value: `${d.probability} %` });
      facts.push({ label: 'Rakete', value: l.rocket || '–' }, { label: 'Anbieter', value: l.provider || '–' });
      if (l.mission) facts.push({ label: 'Mission', value: `${l.mission}${l.missionType ? ` (${l.missionType})` : ''}` });
      if (l.orbit) facts.push({ label: 'Zielbahn', value: l.orbit });
      facts.push({ label: 'Startplatz', value: `${l.pad}${l.location ? `, ${l.location}` : ''}` });
      const more = p.launches.slice(1, 6).map((x) => `${formatDateTime(x.net)}: ${x.name}`);
      const desc = d?.desc ? (d.desc.length > 420 ? `${d.desc.slice(0, 420).trim()} …` : d.desc) : '';
      const text = [desc, ph?.at || (ph && ph.tSec > -PRE / 1000) ? 'Die Flugbahn auf der Karte ist simuliert (Profil einer zweistufigen Rakete), es gibt keine öffentliche Telemetrie.' : '', more.length ? `Danach: ${more.join(' · ')}` : ''].filter(Boolean).join('\n\n');
      // webcast first: YouTube/X pages cannot be embedded, so the links are the stream
      const videos = d?.videos.length ? d.videos : l.webcast ? [{ url: l.webcast, title: '', source: new URL(l.webcast).hostname.replace(/^www\./, ''), publisher: '', priority: 1 }] : [];
      const live = l.webcastLive || d?.webcastLive;
      return {
        title: l.name,
        subtitle: p.launches.length > 1 ? `${p.launches.length} geplante Starts an diesem Platz` : l.pad,
        time: l.net,
        color: COLOR,
        icon: 'rocket',
        facts,
        text: text || undefined,
        links: [
          ...videos.slice(0, 3).map((v, i) => ({ label: `${live && i === 0 ? 'Livestream (läuft)' : i === 0 ? 'Livestream / Übertragung' : 'Weitere Übertragung'}: ${v.publisher || v.source}`, url: v.url })),
          ...(l.info ? [{ label: 'Mehr Informationen', url: l.info }] : []),
          { label: 'Launch Library', url: `https://thespacedevs.com/launch/${l.id}` },
        ],
      };
    };

    // the card of a selected pad ticks while its next launch is near
    const mine = new WeakSet<InspectCard>();
    const selPad = signal<string | null>(null);
    const stopSel = effect(() => { const c = ctx.selection.value; if (!c || !mine.has(c)) selPad.value = null; });
    const stopTick = effect(() => {
      clock.value;
      const id = selPad.peek();
      if (!id) return;
      const l = padById.peek().get(id)?.launches[0];
      if (!l || Math.abs(clock.peek() - l.net) > PRE + POST) return;
      const card = { ...cardOf(id), location: [padById.peek().get(id)!.lng, padById.peek().get(id)!.lat] as [number, number] };
      mine.add(card);
      ctx.select(card);
    });
    const describe = (f: AnyFeature): InspectCard => {
      const id = String(f.properties.id);
      selPad.value = id;
      const card = cardOf(id);
      mine.add(card);
      return card;
    };

    const pad = pointLayer(ctx, {
      data: fc,
      resources: [res, tracker],
      radius,
      symbol: { icon: 'rocket', size: ['interpolate', ['linear'], ['zoom'], 1, 0.42, 6, 0.62, 10, 0.85] as unknown as ExpressionSpecification },
      color,
      stroke: { color: 'rgba(10, 15, 24, 0.9)', width: 1.5 },
      sortKey: ['-', ['get', 'net']] as unknown as ExpressionSpecification, // nearest launch on top
      describe,
      feed: (features) => {
        const out = features
          .map((f) => padById.value.get(String(f.properties.id)))
          .filter((p): p is LaunchPad => !!p)
          .flatMap((p) => p.launches.map((l) => ({ id: l.id, title: l.name, subtitle: `${l.pad} · ${countdownText(l.net)}`, time: l.net, color: COLOR, location: [p.lng, p.lat] as [number, number] })));
        return out.sort((a, b) => a.time - b.time).slice(0, 60);
      },
    });
    const quiet: LayerContext = { ...ctx, status: () => {}, feed: () => {} };
    const dashed = lineLayer(quiet, { data: planned, name: 'plan', color: '#ffb28a', width: 1.6, dash: [2, 2], casing: false, opacity: 0.85, minZoom: 2 });
    const flown = lineLayer(quiet, { data: flownLines, name: 'flown', color: '#ff7a45', width: 2.6, casing: true });
    const rocket = pointLayer(quiet, {
      data: rocketPts, name: 'rocket', radius: 9, color: '#ffffff', symbol: { icon: 'rocket', size: 0.8 }, stroke: { color: '#ff3d2e', width: 1.5 },
      describe: (f: AnyFeature) => describe(f),
    });
    ctx.map.addLayer({
      id: `${ctx.id}.rocket-t`, type: 'symbol', source: `${ctx.id}.rocket-src`,
      layout: { 'text-field': ['get', 'when'] as unknown as ExpressionSpecification, 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-allow-overlap': true },
      paint: { 'text-color': '#ffe3d1', 'text-halo-color': 'rgba(10, 15, 24, 0.9)', 'text-halo-width': 1.6 },
    } as never, 'points');

    return {
      destroy() {
        clearTimeout(timer);
        stopSel(); stopTick();
        ctx.map.remove({ layers: [`${ctx.id}.rocket-t`] });
        rocket.destroy(); flown.destroy(); dashed.destroy(); pad.destroy();
      },
    };
  },
});
