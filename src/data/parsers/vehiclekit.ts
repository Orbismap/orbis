// Kit of the two vehicle layers (Züge, Busse/Trams/U-Bahnen): viewport bounded loading of Transitous segments and the
// regional GPS feeds, one normalised vehicle model, dead-reckoned movement through trackLayer, shared card.
// Not a parser; lives here because layer folders may only contain layers.
import { computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { bearing, haversine, type BBox } from '../../core/geo';
import { SECOND } from '../../core/time';
import { multiValues } from '../../layers/multi';
import type { InspectCard, LayerContext, LayerHandle, LegendSpec } from '../../layers/types';
import { trackLayer, type TrackObject } from '../../render/tracks';
import { fetchJson, describeError } from '../http';
import type { Resource } from '../resource';
import { API as DIGITRAFFIC } from './feed-digitraffic';
import { FEEDS, feedsInView, loadFeed } from './feeds';
import { speedText } from './traffic';
import { stationNames, trainDetail } from './trains';
import { fetchSegments, segmentFixes, type Segment } from './transitous';
import { KINDS, KIND_IDS, NO_DELAY, isTrainFix, kindOfMode, toTrack, type VehicleFix, type VehicleKind, type VehicleProps } from './vehicles';

export type Group = 'train' | 'local';

export interface KitOptions {
  group: Group;
  /** first zoom at which Transitous is queried */
  transitousZoom: number;
  /** first zoom at which anything is loaded and drawn */
  minZoom: number;
  /** kinds of this group, for option filter and legend */
  kinds: VehicleKind[];
}

export const kindLegend = (kinds: VehicleKind[]): LegendSpec => ({ type: 'classes', items: kinds.map((k) => ({ color: KINDS[k].color, label: KINDS[k].label })) });

const colorExpr = ['match', ['get', 'kind'], ...KIND_IDS.slice(0, -1).flatMap((k) => [k, KINDS[k].color]), KINDS.andere.color] as unknown as ExpressionSpecification;
const factor = ['match', ['get', 'kind'], ...KIND_IDS.slice(0, -1).flatMap((k) => [k, KINDS[k].size]), KINDS.andere.size];
const sizeExpr = (base: number[]) =>
  ['interpolate', ['linear'], ['zoom'], 4, ['*', factor, base[0]!], 8, ['*', factor, base[1]!], 12, ['*', factor, base[2]!], 16, ['*', factor, base[3]!]] as unknown as ExpressionSpecification;
const visibleFilter = ['any', ['get', 'hd'], ['<', ['get', 'kmh'], 2]] as unknown as FilterSpecification;

/** Delay text of a card: undefined when the feed has no real-time data. */
export function delayText(min: number): string {
  if (min === NO_DELAY) return '';
  if (min <= 0) return min < -1 ? `${min} min (früher)` : 'pünktlich';
  return `+${min} min`;
}

const expand = (b: BBox, f: number): BBox => {
  const dx = (b[2] - b[0]) * f, dy = (b[3] - b[1]) * f;
  return [Math.max(-180, b[0] - dx), Math.max(-85, b[1] - dy), Math.min(180, b[2] + dx), Math.min(85, b[3] + dy)];
};
const contains = (outer: BBox, inner: BBox) => outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];

export function mountVehicles(ctx: LayerContext, o: KitOptions, sizes: number[], extraFilter?: ReadonlySignal<FilterSpecification | undefined>): LayerHandle {
  const ml = ctx.map.ml;
  const keyIds = ['victoria', 'cta', 'trafiklab'];
  const keys = Object.fromEntries(keyIds.map((k) => [k, ctx.key(k)]));
  const keyOf = (id: string) => keys[id]?.peek();

  const segs = signal<Segment[] | undefined>(undefined);
  const feedFixes = new Map<string, VehicleFix[]>();
  const fixes = signal<VehicleFix[] | undefined>(undefined);
  const tracks = signal<TrackObject[] | undefined>(undefined);
  const state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const error = signal<string | undefined>(undefined);
  const updatedAt = signal<number | undefined>(undefined);
  const status = { data: tracks, state, error, updatedAt, reload: () => poll(true), dispose: () => {} } as unknown as Resource<TrackObject[]>;

  let disposed = false;
  let segBox: BBox | undefined;
  let segZoom = 0;
  let segAt = 0;
  let segBusy = false;
  const feedAt = new Map<string, number>();
  const feedBusy = new Set<string>();
  const feedErr = new Map<string, string>();
  const ctl = new AbortController();
  const prev = new Map<string, { lng: number; lat: number; heading?: number }>();
  const hidden = () => typeof document !== 'undefined' && document.hidden;

  const view = (): { bbox: BBox; zoom: number } => {
    const b = ml.getBounds();
    return { bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: ml.getZoom() };
  };

  /** Positions of everything in the view right now. */
  function rebuild() {
    const now = Date.now();
    const { zoom } = view();
    if (zoom < o.minZoom - 0.05) {
      tracks.value = [];
      return;
    }
    const kindOk = (k: VehicleKind) => (o.group === 'train' ? KINDS[k].rail : !KINDS[k].rail);
    const list: VehicleFix[] = [];
    // dedicated GPS feeds hide the matching Transitous feeds (no doubled vehicles in Finland, Norway …)
    const covered = [...feedFixes.keys()].flatMap((id) => FEEDS.find((f) => f.id === id)?.covers ?? []);
    const skip = (feed: string) => covered.some((c) => feed.toLowerCase().startsWith(c));
    const s = segs.peek();
    if (s) list.push(...segmentFixes(s, now, (m) => m !== 'AIRPLANE' && m !== 'OTHER' && kindOk(kindOfMode(m)), skip));
    for (const f of feedFixes.values()) for (const v of f) if (isTrainFix(v) === (o.group === 'train') && (v.train !== undefined || kindOk(v.kind))) list.push(v);
    // heading from consecutive fixes where the feed has none
    const seen = new Set<string>();
    const out: TrackObject[] = [];
    for (const v of list) {
      seen.add(v.id);
      const p = prev.get(v.id);
      let heading = v.heading ?? p?.heading;
      if (v.heading === undefined && p && haversine([p.lng, p.lat], [v.lng, v.lat]) > 0.025) heading = bearing([p.lng, p.lat], [v.lng, v.lat]);
      prev.set(v.id, { lng: v.lng, lat: v.lat, heading });
      out.push(toTrack({ ...v, heading }));
    }
    for (const k of prev.keys()) if (!seen.has(k)) prev.delete(k);
    tracks.value = out;
    fixes.value = list;
  }

  function summarize() {
    const notes: string[] = [];
    const { bbox, zoom } = view();
    if (zoom < o.minZoom - 0.05) notes.push(`Ab Zoomstufe ${o.minZoom} sichtbar`);
    else if (o.group === 'train' && zoom < o.transitousZoom) notes.push(`Fahrplanzüge (Transitous) ab Zoomstufe ${o.transitousZoom}`);
    if (feedErr.size) notes.push(`${[...feedErr.keys()].join(', ')} nicht erreichbar`);
    // keyed feeds that would cover this view but have no key (Boost of the local transport layer)
    if (o.group === 'local' && zoom >= o.minZoom - 0.05) {
      const missing = FEEDS.filter((f) => f.key && !keyOf(f.key) && f.bbox[0] < bbox[2] && f.bbox[2] > bbox[0] && f.bbox[1] < bbox[3] && f.bbox[3] > bbox[1]);
      if (missing.length) notes.push(`${missing.map((f) => f.label).join(', ')}: mit Schlüssel (Boost) verfügbar`);
    }
    error.value = notes.length ? notes.join(' · ') : undefined;
  }

  async function pollSegments(force: boolean) {
    const { bbox, zoom } = view();
    if (zoom < o.transitousZoom - 0.05 || zoom < o.minZoom - 0.05) {
      if (segs.peek()) { segs.value = undefined; segBox = undefined; }
      return;
    }
    const need = !segBox || !contains(segBox, bbox) || Math.round(zoom) !== segZoom || Date.now() - segAt > 75 * SECOND;
    if (!need && !force) return;
    if (segBusy) return;
    segBusy = true;
    state.value = segs.peek() ? state.peek() : 'loading';
    try {
      const box = expand(bbox, 0.1);
      const list = await fetchSegments(box, zoom, ctl.signal);
      if (disposed) return;
      segs.value = list;
      segBox = box;
      segZoom = Math.round(zoom);
      segAt = Date.now();
      updatedAt.value = segAt;
      feedErr.delete('Transitous');
    } catch (e) {
      if (disposed) return;
      feedErr.set('Transitous', describeError(e));
      segAt = Date.now() - 55 * SECOND; // retry in ~20 s
    } finally {
      segBusy = false;
    }
  }

  async function pollFeeds(force: boolean) {
    const { bbox, zoom } = view();
    if (zoom < o.minZoom - 0.05) {
      feedFixes.clear();
      return;
    }
    const active = feedsInView(bbox, FEEDS.map((f) => f.id), (id) => keyOf(id));
    for (const id of [...feedFixes.keys()]) if (!active.some((f) => f.id === id)) feedFixes.delete(id);
    await Promise.all(
      active.map(async (f) => {
        if (feedBusy.has(f.id) || (!force && Date.now() - (feedAt.get(f.id) ?? 0) < f.every)) return;
        // dedicated rail feeds (Finland) are only worth a request for the train layer; local feeds only for the local layer
        feedBusy.add(f.id);
        try {
          const list = await loadFeed(f, expand(bbox, 0.3), f.key ? keyOf(f.key) : undefined, ctl.signal);
          if (disposed) return;
          feedFixes.set(f.id, list);
          feedErr.delete(f.label);
          updatedAt.value = Date.now();
        } catch (e) {
          if (disposed || (e as Error)?.name === 'AbortError') return;
          feedErr.set(f.label, describeError(e));
          feedFixes.delete(f.id);
        } finally {
          feedAt.set(f.id, Date.now());
          feedBusy.delete(f.id);
        }
      }),
    );
  }

  async function poll(force = false) {
    if (disposed || (hidden() && !force)) return;
    await Promise.all([pollSegments(force), pollFeeds(force)]);
    if (disposed) return;
    rebuild();
    summarize();
    state.value = 'ready';
  }

  // --- scheduling: on map moves (debounced), every few seconds for dead reckoning, only while visible
  let moveTimer: ReturnType<typeof setTimeout> | undefined;
  const onMove = () => { clearTimeout(moveTimer); moveTimer = setTimeout(() => void poll(), 400); };
  ml.on('moveend', onMove);
  const tick = setInterval(() => { if (!hidden()) { void poll(); rebuild(); } }, 2.5 * SECOND);
  const onVisible = () => { if (!hidden()) void poll(); };
  document.addEventListener('visibilitychange', onVisible);
  const stopKeys = effect(() => { keyIds.forEach((k) => keys[k]!.value); feedAt.clear(); if (!disposed) void poll(true); });

  // --- filter, count
  const kindOpt = computed(() => multiValues(ctx.options.value.kind));
  const filter = computed<FilterSpecification | undefined>(() => {
    const k = kindOpt.value;
    const clauses: unknown[] = [visibleFilter];
    if (k) clauses.push(['in', ['get', 'kind'], ['literal', k]]);
    const ef = extraFilter?.value;
    if (ef) clauses.push(ef);
    return ['all', ...clauses] as FilterSpecification;
  });
  const count = computed(() => {
    const t = tracks.value;
    if (!t) return undefined;
    const k = kindOpt.value;
    return t.filter((x) => {
      const p = x.props as unknown as VehicleProps;
      return (p.hd || p.kmh < 2) && (!k || k.includes(p.kind));
    }).length;
  });

  // --- card
  let names: Promise<Record<string, string>> | undefined;
  const loadNames = () => (names ??= fetchJson<unknown>(`${DIGITRAFFIC}/metadata/stations`).then((r) => stationNames(r.data)).catch(() => ({})));

  function describe(t: TrackObject, now: number): InspectCard {
    const p = t.props as unknown as VehicleProps;
    const k = KINDS[p.kind];
    const facts: InspectCard['facts'] = [];
    if (p.from || p.to) facts.push({ label: 'Strecke', value: [p.from, p.to].filter(Boolean).join(' → '), emphasis: true });
    if (p.next) facts.push({ label: 'Nächster Halt', value: p.next });
    if (p.delay !== NO_DELAY) facts.push({ label: 'Verspätung', value: delayText(p.delay), emphasis: p.delay >= 5 });
    else if (p.src === 'Transitous') facts.push({ label: 'Verspätung', value: 'keine Echtzeitdaten' });
    if (p.kmh >= 0) facts.push({ label: 'Geschwindigkeit', value: p.kmh < 2 ? 'steht' : speedText(p.kmh / 3.6, false) });
    if (p.op) facts.push({ label: 'Betreiber', value: p.op });
    facts.push({ label: 'Art', value: k.label });
    facts.push({ label: 'Quelle', value: p.src + (p.src === 'Transitous' ? ' (Position aus Fahrplan berechnet)' : '') });
    const base: InspectCard = {
      title: p.line || k.label, subtitle: k.label, color: k.color, icon: 'train', facts, location: [t.lng, t.lat],
      links: p.src === 'Transitous' ? [{ label: 'Transitous', url: 'https://transitous.org/' }] : undefined,
    };
    if (p.src === 'Transitous' && p.trip) {
      void fetchJson<{ legs?: { agencyName?: string; headsign?: string; tripFrom?: { name?: string }; tripTo?: { name?: string }; displayName?: string }[] }>(
        `https://api.transitous.org/api/v5/trip?tripId=${encodeURIComponent(p.trip)}`, { signal: ctx.signal },
      ).then((r) => {
        const leg = r.data.legs?.[0];
        if (!leg || ctx.signal.aborted || ctx.selection.peek() !== base) return;
        const f = base.facts.filter((x) => x.label !== 'Strecke' && x.label !== 'Betreiber');
        f.unshift({ label: 'Strecke', value: `${leg.tripFrom?.name ?? '?'} → ${leg.tripTo?.name ?? leg.headsign ?? '?'}`, emphasis: true });
        if (leg.agencyName) f.splice(Math.min(f.length, 4), 0, { label: 'Betreiber', value: leg.agencyName });
        ctx.select({ ...base, title: leg.displayName || base.title, facts: f });
      }).catch(() => undefined);
    } else if (p.src.startsWith('Digitraffic') && p.trip) {
      const [date, num] = p.trip.split('/');
      void Promise.all([fetchJson<unknown>(`${DIGITRAFFIC}/trains/${date}/${num}`, { signal: ctx.signal }), loadNames()]).then(([tr, n]) => {
        const d = trainDetail(tr.data, n, Number(num));
        if (!d || ctx.signal.aborted || ctx.selection.peek() !== base) return;
        const f = base.facts.filter((x) => x.label !== 'Betreiber');
        f.unshift({ label: 'Strecke', value: `${d.from} → ${d.to}`, emphasis: true });
        if (d.delay !== undefined) f.push({ label: 'Verspätung', value: delayText(d.delay), emphasis: d.delay >= 5 });
        if (d.lastStation) f.push({ label: 'Letzter Halt', value: d.lastStation });
        if (d.operator) f.push({ label: 'Betreiber', value: d.operator.toUpperCase() });
        ctx.select({ ...base, title: d.title, subtitle: d.category, facts: f });
      }).catch(() => undefined);
    }
    void now;
    return base;
  }

  const handle = trackLayer(ctx, {
    data: tracks,
    resources: [status],
    color: colorExpr,
    symbol: { icon: 'arrow', size: sizeExpr(sizes) },
    filter,
    count,
    maxExtrapolateMs: 45 * SECOND,
    tickMs: o.group === 'local' ? 250 : 150,
    describe,
  });
  return {
    destroy() {
      disposed = true;
      ctl.abort();
      clearTimeout(moveTimer);
      clearInterval(tick);
      ml.off('moveend', onMove);
      document.removeEventListener('visibilitychange', onVisible);
      stopKeys();
      handle.destroy();
    },
  };
}
