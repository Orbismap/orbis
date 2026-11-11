// Live aircraft (ADS-B). Loads the circles around the current view from a readsb endpoint (adsb.lol by default,
// adsb.fi as fallback) every few seconds; positions are dead-reckoned between polls by trackLayer.
//
// NOTE: neither adsb.lol nor adsb.fi send CORS headers; requests go through the Orbismap proxy (data/endpoints
// `proxied`). VITE_ADSB_URL (template with {lat} {lon} {nm}) overrides the sources and is called directly.
import { computed, signal, type ReadonlySignal } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { formatNumber, NNBSP } from '../../core/format';
import { proxied } from '../../data/endpoints';
import { fetchRaw, describeError } from '../../data/http';
import type { Resource } from '../../data/resource';
import { aircraftReadsb, coverCircles, type AircraftProps } from '../../data/parsers/readsb';
import { ALT_STOPS, altitudeText, rateText, speedText } from '../../data/parsers/traffic';
import { trackLayer, type TrackObject } from '../../render/tracks';
import { defineLayer } from '../define';
import type { LayerContext } from '../types';

const COLOR = '#4a8dff';
const GROUND = '#7b8798';
const EMERGENCY = '#ff3b3b';
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
// the public readsb endpoints send no CORS headers: go through the proxy (VITE_ADSB_URL overrides, used as is)
const SOURCES = env.VITE_ADSB_URL?.trim()
  ? [env.VITE_ADSB_URL.trim()]
  : ['https://api.adsb.lol/v2/point/{lat}/{lon}/{nm}', 'https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/{nm}'];
const viaProxy = (tpl: string) => (env.VITE_ADSB_URL?.trim() ? tpl : proxied(tpl));
const POLL_MS = 10_000;
const MIN_ZOOM = 5;

const SQUAWK: Record<string, string> = { '7500': 'Flugzeugentführung', '7600': 'Funkausfall', '7700': 'Notfall' };
const CATEGORY: Record<string, string> = {
  A1: 'Leichtflugzeug', A2: 'Kleinflugzeug', A3: 'Mittelgroß', A4: 'Groß (Wirbelschleppe)', A5: 'Schwer', A6: 'Hochleistung', A7: 'Hubschrauber',
  B1: 'Segelflugzeug', B2: 'Ballon / Luftschiff', B4: 'Ultraleicht', B6: 'Drohne', B7: 'Raumfahrzeug', C1: 'Rettungsfahrzeug', C2: 'Servicefahrzeug',
};

const altExpr = (prop: string) => ['interpolate', ['linear'], ['get', prop], ...ALT_STOPS.flat()] as unknown as ExpressionSpecification;
const color = ['case', ['get', 'emerg'], EMERGENCY, ['get', 'gnd'], GROUND, altExpr('alt')] as unknown as ExpressionSpecification;
const size = ['interpolate', ['linear'], ['zoom'],
  3, ['case', ['get', 'emerg'], 0.42, ['get', 'heli'], 0.26, 0.3],
  8, ['case', ['get', 'emerg'], 0.6, ['get', 'heli'], 0.36, 0.45],
  12, ['case', ['get', 'emerg'], 0.9, ['get', 'heli'], 0.55, 0.7],
] as unknown as ExpressionSpecification;

/** Resource-shaped loader for "what is in the view": several circle requests merged, refreshed while mounted. */
function viewFeed(ctx: LayerContext): Resource<TrackObject[]> {
  const data = signal<TrackObject[] | undefined>(undefined);
  const state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const error = signal<string | undefined>(undefined);
  const updatedAt = signal<number | undefined>(undefined);
  const ml = ctx.map.ml;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let ctl: AbortController | undefined;
  let working = false;
  let disposed = false;
  let sourceIdx = 0;

  async function fetchCircle(c: { lat: number; lng: number; nm: number }, signal: AbortSignal): Promise<TrackObject[]> {
    let lastErr: unknown;
    for (let k = 0; k < SOURCES.length; k++) {
      const tpl = SOURCES[(sourceIdx + k) % SOURCES.length]!;
      const url = viaProxy(tpl.replace('{lat}', c.lat.toFixed(3)).replace('{lon}', c.lng.toFixed(3)).replace('{nm}', String(c.nm)));
      try {
        const res = await fetchRaw<unknown>(url, { format: 'json', timeout: 12_000, signal });
        sourceIdx = (sourceIdx + k) % SOURCES.length;
        return aircraftReadsb(res.data);
      } catch (e) {
        if (signal.aborted) throw e;
        lastErr = e;
      }
    }
    throw lastErr;
  }

  async function load() {
    if (disposed || working || ml.getZoom() < MIN_ZOOM - 0.05) return;
    working = true;
    ctl?.abort();
    ctl = new AbortController();
    const sig = ctl.signal;
    const abort = () => ctl?.abort();
    ctx.signal.addEventListener('abort', abort, { once: true });
    try {
      const b = ml.getBounds();
      const circles = coverCircles([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], 250, 6);
      if (state.peek() !== 'ready') state.value = 'loading';
      const parts = await Promise.all(circles.map((c) => fetchCircle(c, sig)));
      const byId = new Map<string, TrackObject>();
      for (const p of parts) for (const t of p) byId.set(t.id, t);
      data.value = [...byId.values()];
      error.value = undefined;
      state.value = 'ready';
      updatedAt.value = Date.now();
    } catch (e) {
      if (!sig.aborted && !disposed) {
        const blocked = e instanceof Error && /Failed to fetch|NetworkError|network|nicht erreichbar/i.test(e.message);
        error.value = blocked ? 'Quelle sendet kein CORS (VITE_ADSB_URL setzen)' : describeError(e);
        state.value = data.peek() ? 'ready' : 'error';
      }
    } finally {
      working = false;
      ctx.signal.removeEventListener('abort', abort);
    }
  }

  const schedule = () => {
    clearTimeout(timer);
    if (disposed) return;
    timer = setTimeout(async () => {
      if (typeof document === 'undefined' || !document.hidden) await load();
      schedule();
    }, POLL_MS);
  };
  const onMove = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { void load(); }, 500);
  };
  ml.on('moveend', onMove);
  const onVisible = () => { if (!document.hidden) void load(); };
  document.addEventListener('visibilitychange', onVisible);
  void load().then(schedule);

  return {
    data, state, error, updatedAt,
    reload: () => { void load(); },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(debounce);
      ctl?.abort();
      ml.off('moveend', onMove);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}

export default defineLayer({
  id: 'flugzeuge',
  category: 'verkehr',
  title: 'Flugzeuge',
  summary: 'Flugzeuge in Echtzeit, Farbe nach Flughöhe, Notfälle rot',
  icon: 'plane',
  color: COLOR,
  form: 'tracks',
  cadence: 'live',
  coverage: 'Ausschnitt (ADS-B-Empfänger)',
  minZoom: 5,
  sources: [
    { name: 'adsb.lol', url: 'https://adsb.lol/', license: 'ODbL 1.0' },
    { name: 'adsb.fi (Rückfall)', url: 'https://adsb.fi/', license: 'ODbL 1.0' },
  ],
  options: [
    { id: 'minAlt', label: 'Mindesthöhe', type: 'range', min: 0, max: 12000, step: 500, default: 0, unit: 'm' },
    { id: 'kind', label: 'Anzeigen', type: 'select', choices: [{ value: 'all', label: 'Alle Luftfahrzeuge' }, { value: 'heli', label: 'Nur Hubschrauber' }], default: 'all' },
    { id: 'ground', label: 'Flugzeuge am Boden', type: 'toggle', default: false },
  ],
  legend: {
    type: 'scale', unit: 'm',
    stops: ALT_STOPS,
    ticks: [0, 3000, 6000, 9000, 12000],
  },
  keywords: ['flug', 'ads-b', 'adsb', 'luftfahrt', 'aircraft', 'plane', 'hubschrauber', 'transponder'],

  mount(ctx) {
    const feed = viewFeed(ctx);
    const filter = computed<FilterSpecification | undefined>(() => {
      const o = ctx.options.value;
      const clauses: unknown[] = [];
      if (!o.ground) clauses.push(['!', ['get', 'gnd']]);
      if (Number(o.minAlt) > 0) clauses.push(['any', ['get', 'emerg'], ['>=', ['get', 'alt'], Number(o.minAlt)]]);
      if (o.kind === 'heli') clauses.push(['get', 'heli']);
      return clauses.length ? (['all', ...clauses] as FilterSpecification) : undefined;
    });
    const shown = computed(() => {
      const list = feed.data.value;
      if (!list) return undefined;
      // the count follows the filter; the map applies the same rules on the GPU
      const o = ctx.options.value;
      const min = Number(o.minAlt);
      return list.filter((t) => {
        const p = t.props as unknown as AircraftProps;
        if (!o.ground && p.gnd) return false;
        if (min > 0 && p.alt < min && !p.emerg) return false;
        if (o.kind === 'heli' && !p.heli) return false;
        return true;
      }).length;
    });
    const handle = trackLayer(ctx, {
      data: feed,
      color,
      symbol: { icon: 'plane', size },
      ringRadius: 16,
      maxExtrapolateMs: 30_000,
      filter,
      count: shown as ReadonlySignal<number | undefined>,
      minZoom: 5,
      describe: (t, now) => {
        const p = t.props as unknown as AircraftProps;
        const sq = SQUAWK[p.sq];
        const title = p.call || p.reg || p.hex.toUpperCase();
        const age = Math.max(0, Math.round((now - t.t) / 1000));
        const facts: { label: string; value: string; emphasis?: boolean }[] = [];
        if (sq) facts.push({ label: 'Notfall-Squawk', value: `${p.sq} – ${sq}`, emphasis: true });
        if (p.type || p.desc) facts.push({ label: 'Typ', value: p.desc ? `${p.desc}${p.type ? ` (${p.type})` : ''}` : p.type });
        if (p.reg) facts.push({ label: 'Kennzeichen', value: p.reg });
        facts.push({ label: 'Höhe', value: p.gnd ? 'am Boden' : altitudeText(p.alt), emphasis: !p.gnd });
        if (t.speed !== undefined) facts.push({ label: 'Geschwindigkeit', value: speedText(t.speed) });
        if (t.heading !== undefined) facts.push({ label: 'Kurs', value: `${formatNumber(t.heading, 0)}°` });
        if (!p.gnd && Math.abs(p.vr) >= 0.3) facts.push({ label: 'Steigrate', value: rateText(p.vr) });
        if (p.sq && !sq) facts.push({ label: 'Squawk', value: p.sq });
        if (p.country) facts.push({ label: 'Registriert in', value: p.country });
        if (p.cat && CATEGORY[p.cat]) facts.push({ label: 'Kategorie', value: CATEGORY[p.cat]! });
        if (p.mil) facts.push({ label: 'Hinweis', value: 'Militärisch (Datenbankflag)' });
        facts.push({ label: 'Letzte Meldung', value: age < 2 ? 'gerade eben' : `vor ${age}${NNBSP}s` });
        return {
          title,
          subtitle: p.call && p.reg ? p.reg : sq ?? (p.heli ? 'Hubschrauber' : 'Flugzeug'),
          color: sq ? EMERGENCY : p.gnd ? GROUND : COLOR,
          icon: 'plane',
          facts,
          links: [
            { label: 'Auf adsb.lol ansehen', url: `https://globe.adsb.lol/?icao=${p.hex}` },
            ...(p.reg ? [{ label: 'Fotos (Planespotters)', url: `https://www.planespotters.net/search?q=${encodeURIComponent(p.reg)}` }] : []),
          ],
        };
      },
      feed: (tracks) =>
        tracks.filter((t) => (t.props as unknown as AircraftProps).emerg).map((t) => {
          const p = t.props as unknown as AircraftProps;
          return { id: t.id, title: `${p.call || p.reg || p.hex} – ${SQUAWK[p.sq] ?? 'Notfall'}`, subtitle: `Squawk ${p.sq}`, color: EMERGENCY, location: [t.lng, t.lat] as [number, number] };
        }),
    });
    return {
      destroy() {
        handle.destroy();
        feed.dispose();
      },
    };
  },
});
