// pointLayer: GeoJSON points as circles or SDF symbols, optional clusters, hover, selection ring.
import { effect, signal, type ReadonlySignal } from '@preact/signals';
import type { FilterSpecification, GeoJSONSourceSpecification } from 'maplibre-gl';
import type { Resource } from '../data/resource';
import type { FeedItem, InspectCard, LayerContext, LayerHandle } from '../layers/types';
import type { SlotId } from '../map/types';
import {
  Cleanup, EMPTY_FC, bindOpacity, bindProp, createLookup, dataSignal, ensureIds, idBase, mapOutputs, peek, resourcesOf, trackStatus,
  type AnyFeature, type Dyn, type Expr, type FeatureData, type NumOrExpr,
  withCards, featureFinder,
} from './common';
import { ensureIcons } from './icons';
import { andFilter, clusterSpecs, hoverScale, pointSpecs, ringFilter, type SymbolStyle } from './pointstyle';

export interface PointLayerOptions {
  /** GeoJSON points. Features need `properties.id` (or a feature id) for hover and selection. */
  data: FeatureData;
  /** Extra resources whose state/age should be reported when `data` is a computed signal. */
  resources?: Resource<unknown>[];
  /** Default 'points'. */
  slot?: SlotId;
  /** Suffix for the map layer ids when one layer uses several kits. */
  name?: string;
  /** Property holding the unique id, default 'id'. */
  idKey?: string;
  cluster?: boolean | { radius?: number; maxZoom?: number };
  radius: Dyn<NumOrExpr>;
  color: Dyn<string | Expr>;
  stroke?: { color?: string; width?: number };
  symbol?: { icon: string; size: Dyn<NumOrExpr>; rotate?: Dyn<NumOrExpr> };
  sortKey?: NumOrExpr;
  /** Map-side filter (expression); not applied to clusters. */
  filter?: ReadonlySignal<FilterSpecification | undefined>;
  describe(feature: AnyFeature): InspectCard;
  feed?(features: AnyFeature[]): FeedItem[];
  minZoom?: number;
  /** Overrides the reported count (e.g. after a filter). */
  count?: ReadonlySignal<number | undefined>;
}

export function pointLayer(ctx: LayerContext, o: PointLayerOptions): LayerHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const idKey = o.idKey ?? 'id';
  const base = idBase(ctx, o.name);
  const src = `${base}-src`;
  const clean = new Cleanup();
  const data = dataSignal(o.data);
  const cl = o.cluster ? (o.cluster === true ? {} : o.cluster) : undefined;

  const sourceSpec: GeoJSONSourceSpecification = {
    type: 'geojson', data: EMPTY_FC, promoteId: idKey,
    ...(cl ? { cluster: true, clusterRadius: cl.radius ?? 48, clusterMaxZoom: cl.maxZoom ?? 8 } : {}),
  };
  engine.addSource(src, sourceSpec);

  const symbol: SymbolStyle | undefined = o.symbol ? { icon: o.symbol.icon, size: peek(o.symbol.size), rotate: o.symbol.rotate === undefined ? undefined : peek(o.symbol.rotate) } : undefined;
  if (symbol) ensureIcons(ml, [symbol.icon]);
  const notCluster: FilterSpecification | undefined = cl ? ['!', ['has', 'point_count']] : undefined;
  const specs = pointSpecs(base, src, undefined, { radius: peek(o.radius), color: peek(o.color), stroke: o.stroke, symbol, sortKey: o.sortKey, minZoom: o.minZoom }, andFilter(notCluster, o.filter?.peek()), idKey);
  const slot = o.slot ?? 'points';
  const layerIds: string[] = [];
  if (cl) for (const l of clusterSpecs(base, src, o.minZoom)) (engine.addLayer(l, slot), layerIds.push(l.id));
  engine.addLayer(specs.main, slot);
  engine.addLayer(specs.ring, slot);
  layerIds.push(specs.main.id, specs.ring.id);

  // data -> source, feed, status
  clean.add(
    effect(() => {
      const fc = data.value;
      (ml.getSource(src) as { setData(d: unknown): void } | undefined)?.setData(fc ? ensureIds(fc, idKey) : EMPTY_FC);
    }),
  );
  if (o.feed) clean.add(effect(() => { const fc = data.value; if (fc) { const feats = fc.features as AnyFeature[]; const items = o.feed!(feats); ctx.feed(o.describe ? withCards(items, featureFinder(feats, idKey), o.describe) : items); }; }));
  clean.add(trackStatus(ctx, data, resourcesOf(o.data, o.resources), o.count));

  // dynamic styling
  const main = specs.main.id;
  clean.add(bindProp(ml, main, 'paint', symbol ? 'icon-color' : 'circle-color', o.color));
  if (!symbol) clean.add(bindProp(ml, main, 'paint', 'circle-radius', o.radius, (r) => mapOutputs(r, hoverScale)));
  if (o.symbol) {
    clean.add(bindProp(ml, main, 'layout', 'icon-size', o.symbol.size));
    if (o.symbol.rotate !== undefined) clean.add(bindProp(ml, main, 'layout', 'icon-rotate', o.symbol.rotate));
  }
  if (o.filter) {
    const f = o.filter;
    clean.add(effect(() => { if (ml.getLayer(main)) ml.setFilter(main, andFilter(notCluster, f.value) ?? null); }));
  }
  clean.add(bindOpacity(ctx, ml, specs.opacity.map((t) => ({ layer: t.layer, prop: t.prop, base: t.base }))));

  // selection ring follows the inspector
  const selectedId = signal<unknown>(null);
  let lastCard: InspectCard | null = null;
  clean.add(effect(() => { const c = ctx.selection.value; if (c !== lastCard && !ctx.ownSelection?.(c)) selectedId.value = null; }));
  clean.add(effect(() => { if (ml.getLayer(specs.ring.id)) ml.setFilter(specs.ring.id, ringFilter(idKey, selectedId.value)); }));

  const lookup = createLookup(idKey);
  clean.add(
    engine.onPick(layerIds, {
      click(f) {
        const id = (f.properties as Record<string, unknown> | null)?.[idKey] ?? f.id;
        const full = (lookup(data.peek(), id) ?? f) as AnyFeature;
        const card = o.describe(full);
        if (!card.location && f.geometry.type === 'Point') card.location = f.geometry.coordinates.slice(0, 2) as [number, number];
        lastCard = card;
        selectedId.value = id;
        ctx.select(card);
      },
    }),
  );

  return {
    destroy() {
      clean.run();
      engine.remove({ layers: [...layerIds].reverse(), sources: [src] });
    },
  };
}
