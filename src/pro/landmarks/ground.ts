import * as THREE from 'three';

// Where a landmark model stands on the 3D terrain: as one rigid body, never bent to it. The dataset's frame puts a model's y = 0 on
// the lowest ground under it, and the models are built for that ground (uphill the base runs into the hill, which is meant so; the
// terraces and steps are part of the model). Bridges and coasters are built over the terrain, every support down to the ground at its
// own foot: those are set by their feet, so that a ground that differs a little from the one they were built on (the water under a
// bridge above all) does not move the whole structure.

/** The lowest point of a model in one cell of a net over its plan, in the model's frame (metres, x east, y up, z south). */
export type Contact = readonly [x: number, y: number, z: number];

/** cells of the net along the longer side of a model: the ground under it is read at most CELLS² times */
const CELLS = 16;
/** a cell is at least this many metres wide */
const MIN_CELL_M = 2;
/** feet within this many metres of each other count as standing on one ground */
const FEET_BAND_M = 1;
/** share of the lowest points left out of the feet: a tunnel, a footing sunk deeper than the others */
const SUNK = 0.05;
/** the terrain has to line up this many feet at least, and this many times more than flat ground does, for a model to be set by its feet */
const MIN_FEET = 8;
const FEET_MARGIN = 1.25;
/** the model's ground is put this high in the band of its feet: most of them end in the ground, none stands in the air */
const FEET_QUANTILE = 0.8;

/**
 * The points a model could touch the ground with: the lowest vertex in each cell of a net over its plan. Parts the file animates
 * (a turning wheel, a ship on a swing; `moving`: their node names or ids) are left out, none of them stands on the ground.
 */
export function contactsOf(model: THREE.Object3D, moving: ReadonlySet<string> = new Set()): Contact[] {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return [];
  const size = Math.max(MIN_CELL_M, (box.max.x - box.min.x) / CELLS, (box.max.z - box.min.z) / CELLS);
  const cell = (v: number, from: number) => Math.min(CELLS - 1, Math.floor((v - from) / size));
  const lowest = new Map<number, Contact>();
  const p = new THREE.Vector3();
  const visit = (o: THREE.Object3D) => {
    if (moving.has(o.name) || moving.has(o.uuid)) return;
    const position = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry.getAttribute('position') : undefined;
    for (let i = 0; position && i < position.count; i++) {
      // the node's own place counts: parts sit at offsets and turned within the file
      p.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
      const key = cell(p.z, box.min.z) * CELLS + cell(p.x, box.min.x);
      const known = lowest.get(key);
      if (!known || p.y < known[1]) lowest.set(key, [p.x, p.y, p.z]);
    }
    for (const child of o.children) visit(child);
  };
  visit(model);
  return [...lowest.values()];
}

/** The values in the band at the bottom of a set, past its sunk share; ascending. */
function feet(values: number[]): number[] {
  const v = values.sort((a, b) => a - b);
  const from = Math.floor(v.length * SUNK);
  let to = from;
  while (to < v.length && v[to]! - v[from]! <= FEET_BAND_M) to++;
  return v.slice(from, to);
}

/**
 * The real ground height (m, without exaggeration) the model's y = 0 goes on. `ground`: the height under each contact, NaN where
 * the terrain is not loaded. `overTerrain`: the model may be built over the terrain (a bridge, a coaster). `byFeet` says that it was
 * set by its feet; otherwise it stands on the lowest ground under it. Undefined while no height is known.
 */
export function standOn(contacts: readonly Contact[], ground: readonly number[], overTerrain: boolean): { base: number; byFeet: boolean } | undefined {
  const known = contacts.map((c, i) => ({ y: c[1], h: ground[i]! })).filter((c) => Number.isFinite(c.h));
  if (!known.length) return undefined;
  if (overTerrain) {
    // built over the terrain, the feet are all at one depth below the ground at their own place; built flat, at one height
    const onTerrain = feet(known.map((c) => c.y - c.h));
    const onFlat = feet(known.map((c) => c.y));
    if (onTerrain.length >= MIN_FEET && onTerrain.length >= onFlat.length * FEET_MARGIN) {
      return { base: -onTerrain[Math.min(onTerrain.length - 1, Math.floor(onTerrain.length * FEET_QUANTILE))]!, byFeet: true };
    }
  }
  return { base: Math.min(...known.map((c) => c.h)), byFeet: false };
}
