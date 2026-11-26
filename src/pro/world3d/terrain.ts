import type { Map as MlMap } from 'maplibre-gl';

// The terrain's exaggeration changes with the camera's tilt (the map flattens its terrain seen from above, like the buildings), so the
// parts that stand on the ground keep the REAL height of the terrain under them and multiply it by the exaggeration of the moment when
// they draw: they move with the terrain every frame, without a new read of the terrain.

/** The exaggeration of the 3D terrain right now (0 without terrain). */
export const exaggeration = (map: MlMap): number => {
  const e = map.getTerrain()?.exaggeration;
  return typeof e === 'number' && Number.isFinite(e) && e > 0 ? e : 0;
};

/** Below this exaggeration the terrain is on its way in or out: a height read now says too little about the real one. */
const MIN_READ = 0.05;

/** The real terrain height at a place (m, as it is without exaggeration); 0 without terrain or while it is almost flat. */
export function groundAt(map: MlMap, lng: number, lat: number): number {
  const ex = exaggeration(map);
  if (ex < MIN_READ) return 0;
  const h = map.queryTerrainElevation({ lng, lat });
  return typeof h === 'number' && Number.isFinite(h) ? h / ex : 0;
}

/**
 * A part's idle handler, run at most every `gapMs`: while something on the stage animates (turning rotors, moving aircraft), the
 * map reports `idle` after every frame. A skipped call asks for one more frame (`wake`) afterwards, so terrain that just arrived is not missed.
 */
export function idleThrottle(wake: () => void, fn: () => void, gapMs = 500): () => void {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    const wait = last + gapMs - performance.now();
    if (wait > 0) {
      timer ??= setTimeout(() => { timer = undefined; wake(); }, wait);
      return;
    }
    last = performance.now();
    fn();
  };
}
