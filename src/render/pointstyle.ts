// Layer specs shared by pointLayer, pmtilesLayer and trackLayer.
import type { ExpressionSpecification, FilterSpecification, LayerSpecification } from 'maplibre-gl';
import { DARK_HALO, HOVER, LIMB, mapOutputs, type Expr, type NumOrExpr } from './common';

export interface SymbolStyle {
  /** Name from render/icons.ts (dot, triangle, arrow, plane, ship, diamond, square, star, bolt, flame, volcano, tower, camera). */
  icon: string;
  /** Icon chosen per feature (an expression giving icon names); `icon` is the fallback and what `ensureIcons` loads, other names must be listed by the caller. */
  iconExpr?: ExpressionSpecification;
  /** Scale factor, 1 = 32 css px. May be a (zoom) expression. */
  size: NumOrExpr;
  /** Degrees clockwise, e.g. ['get', 'heading']. Rotates with the map. */
  rotate?: NumOrExpr;
}

export interface PointStyle {
  /** Circle radius in px (number or expression). Used for circles and for the selection ring. */
  radius: NumOrExpr;
  color: string | Expr;
  stroke?: { color?: string; width?: number };
  symbol?: SymbolStyle;
  sortKey?: NumOrExpr;
  minZoom?: number;
  maxZoom?: number;
}

export interface PointSpecs {
  main: LayerSpecification;
  ring: LayerSpecification;
  /** [layer, paint property, base opacity] for ctx.opacity */
  opacity: { layer: string; prop: string; base: number }[];
}

export const hoverScale = (e: NumOrExpr): Expr => ['*', e, ['case', HOVER, 1.3, 1]] as Expr;

/**
 * SDF icon halos only reach ~6 SDF px outside the shape (scaled by icon-size). A wider halo drives the shader's halo edge
 * below 0 and fills the whole quad: a translucent rectangle around the icon. Hover therefore gets 2 px, capped to what the
 * SDF can carry at this icon size.
 */
export const haloWidth = (size: NumOrExpr, base: number): Expr =>
  ['case', HOVER, ['min', 2, ['*', size, SDF_HALO_PER_SIZE]], ['min', base, ['*', size, SDF_HALO_PER_SIZE]]] as unknown as Expr;
const SDF_HALO_PER_SIZE = 2.6;

export const andFilter = (...fs: (FilterSpecification | undefined)[]): FilterSpecification | undefined => {
  const list = fs.filter((f): f is FilterSpecification => f !== undefined);
  return list.length === 0 ? undefined : list.length === 1 ? list[0] : (['all', ...list] as FilterSpecification);
};

export function pointSpecs(id: string, source: string, sourceLayer: string | undefined, s: PointStyle, filter: FilterSpecification | undefined, idKey: string): PointSpecs {
  const sl = sourceLayer ? { 'source-layer': sourceLayer } : {};
  const zoom = { ...(s.minZoom !== undefined ? { minzoom: s.minZoom } : {}), ...(s.maxZoom !== undefined ? { maxzoom: s.maxZoom } : {}) };
  const halo = s.stroke?.color ?? DARK_HALO;
  let main: LayerSpecification;
  const opacity: PointSpecs['opacity'] = [];
  if (s.symbol) {
    main = {
      id: `${id}-symbols`, type: 'symbol', source, ...sl, ...zoom, ...(filter ? { filter } : {}),
      layout: {
        'icon-image': s.symbol.iconExpr ?? s.symbol.icon, 'icon-size': s.symbol.size as ExpressionSpecification | number,
        'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
        ...(s.symbol.rotate !== undefined ? { 'icon-rotate': s.symbol.rotate as ExpressionSpecification | number } : {}),
        ...(s.sortKey !== undefined ? { 'symbol-sort-key': s.sortKey as ExpressionSpecification | number } : {}),
      },
      paint: {
        'icon-color': s.color,
        'icon-halo-color': ['case', HOVER, '#ffffff', halo] as unknown as ExpressionSpecification,
        'icon-halo-width': mapOutputs(s.symbol.size, (sz) => haloWidth(sz, s.stroke?.width ?? 1.2)) as ExpressionSpecification | number,
        'icon-opacity': 1,
      },
    } as LayerSpecification;
    opacity.push({ layer: main.id, prop: 'icon-opacity', base: 1 });
  } else {
    main = {
      id: `${id}-circles`, type: 'circle', source, ...sl, ...zoom, ...(filter ? { filter } : {}),
      layout: s.sortKey !== undefined ? { 'circle-sort-key': s.sortKey as ExpressionSpecification | number } : {},
      paint: {
        'circle-radius': mapOutputs(s.radius, hoverScale) as ExpressionSpecification | number,
        'circle-color': s.color,
        'circle-opacity': 0.92,
        'circle-stroke-color': halo,
        'circle-stroke-width': s.stroke?.width ?? 1,
        'circle-stroke-opacity': 1,
        'circle-pitch-alignment': 'map',
        'circle-pitch-scale': 'map',
      },
    } as LayerSpecification;
    opacity.push({ layer: main.id, prop: 'circle-opacity', base: 0.92 }, { layer: main.id, prop: 'circle-stroke-opacity', base: 1 });
  }
  const ring: LayerSpecification = {
    id: `${id}-ring`, type: 'circle', source, ...sl, ...zoom,
    filter: ['==', ['get', idKey], '\u0000'],
    paint: {
      'circle-radius': mapOutputs(s.radius, (e) => ['+', typeof e === 'number' ? Math.max(e, s.symbol ? 10 : 0) : e, 5] as Expr) as ExpressionSpecification | number,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': LIMB,
      'circle-stroke-width': 2,
      'circle-pitch-alignment': 'map',
      'circle-pitch-scale': 'map',
    },
  } as LayerSpecification;
  opacity.push({ layer: ring.id, prop: 'circle-stroke-opacity', base: 1 });
  return { main, ring, opacity };
}

export const ringFilter = (idKey: string, id: unknown): FilterSpecification =>
  ['==', ['get', idKey], id === null || id === undefined ? '\u0000' : (id as string | number)] as FilterSpecification;

/** `n` as "850", "1,2k", "12k" */
const shortCount = (n: unknown[]): unknown[] => {
  const thousands = (digits: number) => ['concat', ['number-format', ['/', n, 1000], { locale: 'de-DE', 'max-fraction-digits': digits }], 'k'];
  return ['case', ['<', n, 1000], ['to-string', n], ['<', n, 10_000], thousands(1), thousands(0)];
};

/**
 * What depends on the property that counts a cluster's points: MapLibre's own `point_count` (GeoJSON sources), or a counter of
 * precomputed clusters in vector tiles (features without it are no cluster for this count).
 */
export const clusterCount = (key = 'point_count') => ({
  filter: ['has', key] as FilterSpecification,
  radius: ['step', ['get', key], 14, 25, 17, 100, 21, 750, 26] as unknown as ExpressionSpecification,
  text: (key === 'point_count' ? ['get', 'point_count_abbreviated'] : shortCount(['get', key])) as unknown as ExpressionSpecification,
});

export const clusterSpecs = (
  id: string, source: string, minzoom?: number,
  /** clusters from a vector tile layer: its name, the counting property and the zoom from which they disappear */
  tiles?: { sourceLayer: string; count: string; maxzoom: number },
): LayerSpecification[] => {
  const count = clusterCount(tiles?.count);
  const common = {
    source, filter: count.filter, ...(minzoom !== undefined ? { minzoom } : {}),
    ...(tiles ? { 'source-layer': tiles.sourceLayer, maxzoom: tiles.maxzoom } : {}),
  };
  return [
    {
      id: `${id}-cluster`, type: 'circle', ...common,
      paint: { 'circle-color': 'rgba(36, 48, 68, 0.92)', 'circle-radius': count.radius, 'circle-stroke-color': LIMB, 'circle-stroke-width': 1.5 },
    },
    {
      id: `${id}-cluster-count`, type: 'symbol', ...common,
      layout: { 'text-field': count.text, 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-allow-overlap': true },
      paint: { 'text-color': '#EDF1F6' },
    },
  ] as LayerSpecification[];
};
