// Layer specs shared by pointLayer, pmtilesLayer and trackLayer.
import type { ExpressionSpecification, FilterSpecification, LayerSpecification } from 'maplibre-gl';
import { DARK_HALO, HOVER, LIMB, mapOutputs, type Expr, type NumOrExpr } from './common';

export interface SymbolStyle {
  /** Name from render/icons.ts (dot, triangle, arrow, plane, ship, diamond, square, star, bolt, flame, volcano, tower, camera). */
  icon: string;
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
        'icon-image': s.symbol.icon, 'icon-size': s.symbol.size as ExpressionSpecification | number,
        'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
        ...(s.symbol.rotate !== undefined ? { 'icon-rotate': s.symbol.rotate as ExpressionSpecification | number } : {}),
        ...(s.sortKey !== undefined ? { 'symbol-sort-key': s.sortKey as ExpressionSpecification | number } : {}),
      },
      paint: {
        'icon-color': s.color,
        'icon-halo-color': ['case', HOVER, '#ffffff', halo] as unknown as ExpressionSpecification,
        'icon-halo-width': ['case', HOVER, 2.5, s.stroke?.width ?? 1.2] as unknown as ExpressionSpecification,
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

export const clusterSpecs = (id: string, source: string, minzoom?: number): LayerSpecification[] => [
  {
    id: `${id}-cluster`, type: 'circle', source, filter: ['has', 'point_count'], ...(minzoom !== undefined ? { minzoom } : {}),
    paint: {
      'circle-color': 'rgba(36, 48, 68, 0.92)',
      'circle-radius': ['step', ['get', 'point_count'], 14, 25, 17, 100, 21, 750, 26],
      'circle-stroke-color': LIMB,
      'circle-stroke-width': 1.5,
    },
  },
  {
    id: `${id}-cluster-count`, type: 'symbol', source, filter: ['has', 'point_count'], ...(minzoom !== undefined ? { minzoom } : {}),
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-allow-overlap': true },
    paint: { 'text-color': '#EDF1F6' },
  },
];
