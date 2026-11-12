// Nachgestellte Ereignisse: ein Marker je Ereignis (Definitionen in src/data/incidents/). Wählt man einen aus, zeigt die
// Ebene die Flugspur: der zurückgelegte Teil und die Flugzeugposition folgen der Zeitleiste, Schlüsselmomente und Videos
// erscheinen ab ihrer Zeit. Spur, Funk und Videos liegen im assets-Bucket (data/incidents/<id>/), 3D folgt später.
import { computed, effect, signal } from '@preact/signals';
import type { Feature, FeatureCollection } from 'geojson';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatDateTime, formatTime } from '../../core/format';
import { bucketUrl } from '../../data/endpoints';
import { localizeUnits, sampleAt, type IncidentDef, type IncidentEvent, type TrackPoint } from '../../data/parsers/incidents';
import type { Resource } from '../../data/resource';
import { Cleanup, type AnyFeature } from '../../render/common';
import { lineLayer } from '../../render/lines';
import { pointLayer } from '../../render/points';
import { defineLayer } from '../define';
import type { FeedItem, InspectCard, LayerContext, LayerHandle } from '../types';

const DEFS: IncidentDef[] = Object.entries(import.meta.glob<{ default: IncidentDef }>('../../data/incidents/*.ts', { eager: true }))
  .map(([path, m]) => {
    const file = path.slice(path.lastIndexOf('/') + 1, -3);
    if (m.default.id !== file) throw new Error(`data/incidents/${file}.ts definiert '${m.default.id}': Dateiname und id müssen übereinstimmen`);
    return m.default;
  })
  .sort((a, b) => a.range.start - b.range.start);

const KIND_COLOR: Record<IncidentEvent['kind'] | 'media', string> = {
  flight: '#8FDCFF', radio: '#F6C945', weather: '#72C8F0', impact: '#FF3B30', info: '#B0B8C4', media: '#C58BFF',
};
const COLOR = '#EF5350';
const asset = (path: string) => bucketUrl('assets', path);
const fromMs = (s: number) => s * 1000;

/** Altitude / speed / rate in words, with the unit placeholders resolved. */
const alt = (ft: number) => localizeUnits(`{{ft:${Math.round(ft)}}}`);

function cardOf(def: IncidentDef, track: TrackPoint[] | undefined, t: number): InspectCard {
  const facts: InspectCard['facts'] = [
    { label: 'Ort', value: def.place },
    { label: 'Flugzeug', value: `${def.aircraft.type} · ${def.aircraft.reg}` },
    { label: 'Flug', value: `${def.aircraft.from} → ${def.aircraft.to}` },
  ];
  if (track?.length) {
    const s = sampleAt(track, t / 1000);
    facts.push({ label: 'Stand der Zeitleiste', value: formatTime(s.t * 1000, true), emphasis: true });
    if (s.alt !== null) facts.push({ label: 'Höhe', value: `${alt(s.alt)}${s.estimated ? ' *' : ''}` });
    facts.push({ label: 'Geschwindigkeit', value: localizeUnits(`{{kn:${Math.round(s.gs)}}}`) });
    if (s.vs !== null && Math.abs(s.vs) >= 500) facts.push({ label: s.vs < 0 ? 'Sinkrate' : 'Steigrate', value: localizeUnits(`{{fpm:${Math.round(Math.abs(s.vs))}}}`) });
  }
  const notes = def.dataNotes.map(localizeUnits);
  return {
    title: def.title,
    subtitle: def.subtitle,
    time: fromMs(def.events.find((e) => e.kind === 'impact')?.t ?? def.range.end),
    color: COLOR,
    icon: 'plane',
    facts,
    text: [def.summary, 'Mit dem Zeitregler lässt sich der Flug abspielen. Die Spur zeigt, was bis zur gewählten Zeit geschah.', ...notes].join('\n\n'),
    media: def.audio ? { type: 'audio', url: asset(def.audio.src) } : undefined,
    links: [
      ...(def.audio ? [{ label: `Funk: ${def.audio.credit.label}`, url: def.audio.credit.url }] : []),
      ...def.media.map((m) => ({ label: `${m.title} (${m.platform})${m.note ? `, ${m.note}` : ''}`, url: m.url })),
      ...def.sources.map((s) => ({ label: s.label, url: s.url })),
    ],
    location: [def.lon, def.lat],
  };
}

function eventCard(def: IncidentDef, e: IncidentEvent, at: [number, number] | undefined): InspectCard {
  return {
    title: localizeUnits(e.label),
    subtitle: def.shortTitle ?? def.title,
    time: fromMs(e.t),
    color: KIND_COLOR[e.kind],
    icon: 'plane',
    facts: [{ label: 'Zeit', value: formatDateTime(fromMs(e.t)) }],
    text: e.text ? localizeUnits(e.text) : undefined,
    links: e.src ? [{ label: e.src.label, url: e.src.url }] : undefined,
    location: at,
  };
}

export default defineLayer({
  id: 'rekonstruktionen',
  category: 'gefahren',
  title: 'Nachgestellte Ereignisse',
  summary: 'Flugbahn, Funk und Videos eines Unglücks zum Abspielen: Marker anklicken, dann läuft die Spur mit der Zeitleiste',
  icon: 'plane',
  color: COLOR,
  form: 'points',
  cadence: 'static',
  sources: [
    { name: 'Flightradar24 (ADS-B-Spur), Berichte und Videos der genannten Quellen', url: 'https://www.flightradar24.com/', license: 'Spur: Flightradar24-Export; Videos und Ton: Rechte bei den Urhebern, nur zur Dokumentation' },
  ],
  time: {
    mode: 'window',
    range() {
      const now = Date.now();
      return { start: fromMs(Math.min(...DEFS.map((d) => d.range.start))) - now, end: fromMs(Math.max(...DEFS.map((d) => d.range.end))) - now };
    },
  },
  legend: () => ({
    type: 'classes',
    items: [
      { color: COLOR, label: 'Ereignis (anklicken)', shape: 'dot' },
      { color: '#FF5A4F', label: 'Flugspur bis zur gewählten Zeit', shape: 'line' },
      { color: KIND_COLOR.flight, label: 'Flugzustand', shape: 'dot' },
      { color: KIND_COLOR.radio, label: 'Funk', shape: 'dot' },
      { color: KIND_COLOR.impact, label: 'Einschlag', shape: 'dot' },
      { color: KIND_COLOR.media, label: 'Video', shape: 'dot' },
    ],
  }),
  keywords: ['absturz', 'unglück', 'flugzeug', 'flugspur', 'rekonstruktion', 'ereignis', 'learjet', 'n722bd', 'flightradar24', 'funk'],

  mount(ctx) {
    const clean = new Cleanup();
    const quiet = Object.assign(Object.create(ctx), { status() {} }) as LayerContext;
    const reporting = Object.assign(Object.create(ctx), {
      status: (s: Parameters<LayerContext['status']>[0]) => ctx.status(s.state === 'ready' ? { ...s, note: 'Marker anklicken, dann läuft die Flugspur mit der Zeitleiste' } : s),
    }) as LayerContext;

    // ---- which incident is open ----------------------------------------------------------------------------
    const active = signal<string | undefined>();
    const titlesOf = (d: IncidentDef) => new Set([d.title, ...d.events.map((e) => localizeUnits(e.label)), ...d.media.map((m) => `${m.title} (${m.platform})`)]);
    clean.add(
      effect(() => {
        const c = ctx.selection.value;
        const hit = c ? DEFS.find((d) => d.title === c.title) : undefined;
        if (hit) active.value = hit.id;
        else {
          const cur = DEFS.find((d) => d.id === active.peek());
          if (!c || !(cur && (ctx.ownSelection?.(c) || titlesOf(cur).has(c.title)))) active.value = undefined;
        }
      }),
    );
    const def = computed(() => DEFS.find((d) => d.id === active.value));

    // ---- track of the open incident (loaded on demand, one request per incident) -----------------------------
    const tracks = new Map<string, Resource<TrackPoint[]>>();
    const trackOf = (d: IncidentDef) => {
      let r = tracks.get(d.id);
      if (!r) {
        r = ctx.resource<TrackPoint[]>({ key: `incident-track:${d.id}`, url: asset(d.track), parse: 'incidentTrack' });
        tracks.set(d.id, r);
      }
      return r;
    };
    const track = computed(() => {
      const d = def.value;
      return d ? trackOf(d).data.value : undefined;
    });
    // one second of resolution is plenty for the card and the markers
    const time = computed(() => Math.round(ctx.time.value / 1000) * 1000);

    // ---- markers --------------------------------------------------------------------------------------------
    const markers = computed<FeatureCollection>(() => ({
      type: 'FeatureCollection',
      features: DEFS.map((d) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [d.lon, d.lat] }, properties: { id: d.id } })),
    }));
    const marker = pointLayer(reporting, {
      data: markers,
      radius: 8,
      color: COLOR,
      stroke: { color: '#ffffff', width: 1.5 },
      symbol: { icon: 'plane', size: ['interpolate', ['linear'], ['zoom'], 1, 0.6, 8, 0.9] as unknown as ExpressionSpecification },
      describe: (f: AnyFeature) => {
        const d = DEFS.find((x) => x.id === f.properties.id)!;
        return cardOf(d, trackOf(d).data.peek(), time.peek());
      },
    });

    // ---- track, plane, events ---------------------------------------------------------------------------------
    const trackLines = computed<FeatureCollection | undefined>(() => {
      const pts = track.value;
      if (!pts?.length) return undefined;
      const s = sampleAt(pts, time.value / 1000);
      const done: [number, number][] = pts.slice(0, s.i + 1).map((p) => [p[2], p[1]]);
      done.push([s.lon, s.lat]);
      return {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'LineString', coordinates: pts.map((p) => [p[2], p[1]]) }, properties: { id: 'ghost', part: 'ghost' } },
          { type: 'Feature', geometry: { type: 'LineString', coordinates: done }, properties: { id: 'done', part: 'done' } },
        ],
      };
    });
    const lines = lineLayer(quiet, {
      name: 'track',
      data: trackLines,
      color: ['match', ['get', 'part'], 'done', '#FF5A4F', 'rgba(200,210,225,0.45)'] as unknown as ExpressionSpecification,
      width: ['match', ['get', 'part'], 'done', 3.2, 1.6] as unknown as ExpressionSpecification,
      casing: true,
    });

    const planeData = computed<FeatureCollection | undefined>(() => {
      const pts = track.value;
      const d = def.value;
      if (!pts?.length || !d) return undefined;
      const s = sampleAt(pts, time.value / 1000);
      return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { id: 'plane', trk: s.trk } }] };
    });
    const plane = pointLayer(quiet, {
      name: 'plane',
      data: planeData,
      radius: 6,
      color: '#ffffff',
      stroke: { color: '#EF5350', width: 1.5 },
      symbol: { icon: 'plane', size: 1.1, rotate: ['get', 'trk'] as unknown as ExpressionSpecification },
      describe: () => {
        const d = def.peek()!;
        return cardOf(d, track.peek(), time.peek());
      },
    });

    interface Moment { id: string; kind: IncidentEvent['kind'] | 'media'; t: number | undefined; at: [number, number] | undefined; card: InspectCard }
    const moments = computed<Moment[]>(() => {
      const d = def.value;
      const pts = track.value;
      if (!d) return [];
      const where = (t: number, at?: { lat: number; lon: number }): [number, number] | undefined => {
        if (at) return [at.lon, at.lat];
        if (!pts?.length) return undefined;
        const s = sampleAt(pts, t);
        return [s.lon, s.lat];
      };
      const out: Moment[] = [];
      d.events.forEach((e, i) => {
        const at = where(e.t, e.at);
        out.push({ id: `${d.id}:e${i}`, kind: e.kind, t: e.t, at, card: eventCard(d, e, at) });
      });
      d.media.forEach((m, i) => {
        const at = m.at ? ([m.at.lon, m.at.lat] as [number, number]) : where(m.t ?? d.range.end);
        const card: InspectCard = {
          title: `${m.title} (${m.platform})`,
          subtitle: [m.group, m.note].filter(Boolean).join(' · ') || d.shortTitle,
          time: m.t ? fromMs(m.t) : undefined,
          color: KIND_COLOR.media,
          icon: 'plane',
          facts: [{ label: 'Quelle', value: m.platform }],
          text: 'Fremdmaterial, nur zur Dokumentation eingebunden.',
          media: m.file ? { type: 'video', url: asset(m.file) } : undefined,
          links: [{ label: `Original bei ${m.platform}`, url: m.url }],
          location: at,
        };
        out.push({ id: `${d.id}:m${i}`, kind: 'media', t: m.t, at, card });
      });
      return out;
    });
    const momentFeatures = computed<FeatureCollection>(() => {
      const t = time.value / 1000;
      const features: Feature[] = [];
      for (const m of moments.value) {
        if (!m.at || (m.t !== undefined && m.t > t)) continue;
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: m.at }, properties: { id: m.id, color: KIND_COLOR[m.kind] } });
      }
      return { type: 'FeatureCollection', features };
    });
    const events = pointLayer(quiet, {
      name: 'events',
      data: momentFeatures,
      radius: ['interpolate', ['linear'], ['zoom'], 6, 4, 14, 8] as unknown as ExpressionSpecification,
      color: ['get', 'color'] as unknown as ExpressionSpecification,
      stroke: { color: '#10151f', width: 1.5 },
      describe: (f: AnyFeature) => moments.peek().find((m) => m.id === f.properties.id)!.card,
    });

    // ---- feed: key moments of the open incident, else one row per incident -----------------------------------------
    clean.add(
      effect(() => {
        const d = def.value;
        if (!d) {
          ctx.feed(
            DEFS.map((x): FeedItem => {
              const card = cardOf(x, undefined, Date.now());
              return { id: x.id, title: x.title, subtitle: x.subtitle, time: card.time, color: COLOR, location: [x.lon, x.lat], card };
            }),
          );
          return;
        }
        ctx.feed(
          moments.value
            .filter((m) => m.at)
            .map((m): FeedItem => ({ id: m.id, title: m.card.title, subtitle: m.card.subtitle, time: m.t === undefined ? undefined : fromMs(m.t), color: KIND_COLOR[m.kind], location: m.at!, card: m.card })),
        );
      }),
    );

    // ---- open: frame the last phase of the flight once ---------------------------------------------------------------
    let framed: string | undefined;
    clean.add(
      effect(() => {
        const d = def.value;
        const pts = track.value;
        if (!d || !pts?.length || framed === d.id) return;
        framed = d.id;
        const end = d.range.end - 1200;
        const recent = pts.filter((p) => p[0] >= end - 600);
        const lons = recent.map((p) => p[2]);
        const lats = recent.map((p) => p[1]);
        if (recent.length < 2) return;
        ctx.map.flyTo({ bounds: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], padding: { top: 80, bottom: 80, left: 80, right: 80 } });
      }),
    );
    clean.add(effect(() => { if (!def.value) framed = undefined; }));

    // ---- card follows the timeline (at most once a second, only while the incident card is shown) -------------------
    let lastUpdate = 0;
    const tick = signal(0);
    let timer: ReturnType<typeof setTimeout> | undefined;
    clean.add(() => clearTimeout(timer));
    clean.add(
      effect(() => {
        tick.value;
        const d = def.value;
        const t = time.value;
        const pts = track.value;
        const sel = ctx.selection.peek();
        if (!d || !sel || sel.title !== d.title) return;
        const wait = 900 - (Date.now() - lastUpdate);
        if (wait > 0) {
          clearTimeout(timer);
          timer = setTimeout(() => tick.value++, wait);
          return;
        }
        lastUpdate = Date.now();
        ctx.select(cardOf(d, pts, t));
      }),
    );

    // load failures of the track are reported once the incident is open
    clean.add(
      effect(() => {
        const d = def.value;
        if (!d) return;
        const r = trackOf(d);
        if (r.state.value === 'error' && !r.data.value) ctx.status({ state: 'error', note: `Flugspur nicht ladbar: ${r.error.value ?? 'Netzwerkfehler'}` });
      }),
    );

    const handles: LayerHandle[] = [events, plane, lines, marker];
    return {
      destroy() {
        clean.run();
        for (const h of handles) h.destroy();
      },
    };
  },
});
