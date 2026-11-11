// Time-aware raster tiles: one MapLibre raster source per frame, at most three alive (previous, current, next),
// cross-fading between the two frames around the selected time. Layers sit in the 'raster' slot.
import { effect, signal, type ReadonlySignal } from '@preact/signals';
import type { LayerSpecification } from 'maplibre-gl';
import type { LayerContext, LayerHandle } from '../../layers/types';
import { Cleanup, idBase } from '../common';
import { bracketTime } from './grid';

export interface RasterFrame { time: number; tiles: string[] }

export interface RasterFramesOptions {
  frames: ReadonlySignal<RasterFrame[]>;
  attribution: string;
  tileSize?: number;
  /** Native maximum zoom of the source: MapLibre overzooms above instead of requesting forbidden tiles. */
  maxzoom?: number;
  minzoom?: number;
  name?: string;
  /** Frames further than this from the selected time fade out (ms, default 1 h). */
  maxGap?: number;
  paint?: { saturation?: number; brightness?: [number, number] };
  /** Name of the source for the error note ("DWD-Radar"); when its tiles keep failing the layer reports `error`. */
  sourceName?: string;
  /** Extra failure signal (e.g. the index resource of RainViewer failed to load). */
  failure?: ReadonlySignal<string | undefined>;
}

export function rasterFrames(ctx: LayerContext, o: RasterFramesOptions): LayerHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const base = idBase(ctx, o.name);
  const clean = new Cleanup();
  const alive = new Map<number, { src: string; layer: string }>(); // by frame index
  const key = (i: number) => `${base}-f${i}`;

  // tile failures: several errors without a single tile in between -> status error with a helpful note
  const tileFailure = signal(false);
  let failures = 0;
  const ours = (id?: string) => !!id && id.startsWith(`${base}-f`);
  const onErr = (e: { sourceId?: string }) => { if (ours(e.sourceId) && ++failures >= 4) tileFailure.value = true; };
  const onData = (e: { sourceId?: string; tile?: unknown; dataType?: string }) => { if (ours(e.sourceId) && e.tile && e.dataType === 'source') { failures = 0; tileFailure.value = false; } };
  ml.on('error', onErr as never);
  ml.on('data', onData as never);
  clean.add(() => { ml.off('error', onErr as never); ml.off('data', onData as never); });

  const ensure = (i: number, fr: RasterFrame) => {
    if (alive.has(i)) return alive.get(i)!;
    const e = { src: `${key(i)}-src`, layer: `${key(i)}-raster` };
    engine.addSource(e.src, {
      type: 'raster', tiles: fr.tiles, tileSize: o.tileSize ?? 256, attribution: o.attribution,
      ...(o.maxzoom !== undefined ? { maxzoom: o.maxzoom } : {}), ...(o.minzoom !== undefined ? { minzoom: o.minzoom } : {}),
    });
    engine.addLayer({
      id: e.layer, type: 'raster', source: e.src,
      paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-resampling': 'linear', ...(o.paint?.saturation !== undefined ? { 'raster-saturation': o.paint.saturation } : {}) },
    } as LayerSpecification, 'raster');
    alive.set(i, e);
    return e;
  };
  const drop = (i: number) => {
    const e = alive.get(i);
    if (!e) return;
    engine.remove({ layers: [e.layer], sources: [e.src] });
    alive.delete(i);
  };

  clean.add(effect(() => {
    const frames = o.frames.value;
    const t = ctx.time.value;
    const op = ctx.opacity.value;
    const fail = o.failure?.value ?? (tileFailure.value ? `${o.sourceName ?? 'Quelle'} antwortet nicht, Bilder konnten nicht geladen werden` : undefined);
    if (fail) { ctx.status({ state: 'error', note: fail }); if (!frames.length) return; }
    if (!frames.length) return;
    const br = bracketTime(frames.map((f) => f.time), t);
    const gap = o.maxGap ?? 3600_000;
    // outside the covered range the nearest frame stays visible only within `gap`
    const edge = t < frames[0]!.time ? frames[0]!.time - t : t > frames[frames.length - 1]!.time ? t - frames[frames.length - 1]!.time : 0;
    const vis = edge > gap ? 0 : 1;
    const want = new Set([br.i0, br.i1, Math.min(frames.length - 1, br.i1 + 1)]);
    for (const i of [...alive.keys()]) if (!want.has(i)) drop(i);
    for (const i of want) ensure(i, frames[i]!);
    for (const [i, e] of alive) {
      let w = 0;
      if (br.i0 === br.i1) w = i === br.i0 ? 1 : 0;
      else w = i === br.i0 ? 1 - br.f : i === br.i1 ? br.f : 0;
      if (ml.getLayer(e.layer)) ml.setPaintProperty(e.layer, 'raster-opacity', w * op * vis);
    }
    if (!fail) ctx.status({ state: 'ready', count: frames.length, updatedAt: frames[frames.length - 1]!.time });
  }));

  return {
    destroy() {
      clean.run();
      for (const i of [...alive.keys()]) drop(i);
    },
  };
}
