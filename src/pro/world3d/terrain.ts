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
