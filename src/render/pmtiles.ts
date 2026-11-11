// pmtilesLayer: vector PMTiles (Range requests on R2) styled like pointLayer. The protocol is registered once, on demand.
import { effect, signal, type ReadonlySignal } from '@preact/signals';
import type { FilterSpecification } from 'maplibre-gl';
import type { InspectCard, LayerContext, LayerHandle } from '../layers/types';
import { ensurePmtilesProtocol } from '../map/pmtiles-protocol';
import type { SlotId } from '../map/types';
import { Cleanup, bindOpacity, bindProp, idBase, mapOutputs, peek, type AnyFeature, type Dyn, type Expr, type NumOrExpr } from './common';
import { ensureIcons } from './icons';
import { andFilter, hoverScale, pointSpecs, ringFilter, type SymbolStyle } from './pointstyle';

export interface PmtilesLayerOptions {
  /** Full URL of the .pmtiles file, e.g. bucketUrl('osm', 'cctv.pmtiles'). */
  url: string;
  /** Name of the vector tile layer inside the file. */
  sourceLayer: string;
  slot?: SlotId;
  name?: string;
  /** Property holding a unique id (promoted for hover/selection), default 'id'. Without ids hover/selection stay off. */
  idKey?: string;
  radius: Dyn<NumOrExpr>;
  color: Dyn<string | Expr>;
  stroke?: { color?: string; width?: number };
  symbol?: { icon: string; size: Dyn<NumOrExpr>; rotate?: Dyn<NumOrExpr> };
  sortKey?: NumOrExpr;
  filter?: ReadonlySignal<FilterSpecification | undefined>;
  describe(feature: AnyFeature): InspectCard;
  minZoom?: number;
  maxZoom?: number;
  attribution?: string;
}

/** Added asynchronously (the pmtiles library loads on demand); destroy() before that cancels cleanly. */
export function pmtilesLayer(ctx: LayerContext, o: PmtilesLayerOptions): LayerHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const idKey = o.idKey ?? 'id';
  const base = idBase(ctx, o.name);
  const src = `${base}-src`;
  const clean = new Cleanup();
  let destroyed = false;
  let layerIds: string[] = [];
  const slot = o.slot ?? 'points';
  ctx.status({ state: 'loading' });

  void ensurePmtilesProtocol().then(() => {
    if (destroyed || ctx.signal.aborted) return;
    engine.addSource(src, { type: 'vector', url: `pmtiles://${o.url}`, promoteId: idKey, ...(o.attribution ? { attribution: o.attribution } : {}) });
    const symbol: SymbolStyle | undefined = o.symbol ? { icon: o.symbol.icon, size: peek(o.symbol.size), rotate: o.symbol.rotate === undefined ? undefined : peek(o.symbol.rotate) } : undefined;
    if (symbol) ensureIcons(ml, [symbol.icon]);
    const specs = pointSpecs(base, src, o.sourceLayer, { radius: peek(o.radius), color: peek(o.color), stroke: o.stroke, symbol, sortKey: o.sortKey, minZoom: o.minZoom, maxZoom: o.maxZoom }, andFilter(o.filter?.peek()), idKey);
    engine.addLayer(specs.main, slot);
    engine.addLayer(specs.ring, slot);
    layerIds = [specs.main.id, specs.ring.id];
    const main = specs.main.id;
    clean.add(bindProp(ml, main, 'paint', symbol ? 'icon-color' : 'circle-color', o.color));
    if (!symbol) clean.add(bindProp(ml, main, 'paint', 'circle-radius', o.radius, (r) => mapOutputs(r, hoverScale)));
    if (o.filter) {
      const f = o.filter;
      clean.add(effect(() => { if (ml.getLayer(main)) ml.setFilter(main, andFilter(f.value) ?? null); }));
    }
    clean.add(bindOpacity(ctx, ml, specs.opacity));
    const selectedId = signal<unknown>(null);
    let lastCard: InspectCard | null = null;
    clean.add(effect(() => { const c = ctx.selection.value; if (c !== lastCard && !ctx.ownSelection?.(c)) selectedId.value = null; }));
    clean.add(effect(() => { if (ml.getLayer(specs.ring.id)) ml.setFilter(specs.ring.id, ringFilter(idKey, selectedId.value)); }));
    clean.add(
      engine.onPick(layerIds, {
        click(f) {
          const card = o.describe(f as AnyFeature);
          if (!card.location && f.geometry.type === 'Point') card.location = f.geometry.coordinates.slice(0, 2) as [number, number];
          lastCard = card;
          selectedId.value = (f.properties as Record<string, unknown> | null)?.[idKey] ?? f.id ?? null;
          ctx.select(card);
        },
      }),
    );
    ctx.status({ state: 'ready' });
  }).catch(() => ctx.status({ state: 'error', note: 'Kartenkacheln nicht ladbar' }));

  return {
    destroy() {
      destroyed = true;
      clean.run();
      engine.remove({ layers: [...layerIds].reverse(), sources: [src] });
    },
  };
}
