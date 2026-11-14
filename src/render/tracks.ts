// trackLayer: moving objects (aircraft, ships, satellites). Positions are dead-reckoned between data updates and pushed
// to the map at most 10 Hz, only while the tab is visible.
import { effect, signal, type ReadonlySignal } from '@preact/signals';
import type { FilterSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { destination } from '../core/geo';
import type { Resource } from '../data/resource';
import type { FeedItem, InspectCard, LayerContext, LayerHandle } from '../layers/types';
import type { SlotId } from '../map/types';
import { Cleanup, withCards, EMPTY_FC, bindOpacity, bindProp, idBase, isSignal, peek, trackStatus, type Dyn, type Expr, type NumOrExpr } from './common';
import { ensureIcons } from './icons';
import { andFilter, pointSpecs, ringFilter, type SymbolStyle } from './pointstyle';

export interface TrackObject {
  id: string;
  lng: number;
  lat: number;
  /** degrees clockwise from north */
  heading?: number;
  /** m/s over ground */
  speed?: number;
  /** time of the position fix, ms since epoch */
  t: number;
  /** extra properties; available to expressions as ['get', key] */
  props?: Record<string, string | number | boolean | undefined>;
}

export interface TrackLayerOptions {
  data: ReadonlySignal<TrackObject[] | undefined> | Resource<TrackObject[]>;
  resources?: Resource<unknown>[];
  /** Default 'points'. */
  slot?: SlotId;
  name?: string;
  color: Dyn<string | Expr>;
  /** Icon of the objects; rotated by heading unless `rotate` is given. */
  symbol: { icon: string; size: Dyn<NumOrExpr>; rotate?: Dyn<NumOrExpr> };
  /** Halo (outline) of the icons, same meaning as in pointLayer. */
  stroke?: { color: string; width: number };
  /** Radius of the selection ring in px, default 14. */
  ringRadius?: number;
  /** Positions are extrapolated for at most this long after the fix, default 2 min. */
  maxExtrapolateMs?: number;
  /** Update interval of the source, default 100 ms (10 Hz). */
  tickMs?: number;
  filter?: ReadonlySignal<FilterSpecification | undefined>;
  describe(track: TrackObject, now: number): InspectCard;
  feed?(tracks: TrackObject[]): FeedItem[];
  minZoom?: number;
  /** True: icons and ring are hidden and no positions are pushed (data, status and feed keep running); an extension presents the objects. */
  hidden?: ReadonlySignal<boolean>;
  count?: ReadonlySignal<number | undefined>;
}

/** Aircraft on the ground or below this height (m) that went silent have most likely landed: they stop soon. */
export const LOW_ALT_M = 150;
export const LOW_ALT_MAX_MS = 30_000;

/** Position of a track `now`, assuming it keeps heading and speed. */
export function extrapolate(t: TrackObject, now: number, maxMs: number): [number, number] {
  if (!t.speed || t.heading === undefined) return [t.lng, t.lat];
  const p = t.props;
  // aircraft (they carry `gnd` and `alt`): a silent one near the ground has landed, it does not fly on for minutes
  if (p && 'gnd' in p && (p.gnd || (typeof p.alt === 'number' && p.alt < LOW_ALT_M))) maxMs = Math.min(maxMs, LOW_ALT_MAX_MS);
  const dt = Math.max(0, Math.min(now - t.t, maxMs));
  return destination([t.lng, t.lat], t.heading, (t.speed * dt) / 1000 / 1000);
}

const asData = (d: TrackLayerOptions['data']): ReadonlySignal<TrackObject[] | undefined> => ('reload' in d ? d.data : d);

export function trackLayer(ctx: LayerContext, o: TrackLayerOptions): LayerHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const base = idBase(ctx, o.name);
  const src = `${base}-src`;
  const clean = new Cleanup();
  const data = asData(o.data);
  const maxMs = o.maxExtrapolateMs ?? 120_000;
  const slot = o.slot ?? 'points';

  engine.addSource(src, { type: 'geojson', data: EMPTY_FC, promoteId: 'id' });
  ensureIcons(ml, [o.symbol.icon]);
  const symbol: SymbolStyle = { icon: o.symbol.icon, size: peek(o.symbol.size), rotate: o.symbol.rotate === undefined ? ['get', 'heading'] : peek(o.symbol.rotate) };
  const specs = pointSpecs(base, src, undefined, { radius: o.ringRadius ?? 14, color: peek(o.color), stroke: o.stroke, symbol, minZoom: o.minZoom }, andFilter(o.filter?.peek()), 'id');
  engine.addLayer(specs.main, slot);
  engine.addLayer(specs.ring, slot);
  const main = specs.main.id;

  const byId = new Map<string, TrackObject>();
  const toFc = (now: number): FeatureCollection => {
    const list = data.peek() ?? [];
    const features: Feature<Point>[] = list.map((t) => ({
      type: 'Feature',
      id: t.id,
      geometry: { type: 'Point', coordinates: extrapolate(t, now, maxMs) },
      properties: { ...t.props, id: t.id, heading: t.heading ?? 0, speed: t.speed ?? 0 },
    }));
    return { type: 'FeatureCollection', features };
  };
  const push = () => (ml.getSource(src) as { setData(d: unknown): void } | undefined)?.setData(toFc(Date.now()));

  clean.add(effect(() => {
    const list = data.value;
    byId.clear();
    for (const t of list ?? []) byId.set(t.id, t);
    push();
  }));
  // dead reckoning while the tab is visible and something moves
  const tick = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (o.hidden?.peek()) return;
    const list = data.peek();
    if (list?.some((t) => t.speed && t.heading !== undefined)) push();
  }, o.tickMs ?? 100);
  clean.add(() => clearInterval(tick));

  if (o.feed) clean.add(effect(() => { const l = data.value; if (l) ctx.feed(withCards(o.feed!(l), (id) => l.find((t) => t.id === id), (t) => o.describe(t, Date.now()))); }));
  if (o.hidden) {
    const hidden = o.hidden;
    clean.add(effect(() => {
      const off = hidden.value;
      for (const id of [specs.main.id, specs.ring.id]) if (ml.getLayer(id)) ml.setLayoutProperty(id, 'visibility', off ? 'none' : 'visible');
      if (!off) push();
    }));
  }
  clean.add(trackStatus(ctx, data, o.resources ?? ('reload' in o.data ? [o.data] : []), o.count));
  clean.add(bindProp(ml, main, 'paint', 'icon-color', o.color));
  if (isSignal(o.symbol.size)) clean.add(bindProp(ml, main, 'layout', 'icon-size', o.symbol.size));
  if (o.filter) {
    const f = o.filter;
    clean.add(effect(() => { if (ml.getLayer(main)) ml.setFilter(main, andFilter(f.value) ?? null); }));
  }
  clean.add(bindOpacity(ctx, ml, specs.opacity));

  const selectedId = signal<unknown>(null);
  let lastCard: InspectCard | null = null;
  clean.add(effect(() => { const c = ctx.selection.value; if (c !== lastCard && !ctx.ownSelection?.(c)) selectedId.value = null; }));
  clean.add(effect(() => { if (ml.getLayer(specs.ring.id)) ml.setFilter(specs.ring.id, ringFilter('id', selectedId.value)); }));
  clean.add(
    engine.onPick([main], {
      click(f) {
        const id = String((f.properties as Record<string, unknown> | null)?.id ?? f.id);
        const t = byId.get(id);
        if (!t) return;
        const now = Date.now();
        const card = o.describe(t, now);
        card.location ??= extrapolate(t, now, maxMs);
        lastCard = card;
        selectedId.value = id;
        ctx.select(card);
      },
    }),
  );
  const ids = [main, specs.ring.id];
  return {
    destroy() {
      clean.run();
      engine.remove({ layers: [...ids].reverse(), sources: [src] });
    },
  };
}

