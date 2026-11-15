// Shared helpers of the render kits.
import { effect, type ReadonlySignal } from '@preact/signals';
import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Resource } from '../data/resource';
import type { FeedItem, InspectCard, LayerContext, LayerStatus } from '../layers/types';

/** A value or a signal of it; kits re-apply paint/layout when the signal changes. */
export type Dyn<T> = T | ReadonlySignal<T>;
export type Expr = ExpressionSpecification;
export type NumOrExpr = number | Expr;
export type AnyFeature = Feature<Geometry, Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type FeatureData = ReadonlySignal<FeatureCollection | undefined> | Resource<FeatureCollection>;

export const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

export const isSignal = <T>(v: unknown): v is ReadonlySignal<T> =>
  typeof v === 'object' && v !== null && 'peek' in v && 'subscribe' in v && typeof (v as { peek: unknown }).peek === 'function';
export const unwrap = <T>(v: Dyn<T>): T => (isSignal<T>(v) ? v.value : v);
export const peek = <T>(v: Dyn<T>): T => (isSignal<T>(v) ? v.peek() : v);
const isResource = (v: unknown): v is Resource<FeatureCollection> => typeof v === 'object' && v !== null && 'reload' in v && 'state' in v;

export const dataSignal = (d: FeatureData): ReadonlySignal<FeatureCollection | undefined> => (isResource(d) ? d.data : d);
export const resourcesOf = (d: FeatureData, extra: Resource<unknown>[] = []): Resource<unknown>[] => (isResource(d) ? [d, ...extra] : extra);

/** Collects cleanup functions. */
export class Cleanup {
  private fns: (() => void)[] = [];
  add(fn: () => void): void {
    this.fns.push(fn);
  }
  run(): void {
    for (const fn of this.fns.splice(0).reverse()) {
      try {
        fn();
      } catch {
        /* map may already be gone */
      }
    }
  }
}

export const idBase = (ctx: LayerContext, name?: string) => (name ? `${ctx.id}.${name}` : ctx.id);

/** Reports loading/ready/empty/error with count and age from the data and the resources behind it. */
export function trackStatus(
  ctx: LayerContext,
  data: ReadonlySignal<unknown[] | FeatureCollection | undefined>,
  resources: Resource<unknown>[] = [],
  count?: ReadonlySignal<number | undefined>,
): () => void {
  return effect(() => {
    const d = data.value;
    const errors = resources.map((r) => r.error.value).filter(Boolean);
    const stamps = resources.map((r) => r.updatedAt.value).filter((v): v is number => v !== undefined);
    resources.forEach((r) => r.state.value);
    const updatedAt = stamps.length ? Math.min(...stamps) : undefined;
    const note = errors[0];
    let s: LayerStatus;
    if (d === undefined) s = errors.length && resources.every((r) => r.state.value === 'error') ? { state: 'error', note } : { state: 'loading' };
    else {
      const n = count?.value ?? (Array.isArray(d) ? d.length : d.features.length);
      s = { state: n === 0 ? 'empty' : 'ready', count: n, updatedAt, note };
    }
    ctx.status(s);
  });
}

/** Applies `ctx.opacity` to paint properties: value = base × opacity. */
export function bindOpacity(ctx: LayerContext, ml: MlMap, targets: { layer: string; prop: string; base: NumOrExpr }[]): () => void {
  return effect(() => {
    const o = ctx.opacity.value;
    for (const t of targets) {
      if (!ml.getLayer(t.layer)) continue;
      const base = t.base;
      // If base is a zoom curve, scale its output values by o (can't wrap in '*' — MapLibre forbids zoom nested in '*').
      let value: NumOrExpr;
      if (Array.isArray(base) && (base[0] === 'interpolate' || base[0] === 'step') && Array.isArray(base[2]) && base[2][0] === 'zoom') {
        value = mapOutputs(base as NumOrExpr, (v) => (typeof v === 'number' ? v * o : v));
      } else if (typeof base === 'number') {
        value = base * o;
      } else {
        value = (['*', base, o] as unknown) as NumOrExpr;
      }
      ml.setPaintProperty(t.layer, t.prop as 'circle-opacity', value as any);
    }
  });
}

/** Re-applies a Dyn value to a paint or layout property whenever it changes. */
export function bindProp<T>(ml: MlMap, layer: string, kind: 'paint' | 'layout', prop: string, value: Dyn<T>, transform: (v: T) => unknown = (v) => v): () => void {
  if (!isSignal<T>(value)) return () => {};
  return effect(() => {
    const v = transform(value.value);
    if (!ml.getLayer(layer)) return;
    if (kind === 'paint') ml.setPaintProperty(layer, prop as 'circle-color', v as string);
    else ml.setLayoutProperty(layer, prop as 'icon-size', v as number);
  });
}

/** Applies `fn` to the output values of a zoom curve (interpolate/step on zoom), or to the whole value. */
export function mapOutputs(expr: NumOrExpr, fn: (e: NumOrExpr) => NumOrExpr): NumOrExpr {
  if (Array.isArray(expr)) {
    const e = expr as unknown as unknown[];
    if (e[0] === 'interpolate' && Array.isArray(e[2]) && e[2][0] === 'zoom') {
      return [...e.slice(0, 3), ...e.slice(3).map((v, i) => (i % 2 === 1 ? fn(v as NumOrExpr) : v))] as unknown as Expr;
    }
    if (e[0] === 'step' && Array.isArray(e[1]) && e[1][0] === 'zoom') {
      return e.map((v, i) => (i === 2 || (i > 2 && i % 2 === 0) ? fn(v as NumOrExpr) : v)) as unknown as Expr;
    }
  }
  return fn(expr);
}

export const HOVER: Expr = ['boolean', ['feature-state', 'hover'], false];

/** Looks features up by their id property; rebuilt only when the collection object changes. */
export function createLookup(idKey: string) {
  let cachedFor: FeatureCollection | undefined;
  let index = new Map<unknown, Feature>();
  return (fc: FeatureCollection | undefined, id: unknown): Feature | undefined => {
    if (!fc) return undefined;
    if (cachedFor !== fc) {
      cachedFor = fc;
      index = new Map(fc.features.map((f) => [(f.properties as Record<string, unknown> | null)?.[idKey] ?? f.id, f]));
    }
    return index.get(id);
  };
}

/** Makes sure features have the id property that hover/selection use (copies only when needed). */
export function ensureIds(fc: FeatureCollection, idKey: string): FeatureCollection {
  const needs = fc.features.slice(0, 5).some((f) => (f.properties as Record<string, unknown> | null)?.[idKey] === undefined);
  if (!needs) return fc;
  return { ...fc, features: fc.features.map((f, i) => ({ ...f, properties: { ...(f.properties ?? {}), [idKey]: f.id ?? i } })) };
}

export const DARK_HALO = 'rgba(10, 15, 24, 0.85)';
export const LIMB = '#72C8F0';

/**
 * Gives feed items a lazy `card` (what clicking the feature would open). `find` resolves the item id to the source
 * feature/track; the card is only built when a feed row is clicked, so big feeds cost nothing.
 */
export function withCards<T>(items: FeedItem[], find: (id: string) => T | undefined, describe: (x: T) => InspectCard): FeedItem[] {
  for (const it of items) {
    if ('card' in it) continue;
    let cached: InspectCard | undefined;
    Object.defineProperty(it, 'card', {
      enumerable: false,
      get() {
        if (cached) return cached;
        const x = find(it.id);
        if (x === undefined) return undefined;
        cached = describe(x);
        if (!cached.location) cached = { ...cached, location: it.location };
        return cached;
      },
    });
  }
  return items;
}

/** Index features by id (properties[idKey] or feature id) on first use. */
export function featureFinder(features: AnyFeature[], idKey: string): (id: string) => AnyFeature | undefined {
  let map: Map<string, AnyFeature> | undefined;
  return (id) => {
    if (!map) {
      map = new Map();
      for (const f of features) map.set(String(f.properties?.[idKey] ?? f.id), f);
    }
    return map.get(id);
  };
}
