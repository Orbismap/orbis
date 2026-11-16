// vectorTileLayer: one remote vector tile source (z/x/y .pbf) drawn by several parts (line, circle or fill per source layer).
// Hover widening and the selection highlight follow the other kits; features are identified by `idKey` (default osm_id).
import { effect, signal, type ReadonlySignal } from '@preact/signals';
import type { FilterSpecification, LayerSpecification } from 'maplibre-gl';
import type { InspectCard, LayerContext, LayerHandle } from '../layers/types';
import type { SlotId } from '../map/types';
import { Cleanup, DARK_HALO, HOVER, LIMB, bindOpacity, idBase, isSignal, mapOutputs, type AnyFeature, type Expr, type NumOrExpr } from './common';
import { hoverScale } from './pointstyle';

export interface VtPart {
  /** Unique within the layer. */
  id: string;
  sourceLayer: string;
  kind: 'line' | 'circle' | 'fill';
  filter?: FilterSpecification | ReadonlySignal<FilterSpecification | undefined>;
  minZoom?: number;
  maxZoom?: number;
  color: string | Expr;
  /** line: width in px, circle: radius in px (number or zoom expression). Unused for fill. */
  size?: NumOrExpr;
  opacity?: number;
  /** line only */
  dash?: number[];
  /** Dark outline under a line / around a circle. */
  casing?: boolean;
  /** Default true. false = decoration without hover or card. */
  pick?: boolean;
  sortKey?: NumOrExpr;
}

export interface VectorTileOptions {
  /** URL template with {z}/{x}/{y}. */
  tiles: string;
  minzoom?: number;
  maxzoom?: number;
  attribution: string;
  parts: VtPart[];
  /** Feature property with a unique id per source layer (promoted for hover). Default 'osm_id'. */
  idKey?: string;
  name?: string;
  /** While `when` is true, these parts (with casing and selection) are hidden: an extension draws their objects in 3D. The data stays; what is hidden cannot be picked. */
  hideWhenPresented?: { when: ReadonlySignal<boolean>; parts: string[] };
  describe(feature: AnyFeature, part: VtPart): InspectCard;
}

const SLOT: Record<VtPart['kind'], SlotId> = { line: 'lines', circle: 'points', fill: 'areas' };
const widen: (e: NumOrExpr) => NumOrExpr = (e) => ['*', e, ['case', HOVER, 1.6, 1]] as Expr;
const plus2 = (e: NumOrExpr): NumOrExpr => ['+', e, 2] as Expr;
const OPACITY_PROP = { line: 'line-opacity', circle: 'circle-opacity', fill: 'fill-opacity' } as const;

export function vectorTileLayer(ctx: LayerContext, o: VectorTileOptions): LayerHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const idKey = o.idKey ?? 'osm_id';
  const base = idBase(ctx, o.name);
  const src = `${base}-src`;
  const clean = new Cleanup();
  const layerIds: string[] = [];
  const pickIds: string[] = [];
  const partOf = new Map<string, VtPart>();
  const selLayers = new Map<string, string>();
  const targets: { layer: string; prop: string; base: number }[] = [];

  ctx.status({ state: 'loading' });
  const promote = Object.fromEntries([...new Set(o.parts.map((p) => p.sourceLayer))].map((l) => [l, idKey]));
  engine.addSource(src, {
    type: 'vector', tiles: [o.tiles], minzoom: o.minzoom ?? 0, maxzoom: o.maxzoom ?? 17, promoteId: promote, attribution: o.attribution,
  });

  for (const p of o.parts) {
    const slot = SLOT[p.kind];
    const zoom = { ...(p.minZoom !== undefined ? { minzoom: p.minZoom } : {}), ...(p.maxZoom !== undefined ? { maxzoom: p.maxZoom } : {}) };
    const filter0 = isSignal<FilterSpecification | undefined>(p.filter) ? p.filter.peek() : p.filter;
    const f = (flt: FilterSpecification | undefined) => (flt ? { filter: flt } : {});
    const opacity = p.opacity ?? 1;
    const size = p.size ?? (p.kind === 'line' ? 1.5 : 3);
    const mk = (spec: Record<string, unknown>) => {
      const id = spec.id as string;
      ml.getLayer(id) || engine.addLayer(spec as unknown as LayerSpecification, slot);
      layerIds.push(id);
    };
    const common = { source: src, 'source-layer': p.sourceLayer, ...zoom };
    const sel = `${base}.${p.id}-sel`;
    const main = `${base}.${p.id}`;
    const noSel = ['==', ['get', idKey], '\u0000'] as FilterSpecification;

    if (p.kind === 'line') {
      mk({ id: sel, type: 'line', ...common, filter: noSel, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': LIMB, 'line-width': mapOutputs(size, (e) => ['+', e, 5] as Expr), 'line-opacity': 0.55 } });
      targets.push({ layer: sel, prop: 'line-opacity', base: 0.55 });
      if (p.casing) {
        const c = `${base}.${p.id}-casing`;
        mk({ id: c, type: 'line', ...common, ...f(filter0), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': DARK_HALO, 'line-width': mapOutputs(size, plus2), 'line-opacity': 0.8 } });
        targets.push({ layer: c, prop: 'line-opacity', base: 0.8 });
        if (isSignal<FilterSpecification | undefined>(p.filter)) { const fs = p.filter; clean.add(effect(() => { if (ml.getLayer(c)) ml.setFilter(c, fs.value ?? null); })); }
      }
      mk({
        id: main, type: 'line', ...common, ...f(filter0), layout: { 'line-cap': 'round', 'line-join': 'round', ...(p.sortKey !== undefined ? { 'line-sort-key': p.sortKey } : {}) },
        paint: { 'line-color': p.color, 'line-width': p.pick === false ? size : mapOutputs(size, widen), 'line-opacity': opacity, ...(p.dash ? { 'line-dasharray': p.dash } : {}) },
      });
    } else if (p.kind === 'circle') {
      mk({
        id: sel, type: 'circle', ...common, filter: noSel,
        paint: { 'circle-radius': mapOutputs(size, (e) => ['+', e, 4] as Expr), 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': LIMB, 'circle-stroke-width': 2, 'circle-opacity': 0, 'circle-stroke-opacity': 0.85 },
      });
      mk({
        id: main, type: 'circle', ...common, ...f(filter0), layout: p.sortKey !== undefined ? { 'circle-sort-key': p.sortKey } : {},
        paint: {
          'circle-radius': p.pick === false ? size : mapOutputs(size, hoverScale), 'circle-color': p.color, 'circle-opacity': opacity,
          'circle-stroke-color': p.casing === false ? 'rgba(0,0,0,0)' : DARK_HALO, 'circle-stroke-width': 1,
        },
      });
    } else {
      mk({ id: sel, type: 'line', ...common, filter: noSel, paint: { 'line-color': LIMB, 'line-width': 3, 'line-opacity': 0.8 } });
      targets.push({ layer: sel, prop: 'line-opacity', base: 0.8 });
      mk({ id: main, type: 'fill', ...common, ...f(filter0), paint: { 'fill-color': p.color, 'fill-opacity': opacity * 0.55, 'fill-outline-color': p.color } });
    }
    targets.push({ layer: main, prop: OPACITY_PROP[p.kind], base: p.kind === 'fill' ? opacity * 0.55 : opacity });
    if (p.kind === 'circle') targets.push({ layer: sel, prop: 'circle-stroke-opacity', base: 0.85 });
    if (isSignal<FilterSpecification | undefined>(p.filter)) { const fs = p.filter; clean.add(effect(() => { if (ml.getLayer(main)) ml.setFilter(main, fs.value ?? null); })); }
    selLayers.set(p.id, sel);
    if (p.pick !== false) { pickIds.push(main); partOf.set(main, p); }
  }
  clean.add(bindOpacity(ctx, ml, targets));

  // An extension presents some parts in 3D (e.g. the power towers): hide only those parts, the rest of the layer stays.
  const hide = o.hideWhenPresented;
  if (hide) {
    const ids = hide.parts.flatMap((p) => [`${base}.${p}`, `${base}.${p}-casing`, `${base}.${p}-sel`]).filter((id) => ml.getLayer(id));
    clean.add(effect(() => {
      const visibility = hide.when.value ? 'none' : 'visible';
      for (const id of ids) if (ml.getLayer(id)) ml.setLayoutProperty(id, 'visibility', visibility);
    }));
  }

  // loading / ready / error: a vector source has no feature count; ready once the first tiles arrived
  let loaded = false;
  const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (e.sourceId !== src || loaded || !e.isSourceLoaded) return;
    loaded = true;
    ctx.status({ state: 'ready' });
  };
  const onError = (e: { sourceId?: string }) => {
    if (e.sourceId === src && !loaded) ctx.status({ state: 'error', note: 'Kacheln von OpenInfraMap nicht ladbar' });
  };
  ml.on('sourcedata', onData as never);
  ml.on('error', onError as never);
  clean.add(() => { ml.off('sourcedata', onData as never); ml.off('error', onError as never); });

  const selected = signal<{ part: string; id: unknown } | null>(null);
  let lastCard: InspectCard | null = null;
  clean.add(effect(() => { const c = ctx.selection.value; if (c !== lastCard && !ctx.ownSelection?.(c)) selected.value = null; }));
  clean.add(effect(() => {
    const s = selected.value;
    for (const [part, id] of selLayers) {
      if (!ml.getLayer(id)) continue;
      ml.setFilter(id, ['==', ['get', idKey], s && s.part === part ? (s.id as number) : '\u0000'] as FilterSpecification);
    }
  }));
  clean.add(
    engine.onPick(pickIds, {
      click(feat, ll) {
        const part = partOf.get(feat.layer.id);
        if (!part) return;
        const card = o.describe(feat as unknown as AnyFeature, part);
        if (!card.location) card.location = feat.geometry.type === 'Point' ? (feat.geometry.coordinates.slice(0, 2) as [number, number]) : ll;
        lastCard = card;
        selected.value = { part: part.id, id: (feat.properties as Record<string, unknown> | null)?.[idKey] ?? feat.id };
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
