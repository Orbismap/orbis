// River discharge with trend: Natural Earth rivers (50m, public domain, public/data) coloured by GloFAS discharge at
// bounded stations along the big rivers (Open-Meteo Flood, keyless). Each station is probed at five neighbouring model
// cells (the river channel is a 0.05° cell that a coordinate on the line often misses) and the strongest wins.
// Budget: 110 stations x 5 probes = 550 locations, 30 forecast days (weighted about 2x by the API) per load,
// cached 6 h in the browser, counted in the daily limiter of render/ocean/budget.
import { computed, effect, signal } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection, LineString } from 'geojson';
import { formatDate, formatNumber } from '../../core/format';
import { HOUR } from '../../core/time';
import { describeError, fetchJson } from '../../data/http';
import { floodStations, riverStatus, sparkline, type FloodStation } from '../../data/parsers/flood';
import type { AnyFeature } from '../../render/common';
import { lineLayer } from '../../render/lines';
import { canSpend, pace, spend } from '../../render/ocean/budget';
import { cacheGet, cachePut } from '../../render/ocean/cache';
import { buildPieces, pickStations, probeCoords, PROBE_OFFSETS, riversOf, type PieceProps, type RiverLine, type Station } from '../../render/ocean/rivers';
import { defineLayer } from '../define';

const COLOR = '#2F9BE0';
const API = 'https://flood-api.open-meteo.com/v1/flood';
const TTL = 6 * HOUR;
const STATIONS = 110;
const CHUNK_STATIONS = 50;
type ColorBy = 'anomaly' | 'trend';

const ANOMALY: [number, string][] = [[0.25, '#c9822f'], [0.6, '#e4b45a'], [1, '#52a8e0'], [2, '#2ec4b6'], [4, '#ffd23f'], [8, '#ff7a45'], [16, '#d81b8a']];
const TREND: [number, string][] = [[-0.5, '#3a6fe0'], [-0.1, '#7fb4ea'], [0, '#cfd8e0'], [0.1, '#f4b860'], [0.5, '#ef6a3a'], [1.5, '#c01f5e']];
const ramp = (input: ExpressionSpecification, stops: [number, string][]) => ['interpolate', ['linear'], input, ...stops.flat()] as unknown as ExpressionSpecification;

async function loadFlood(stations: Station[], signal: AbortSignal, onPart?: (data: (FloodStation | null)[]) => void): Promise<{ data: (FloodStation | null)[]; at: number; cached: boolean }> {
  const key = `flood:${stations.length}:${stations[0]?.id}`;
  const hit = cacheGet<(FloodStation | null)[]>(key, TTL);
  if (hit && hit.d.length === stations.length) return { data: hit.d, at: hit.t, cached: true };
  if (!canSpend(stations.length * PROBE_OFFSETS.length)) throw new Error('Tageslimit für Open-Meteo erreicht');
  const out: (FloodStation | null)[] = [];
  for (let i = 0; i < stations.length; i += CHUNK_STATIONS) {
    const part = probeCoords(stations.slice(i, i + CHUNK_STATIONS));
    // 30 forecast days count about twice per location
    await pace(part.lat.length * 2, signal);
    spend(part.lat.length);
    const url = `${API}?latitude=${part.lat.join(',')}&longitude=${part.lng.join(',')}&daily=river_discharge,river_discharge_median&forecast_days=30&timezone=GMT`;
    const res = await fetchJson<unknown>(url, { timeout: 45_000, signal });
    out.push(...floodStations(res.data, { group: PROBE_OFFSETS.length }));
    // first stations show up right away; the rest follows after the paced second request
    onPart?.([...out, ...new Array<null>(stations.length - out.length).fill(null)]);
  }
  cachePut(key, out, 48);
  return { data: out, at: Date.now(), cached: false };
}

export default defineLayer({
  id: 'fluesse',
  category: 'meer',
  title: 'Flussabfluss',
  summary: 'Große Flüsse, Farbe nach Abfluss im Vergleich zum Normalwert oder nach 7-Tage-Trend, Dicke nach Wassermenge',
  icon: 'drop',
  color: COLOR,
  form: 'lines',
  cadence: 'daily',
  coverage: 'Welt',
  sources: [
    { name: 'GloFAS über Open-Meteo Flood API', url: 'https://open-meteo.com/en/docs/flood-api', license: 'CC BY 4.0' },
    { name: 'Natural Earth Rivers 50m', url: 'https://www.naturalearthdata.com/', license: 'gemeinfrei' },
  ],
  options: [{ id: 'colorBy', label: 'Farbe nach', type: 'select', default: 'anomaly', choices: [{ value: 'anomaly', label: 'Abfluss gegenüber Normal' }, { value: 'trend', label: '7-Tage-Trend' }] }],
  legend: (o) =>
    o.colorBy === 'trend'
      ? { type: 'scale', unit: 'Abflussänderung in 7 Tagen in %', stops: TREND.map(([v, c]) => [v * 100, c]), ticks: [-50, -10, 0, 10, 50, 150], format: (v) => `${v > 0 ? '+' : ''}${formatNumber(v, 0)}` }
      : { type: 'scale', unit: 'Abfluss, Vielfaches des Normalwerts (Median)', stops: ANOMALY.map(([, c], i) => [i, c]), ticks: ANOMALY.map((_, i) => i), format: (v) => formatNumber(ANOMALY[Math.round(v)]![0], ANOMALY[Math.round(v)]![0] < 1 ? 2 : 0) },
  keywords: ['fluss', 'flüsse', 'abfluss', 'hochwasser', 'niedrigwasser', 'dürre', 'glofas', 'rhein', 'donau', 'amazonas', 'nil', 'wassermenge'],

  mount(ctx) {
    const geometry = ctx.resource<FeatureCollection<LineString>>({ key: 'ne50m-rivers', url: `${import.meta.env.BASE_URL}data/ne50m_rivers.json` });
    const rivers = computed<RiverLine[] | undefined>(() => (geometry.data.value ? riversOf(geometry.data.value as never) : undefined));
    const stations = computed<Station[] | undefined>(() => (rivers.value ? pickStations(rivers.value, STATIONS) : undefined));
    const flood = signal<{ data: (FloodStation | null)[]; at: number } | undefined>(undefined);
    const error = signal<string | undefined>(undefined);
    let table = new Map<string, { station: Station; data: FloodStation }>();

    const pieces = computed<FeatureCollection<LineString, PieceProps> | undefined>(() => {
      const r = rivers.value;
      const s = stations.value;
      const f = flood.value;
      if (!r || !s || !f) return undefined;
      const results = s.flatMap((station, i) => (f.data[i] ? [{ station, data: f.data[i]! }] : []));
      table = new Map(results.map((x) => [x.station.id, x]));
      return buildPieces(r, results);
    });

    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (st: Station[]) => {
      loadFlood(st, ctl.signal, (data) => { if (!ctl.signal.aborted) flood.value = { data, at: Date.now() }; })
        .then((r) => {
          flood.value = r;
          error.value = undefined;
          timer = setTimeout(() => { if (!ctl.signal.aborted) load(st); }, Math.max(10 * 60_000, r.at + TTL - Date.now()));
        })
        .catch((e) => {
          if (ctl.signal.aborted) return;
          error.value = describeError(e);
          timer = setTimeout(() => { if (!ctl.signal.aborted) load(st); }, 15 * 60_000);
        });
    };
    let started = false;
    const stop = effect(() => {
      const st = stations.value;
      if (st && !started) { started = true; load(st); }
    });

    const colorBy = computed(() => ((ctx.options.value.colorBy as ColorBy) ?? 'anomaly'));
    const color = computed<ExpressionSpecification>(() =>
      colorBy.value === 'trend'
        ? ramp(['get', 'tr'], TREND)
        : (['case', ['==', ['get', 'ratio'], 0], '#7f9bb0', ramp(['get', 'ratio'], ANOMALY)] as unknown as ExpressionSpecification),
    );
    const w = (z0: number, a: number, z1: number, b: number) => ['interpolate', ['linear'], ['zoom'], z0, ['+', a, ['*', ['get', 'lw'], b]], z1, ['+', a * 1.8, ['*', ['get', 'lw'], b * 2.6]]];

    // errors from the loader reach the status through the extra effect below (lineLayer reports the geometry resource)
    const unsubErr = effect(() => {
      const e = error.value;
      if (e && !pieces.value) ctx.status({ state: 'error', note: e });
    });

    const handle = lineLayer(ctx, {
      data: pieces as never,
      resources: [geometry],
      color,
      width: w(1, 0.8, 8, 2.2) as unknown as ExpressionSpecification,
      opacity: 0.92,
      casing: { extra: 0.6 },
      count: computed(() => pieces.value?.features.length),
      describe: (f: AnyFeature) => {
        const p = f.properties as PieceProps;
        const rec = table.get(p.sid);
        const s = rec ? riverStatus(rec.data) : null;
        if (!rec || !s) return { title: p.name || 'Fluss', subtitle: 'Abfluss unbekannt', color: COLOR, icon: 'drop', facts: [] };
        const fmtQ = (q: number) => `${formatNumber(q, q < 10 ? 1 : 0)} m³/s`;
        const pct = (x: number) => `${x > 0 ? '+' : ''}${formatNumber(x * 100, 0)} %`;
        const trend = { rising: 'steigend', falling: 'fallend', stable: 'gleichbleibend' }[s.trend];
        const day = (i: number) => formatDate(rec.data.t0 + i * 86_400_000);
        return {
          title: p.name || 'Fluss', subtitle: 'Abfluss, GloFAS-Modell an einer Station', time: rec.data.t0, color: COLOR, icon: 'drop',
          facts: [
            { label: 'Abfluss heute', value: fmtQ(s.now), emphasis: true },
            ...(s.ratio !== undefined && s.median !== undefined ? [{ label: 'Gegenüber Normal', value: `${formatNumber(s.ratio, s.ratio < 10 ? 1 : 0)}-fach des Medians (${fmtQ(s.median)})` }] : []),
            { label: 'Trend 7 Tage', value: `${trend}, ${pct(s.change7)}` },
            { label: 'Prognose', value: s.spark.map((q) => formatNumber(q, q < 10 ? 1 : 0)).join(' · ') + ' m³/s' },
            { label: 'Höchstwert in 30 Tagen', value: `${fmtQ(s.max30)}, ${s.max30Day === 0 ? 'heute' : day(s.max30Day)}` },
          ],
          text: `Abfluss der nächsten 8 Tage: ${sparkline(s.spark)}`,
          location: [rec.station.lng, rec.station.lat],
          links: [{ label: 'Open-Meteo Flood API', url: 'https://open-meteo.com/en/docs/flood-api' }],
        };
      },
    });
    return {
      destroy() {
        ctl.abort();
        if (timer) clearTimeout(timer);
        stop();
        unsubErr();
        handle.destroy();
      },
    };
  },
});
