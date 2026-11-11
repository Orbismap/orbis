// rasterLayer (XYZ/WMTS/WMS tiles) and gibsLayer (NASA GIBS WMTS with date).
import { computed, effect, type ReadonlySignal } from '@preact/signals';
import type { LayerSpecification, RasterTileSource } from 'maplibre-gl';
import { yesterdayIso } from '../core/time';
import type { LayerContext, LayerHandle } from '../layers/types';
import type { SlotId } from '../map/types';
import { Cleanup, bindOpacity, idBase, isSignal, peek, unwrap, type Dyn } from './common';

export interface WmsOptions {
  /** Endpoint without query string, e.g. https://maps.dwd.de/geoserver/dwd/wms */
  url: string;
  layers: string;
  version?: '1.1.1' | '1.3.0';
  format?: string;
  styles?: string;
  /** Extra query parameters, e.g. { TIME: '2026-11-10T12:00:00Z' }. A signal re-points the tiles when it changes. */
  params?: Dyn<Record<string, string>>;
}

export interface RasterLayerOptions {
  /** XYZ/WMTS template(s) with {z}/{x}/{y}; a signal re-points the source when it changes. */
  tiles?: Dyn<string[]>;
  wms?: WmsOptions;
  tileSize?: number;
  minzoom?: number;
  maxzoom?: number;
  bounds?: [w: number, s: number, e: number, n: number];
  /** HTML attribution (shown in the map's attribution control). */
  attribution: string;
  /** Default 'raster'. */
  slot?: SlotId;
  name?: string;
  paint?: { brightness?: [number, number]; contrast?: number; saturation?: number; hueRotate?: number; resampling?: 'linear' | 'nearest' };
  /** Reported with the status (e.g. when the image date is known). */
  updatedAt?: number;
}

/** Tile URL template of a WMS endpoint in web mercator. */
export function wmsTileUrl(w: WmsOptions, tileSize = 256): string {
  const v = w.version ?? '1.3.0';
  const q: Record<string, string> = {
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: v, LAYERS: w.layers, STYLES: w.styles ?? '', FORMAT: w.format ?? 'image/png', TRANSPARENT: 'true',
    [v === '1.3.0' ? 'CRS' : 'SRS']: 'EPSG:3857', WIDTH: String(tileSize), HEIGHT: String(tileSize), ...unwrap(w.params ?? {}),
  };
  const query = Object.entries(q).map(([k, val]) => `${k}=${encodeURIComponent(val)}`).join('&');
  return `${w.url}${w.url.includes('?') ? '&' : '?'}${query}&BBOX={bbox-epsg-3857}`.replace('%7Bbbox-epsg-3857%7D', '{bbox-epsg-3857}');
}

export function rasterLayer(ctx: LayerContext, o: RasterLayerOptions): LayerHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const base = idBase(ctx, o.name);
  const src = `${base}-src`;
  const layerId = `${base}-raster`;
  const clean = new Cleanup();
  const tileSize = o.tileSize ?? 256;
  const tiles = (): string[] => (o.wms ? [wmsTileUrl(o.wms, tileSize)] : unwrap(o.tiles ?? []));
  const reactive = isSignal(o.tiles) || (o.wms && isSignal(o.wms.params));

  engine.addSource(src, {
    type: 'raster', tiles: o.wms ? [wmsTileUrl(o.wms, tileSize)] : peek(o.tiles ?? []), tileSize,
    ...(o.minzoom !== undefined ? { minzoom: o.minzoom } : {}), ...(o.maxzoom !== undefined ? { maxzoom: o.maxzoom } : {}),
    ...(o.bounds ? { bounds: o.bounds } : {}), attribution: o.attribution,
  });
  const p = o.paint ?? {};
  engine.addLayer(
    {
      id: layerId, type: 'raster', source: src,
      paint: {
        'raster-opacity': 1,
        ...(p.brightness ? { 'raster-brightness-min': p.brightness[0], 'raster-brightness-max': p.brightness[1] } : {}),
        ...(p.contrast !== undefined ? { 'raster-contrast': p.contrast } : {}),
        ...(p.saturation !== undefined ? { 'raster-saturation': p.saturation } : {}),
        ...(p.hueRotate !== undefined ? { 'raster-hue-rotate': p.hueRotate } : {}),
        'raster-resampling': p.resampling ?? 'linear',
        'raster-fade-duration': 200,
      },
    } as LayerSpecification,
    o.slot ?? 'raster',
  );
  clean.add(bindOpacity(ctx, ml, [{ layer: layerId, prop: 'raster-opacity', base: 1 }]));
  if (reactive) {
    let first = true;
    clean.add(effect(() => {
      const t = tiles();
      if (first) { first = false; return; }
      (ml.getSource(src) as RasterTileSource | undefined)?.setTiles(t);
    }));
  }
  ctx.status({ state: 'ready', updatedAt: o.updatedAt });
  return {
    destroy() {
      clean.run();
      engine.remove({ layers: [layerId], sources: [src] });
    },
  };
}

// ---- NASA GIBS --------------------------------------------------------------

export interface GibsOptions {
  /** GIBS layer id, e.g. 'VIIRS_Black_Marble' */
  layer: string;
  format: 'png' | 'jpg' | 'jpeg';
  /** e.g. 'GoogleMapsCompatible_Level8' (the level gives the max zoom) */
  matrixSet: string;
  /** 'yesterday' (UTC), a fixed ISO date, a signal of one, or omitted for layers without time dimension. */
  date?: 'yesterday' | string | ReadonlySignal<string | undefined>;
  product?: 'best' | 'std';
  attribution?: string;
  slot?: SlotId;
  name?: string;
}

export function gibsTileUrl(o: Pick<GibsOptions, 'layer' | 'format' | 'matrixSet' | 'product'>, date?: string): string {
  const ext = o.format === 'jpeg' ? 'jpg' : o.format;
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/${o.product ?? 'best'}/${o.layer}/default/${date ? `${date}/` : ''}${o.matrixSet}/{z}/{y}/{x}.${ext}`;
}

export function gibsLayer(ctx: LayerContext, o: GibsOptions): LayerHandle {
  const level = /Level(\d+)/.exec(o.matrixSet);
  const resolve = (d: GibsOptions['date']): string | undefined => (d === 'yesterday' ? yesterdayIso() : typeof d === 'string' ? d : d?.value);
  const tiles: Dyn<string[]> = isSignal<string | undefined>(o.date) ? computed(() => [gibsTileUrl(o, resolve(o.date))]) : [gibsTileUrl(o, resolve(o.date))];
  return rasterLayer(ctx, {
    tiles, tileSize: 256, maxzoom: level ? Number(level[1]) : 8, slot: o.slot ?? 'raster', name: o.name,
    attribution: o.attribution ?? 'Bilder: NASA <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">GIBS</a>',
  });
}
