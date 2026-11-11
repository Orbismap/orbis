// lineLayer: GeoJSON lines with optional casing, hover widening and selection highlight.
import { effect, signal, type ReadonlySignal } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification, GeoJSONSourceSpecification, LayerSpecification } from 'maplibre-gl';
import type { Resource } from '../data/resource';
import type { FeedItem, InspectCard, LayerContext, LayerHandle } from '../layers/types';
import type { SlotId } from '../map/types';
import {
  Cleanup, DARK_HALO, EMPTY_FC, HOVER, LIMB, bindOpacity, bindProp, createLookup, dataSignal, ensureIds, idBase, mapOutputs, peek, resourcesOf, trackStatus,
  type AnyFeature, type Dyn, type Expr, type FeatureData, type NumOrExpr,
  withCards, featureFinder,
} from './common';
import { ringFilter } from './pointstyle';

export interface LineLayerOptions {
  data: FeatureData;
  resources?: Resource<unknown>[];
  /** Default 'lines'. */
  slot?: SlotId;
  name?: string;
  idKey?: string;
  color: Dyn<string | Expr>;
  /** px, number or (zoom) expression */
  width: Dyn<NumOrExpr>;
  dash?: number[];
  /** Dark outline under the line so it reads on any basemap. true = 1 px each side. */
  casing?: boolean | { color?: string; extra?: number };
  opacity?: number;
  filter?: ReadonlySignal<FilterSpecification | undefined>;
  describe?(feature: AnyFeature): InspectCard;
  feed?(features: AnyFeature[]): FeedItem[];
  minZoom?: number;
  count?: ReadonlySignal<number | undefined>;
}

const widen = (e: NumOrExpr, k: number): Expr => ['*', e, ['case', HOVER, k, 1]] as Expr;
const plus = (e: NumOrExpr, n: number): Expr => ['+', e, n] as Expr;

export function lineLayer(ctx: LayerContext, o: LineLayerOptions): LayerHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const idKey = o.idKey ?? 'id';
  const base = idBase(ctx, o.name);
  const src = `${base}-src`;
  const clean = new Cleanup();
  const data = dataSignal(o.data);
  const slot = o.slot ?? 'lines';
  const opacity = o.opacity ?? 1;
  const width = peek(o.width);
  const zoom = o.minZoom !== undefined ? { minzoom: o.minZoom } : {};
  const filter = o.filter?.peek();
  const f = filter ? { filter } : {};

  engine.addSource(src, { type: 'geojson', data: EMPTY_FC, promoteId: idKey, lineMetrics: false } as GeoJSONSourceSpecification);
  const cap = { 'line-cap': 'round', 'line-join': 'round' } as const;
  const selected = `${base}-selected`;
  const casing = `${base}-casing`;
  const main = `${base}-lines`;
  const layers: LayerSpecification[] = [
    {
      id: selected, type: 'line', source: src, ...zoom, filter: ringFilter(idKey, null), layout: cap,
      paint: { 'line-color': LIMB, 'line-width': mapOutputs(width, (e) => plus(e, 5)) as NumOrExpr as number, 'line-opacity': 0.55 },
    } as LayerSpecification,
  ];
  if (o.casing) {
    const c = o.casing === true ? {} : o.casing;
    layers.push({
      id: casing, type: 'line', source: src, ...zoom, ...f, layout: cap,
      paint: { 'line-color': c.color ?? DARK_HALO, 'line-width': mapOutputs(width, (e) => plus(e, 2 * (c.extra ?? 1))) as ExpressionSpecification | number, 'line-opacity': 0.8 },
    } as LayerSpecification);
  }
  layers.push({
    id: main, type: 'line', source: src, ...zoom, ...f,
    layout: cap,
    paint: {
      'line-color': peek(o.color),
      'line-width': mapOutputs(width, (e) => widen(e, 1.6)) as ExpressionSpecification | number,
      'line-opacity': opacity,
      ...(o.dash ? { 'line-dasharray': o.dash } : {}),
    },
  } as LayerSpecification);
  for (const l of layers) engine.addLayer(l, slot);

  clean.add(effect(() => { (ml.getSource(src) as { setData(d: unknown): void } | undefined)?.setData(data.value ? ensureIds(data.value, idKey) : EMPTY_FC); }));
  if (o.feed) clean.add(effect(() => { const fc = data.value; if (fc) { const feats = fc.features as AnyFeature[]; const items = o.feed!(feats); ctx.feed(o.describe ? withCards(items, featureFinder(feats, idKey), o.describe) : items); }; }));
  clean.add(trackStatus(ctx, data, resourcesOf(o.data, o.resources), o.count));
  clean.add(bindProp(ml, main, 'paint', 'line-color', o.color));
  clean.add(bindProp(ml, main, 'paint', 'line-width', o.width, (w) => mapOutputs(w, (e) => widen(e, 1.6))));
  if (o.casing) clean.add(bindProp(ml, casing, 'paint', 'line-width', o.width, (w) => mapOutputs(w, (e) => plus(e, 2 * (typeof o.casing === 'object' ? (o.casing.extra ?? 1) : 1)))));
  if (o.filter) {
    const flt = o.filter;
    clean.add(effect(() => { for (const id of [main, casing]) if (ml.getLayer(id)) ml.setFilter(id, flt.value ?? null); }));
  }
  const targets = [{ layer: main, prop: 'line-opacity', base: opacity }, { layer: selected, prop: 'line-opacity', base: 0.55 }];
  if (o.casing) targets.push({ layer: casing, prop: 'line-opacity', base: 0.8 });
  clean.add(bindOpacity(ctx, ml, targets));

  const selectedId = signal<unknown>(null);
  let lastCard: InspectCard | null = null;
  clean.add(effect(() => { const c = ctx.selection.value; if (c !== lastCard && !ctx.ownSelection?.(c)) selectedId.value = null; }));
  clean.add(effect(() => { if (ml.getLayer(selected)) ml.setFilter(selected, ringFilter(idKey, selectedId.value)); }));

  const lookup = createLookup(idKey);
  if (o.describe) {
    clean.add(
      engine.onPick([main], {
        click(feat, ll) {
          const id = (feat.properties as Record<string, unknown> | null)?.[idKey] ?? feat.id;
          const card = o.describe!((lookup(data.peek(), id) ?? feat) as AnyFeature);
          card.location ??= ll;
          lastCard = card;
          selectedId.value = id;
          ctx.select(card);
        },
      }),
    );
  }
  const ids = layers.map((l) => l.id);
  return {
    destroy() {
      clean.run();
      engine.remove({ layers: [...ids].reverse(), sources: [src] });
    },
  };
}
