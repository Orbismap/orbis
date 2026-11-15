// areaLayer: GeoJSON polygons with fill, outline, hover highlight and selection outline.
import { effect, signal, type ReadonlySignal } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification, GeoJSONSourceSpecification, LayerSpecification } from 'maplibre-gl';
import type { Resource } from '../data/resource';
import type { FeedItem, InspectCard, LayerContext, LayerHandle } from '../layers/types';
import type { SlotId } from '../map/types';
import {
  Cleanup, EMPTY_FC, HOVER, LIMB, bindOpacity, bindProp, createLookup, dataSignal, ensureIds, idBase, isSignal, peek, resourcesOf, trackStatus, unwrap,
  type AnyFeature, type Dyn, type Expr, type FeatureData, type NumOrExpr,
  withCards, featureFinder,
} from './common';
import { ringFilter } from './pointstyle';

export interface AreaLayerOptions {
  data: FeatureData;
  resources?: Resource<unknown>[];
  /** Default 'areas'. */
  slot?: SlotId;
  name?: string;
  idKey?: string;
  fill: Dyn<string | Expr>;
  /** 0..1, default 0.35 */
  fillOpacity?: Dyn<NumOrExpr>;
  /** Outline; false = none. Default: same colour as the fill, 1 px. */
  outline?: false | { color?: string | Expr; width?: number; opacity?: Dyn<NumOrExpr> };
  filter?: ReadonlySignal<FilterSpecification | undefined>;
  describe?(feature: AnyFeature): InspectCard;
  /** Optional guard: clicks on features for which this returns false are ignored. */
  clickable?(feature: AnyFeature): boolean;
  feed?(features: AnyFeature[]): FeedItem[];
  minZoom?: number;
  count?: ReadonlySignal<number | undefined>;
  /** false: do not report loading/ready (when another kit of the same layer already reports it). */
  status?: boolean;
}

export function areaLayer(ctx: LayerContext, o: AreaLayerOptions): LayerHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const idKey = o.idKey ?? 'id';
  const base = idBase(ctx, o.name);
  const src = `${base}-src`;
  const clean = new Cleanup();
  const data = dataSignal(o.data);
  const slot = o.slot ?? 'areas';
  const fillOpacityDyn = o.fillOpacity ?? 0.35;
  const fillOpacityIsSignal = isSignal<NumOrExpr>(fillOpacityDyn);
  const fillOpacityInitial = unwrap<NumOrExpr>(fillOpacityDyn);
  const zoom = o.minZoom !== undefined ? { minzoom: o.minZoom } : {};
  const filter = o.filter?.peek();
  const f = filter ? { filter } : {};
  const fillId = `${base}-fill`;
  const lineId = `${base}-outline`;
  const selId = `${base}-selected`;
  const outline = o.outline === undefined ? { width: 1 } : o.outline;
  const outlineOpacityDyn = (outline && outline.opacity) ? outline.opacity : 0.85;
  const outlineOpacityIsSignal = isSignal<NumOrExpr>(outlineOpacityDyn);
  const outlineOpacityInitial = unwrap<NumOrExpr>(outlineOpacityDyn);
  const hoverBoost = ['min', 1, ['+', fillOpacityInitial, ['case', HOVER, 0.15, 0]]] as unknown as ExpressionSpecification;

  engine.addSource(src, { type: 'geojson', data: EMPTY_FC, promoteId: idKey } as GeoJSONSourceSpecification);
  const layers: LayerSpecification[] = [
    { id: fillId, type: 'fill', source: src, ...zoom, ...f, paint: { 'fill-color': peek(o.fill), 'fill-opacity': hoverBoost, 'fill-antialias': false } } as LayerSpecification,
  ];
  if (outline) {
    layers.push({
      id: lineId, type: 'line', source: src, ...zoom, ...f, layout: { 'line-join': 'round' },
      paint: { 'line-color': outline.color ?? peek(o.fill), 'line-width': outline.width ?? 1, 'line-opacity': outlineOpacityInitial },
    } as LayerSpecification);
  }
  layers.push({
    id: selId, type: 'line', source: src, ...zoom, filter: ringFilter(idKey, null), layout: { 'line-join': 'round' },
    paint: { 'line-color': LIMB, 'line-width': 2.5 },
  } as LayerSpecification);
  for (const l of layers) engine.addLayer(l, slot);

  clean.add(effect(() => { (ml.getSource(src) as { setData(d: unknown): void } | undefined)?.setData(data.value ? ensureIds(data.value, idKey) : EMPTY_FC); }));
  if (o.feed) clean.add(effect(() => { const fc = data.value; if (fc) { const feats = fc.features as AnyFeature[]; const items = o.feed!(feats); ctx.feed(o.describe ? withCards(items, featureFinder(feats, idKey), o.describe) : items); }; }));
  if (o.status !== false) clean.add(trackStatus(ctx, data, resourcesOf(o.data, o.resources), o.count));
  clean.add(bindProp(ml, fillId, 'paint', 'fill-color', o.fill));
  if (outline && !outline.color) clean.add(bindProp(ml, lineId, 'paint', 'line-color', o.fill));
  if (o.filter) {
    const flt = o.filter;
    clean.add(effect(() => { for (const id of [fillId, lineId]) if (ml.getLayer(id)) ml.setFilter(id, flt.value ?? null); }));
  }
  const targets: { layer: string; prop: string; base: NumOrExpr }[] = [];
  if (!fillOpacityIsSignal) targets.push({ layer: fillId, prop: 'fill-opacity', base: hoverBoost });
  if (outline && !outlineOpacityIsSignal) targets.push({ layer: lineId, prop: 'line-opacity', base: outlineOpacityInitial });
  clean.add(bindOpacity(ctx, ml, targets));
  if (fillOpacityIsSignal) {
    clean.add(effect(() => {
      const fo = (fillOpacityDyn as ReadonlySignal<NumOrExpr>).value;
      const hb = ['min', 1, ['+', fo, ['case', HOVER, 0.15, 0]]] as unknown as ExpressionSpecification;
      const opacity = ctx.opacity.value;
      if (ml.getLayer(fillId)) ml.setPaintProperty(fillId, 'fill-opacity', ['*', hb, opacity] as unknown as ExpressionSpecification);
    }));
  }
  if (outline && outlineOpacityIsSignal) {
    clean.add(effect(() => {
      const oo = (outlineOpacityDyn as ReadonlySignal<NumOrExpr>).value;
      const opacity = ctx.opacity.value;
      if (ml.getLayer(lineId)) ml.setPaintProperty(lineId, 'line-opacity', ['*', oo, opacity] as unknown as ExpressionSpecification);
    }));
  }

  const selectedId = signal<unknown>(null);
  let lastCard: InspectCard | null = null;
  clean.add(effect(() => { const c = ctx.selection.value; if (c !== lastCard && !ctx.ownSelection?.(c)) selectedId.value = null; }));
  clean.add(effect(() => { if (ml.getLayer(selId)) ml.setFilter(selId, ringFilter(idKey, selectedId.value)); }));

  const lookup = createLookup(idKey);
  if (o.describe) {
    clean.add(
      engine.onPick([fillId], {
        click(feat, ll) {
          const id = (feat.properties as Record<string, unknown> | null)?.[idKey] ?? feat.id;
          const full = (lookup(data.peek(), id) ?? feat) as AnyFeature;
          if (o.clickable && !o.clickable(full)) return;
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
