import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hullsOf } from '../world3d/outline';
import type { ShipModel } from './smoothing';

// Procedural low-poly ships (metres, bow towards +y, x starboard, z up, waterline at z = 0). Shapes ported from the old
// app's ships3d.ts, without its per-mesh materials: a model is ONE geometry (drawn instanced, one call per model) and
// takes the class colour of the legend. The attribute `aLight` per vertex says how far a part is mixed towards white:
// the hull keeps the class colour (0), the superstructure, sails and cargo are lighter, so details stay readable in
// every class colour (see `shipMaterial`).

/** Length (m) each model is built at; the part scales a model to the real length of a ship by `length / REF_LEN[model]`. */
export const REF_LEN: Record<ShipModel, number> = { cargo: 180, tanker: 220, passenger: 150, fishing: 30, tug: 28, pleasure: 12, other: 60 };
/** the real length of a ship is clamped to this range (m) before it scales a model */
export const MIN_LEN_M = 8;
export const MAX_LEN_M = 400;

/** How far a part is mixed towards white (0..1). */
const HULL = 0;
const DECK = 0.3;
const CARGO = 0.42;
const HOUSE = 0.72;
const SAIL = 0.9;

/** A part of a model: position + normal + `aLight`, non-indexed, nothing else (so that all parts merge). */
function part(g: THREE.BufferGeometry, light: number): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('uv');
  n.setAttribute('aLight', new THREE.BufferAttribute(new Float32Array(n.getAttribute('position').count).fill(light), 1));
  return n;
}

const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts)!;

/** Pointed hull: straight sides, blunt stern, bow with two facets, `h` high (rising from the waterline). */
function hull(len: number, beam: number, h: number): THREE.BufferGeometry {
  const hl = len / 2;
  const hb = beam / 2;
  const s = new THREE.Shape();
  s.moveTo(-hb * 0.9, -hl);
  s.lineTo(hb * 0.9, -hl);
  s.lineTo(hb, -hl * 0.6);
  s.lineTo(hb, hl * 0.35);
  s.lineTo(hb * 0.55, hl * 0.78);
  s.lineTo(0, hl);
  s.lineTo(-hb * 0.55, hl * 0.78);
  s.lineTo(-hb, hl * 0.35);
  s.lineTo(-hb, -hl * 0.6);
  s.closePath();
  return part(new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }), HULL);
}

/** A box with its centre at (x, y), standing on z. */
const box = (x: number, y: number, z: number, w: number, l: number, h: number, light: number) => part(new THREE.BoxGeometry(w, l, h).translate(x, y, z + h / 2), light);
/** An upright cylinder (funnel, mast, hatch) standing on z. */
const cyl = (x: number, y: number, z: number, r: number, h: number, light: number, segs = 8) => part(new THREE.CylinderGeometry(r, r, h, segs).rotateX(Math.PI / 2).translate(x, y, z + h / 2), light);

/** A thin triangular sail standing in the ship's centre plane: corners given as (y, z). */
function sail(a: [number, number], b: [number, number], c: [number, number]): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(...a);
  s.lineTo(...b);
  s.lineTo(...c);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03);
  // (x, y, z) → (z, x, y): the shape's x becomes the ship's y axis, its y the ship's z axis
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  return part(g, SAIL);
}

const BUILD: Record<ShipModel, () => THREE.BufferGeometry[]> = {
  cargo: () => {
    const parts = [hull(180, 28, 12), box(0, -66, 12, 24, 20, 20, HOUSE)];
    // container stacks on the deck, a little uneven in height
    let i = 0;
    for (let y = -40; y < 70; y += 18) for (const x of [-7.5, 0, 7.5]) parts.push(box(x, y, 12, 6.5, 16, 6 + ((i++ * 7) % 3) * 2.4, CARGO));
    return parts;
  },
  tanker: () => {
    const parts = [hull(220, 34, 14), box(0, -84, 14, 28, 22, 24, HOUSE), cyl(0, -84, 38, 3, 6, HULL)];
    // deck with the long pipe and the tank hatches
    parts.push(box(0, 10, 14, 30, 150, 1.4, DECK), box(0, 10, 15.4, 2.5, 150, 2.5, CARGO));
    for (let y = -50; y <= 70; y += 24) parts.push(cyl(0, y, 15.4, 5, 2, CARGO, 10));
    return parts;
  },
  passenger: () => [
    hull(150, 26, 9),
    // tiered decks, a bridge on top and a funnel
    box(0, -5, 9, 22, 100, 7, HOUSE - 0.1),
    box(0, 0, 16, 19, 80, 7, HOUSE),
    box(0, 12, 23, 15, 40, 6, HOUSE + 0.1),
    box(0, 28, 29, 10, 12, 5, DECK),
    cyl(0, -18, 29, 3.4, 9, CARGO),
  ],
  fishing: () => [hull(30, 8, 3.5), box(0, 4, 3.5, 5, 7, 4, HOUSE), cyl(0, 4, 7.5, 0.25, 7, DECK, 6), box(0, -8, 3.5, 6, 6, 0.8, CARGO)],
  tug: () => [hull(28, 10, 3), box(0, 2, 3, 7, 9, 4, HOUSE), cyl(0, -3, 7, 1.2, 4, DECK)],
  pleasure: () => [hull(12, 3.6, 1.1), box(0, -1, 1.1, 2, 3.4, 1, HOUSE - 0.1), cyl(0, 1.5, 1.1, 0.07, 9, DECK, 5), sail([1.2, 1.6], [1.2, 10], [-3.4, 1.6])],
  other: () => [hull(60, 10, 5), box(0, -14, 5, 8, 12, 6, HOUSE), box(0, 8, 5, 7, 20, 1.4, DECK)],
};

/** One geometry per model, each built at its `REF_LEN`; the caller owns them (GeoInstances disposes them). */
export function shipGeometries(): Record<ShipModel, THREE.BufferGeometry> {
  const out = {} as Record<ShipModel, THREE.BufferGeometry>;
  for (const k of Object.keys(BUILD) as ShipModel[]) out[k] = merge(BUILD[k]());
  return out;
}

/** The same shapes for the outline of the selected ship (inverted hull, see world3d/outline). */
export function shipHullGeometries(): Record<ShipModel, THREE.BufferGeometry> {
  return hullsOf(shipGeometries());
}

/**
 * Lit white material whose colour comes per instance (the class colour): after the instance colour is applied, every
 * fragment is mixed towards white by the vertex's `aLight`.
 */
export function shipMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float aLight;\nvarying float vLight;\nvoid main() {\nvLight = aLight;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vLight;\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vLight);');
  };
  return mat;
}

/** The scale of a model for a ship of `lenM` metres (the reported length, clamped), as a factor on the model's own metres. */
export function lengthScale(model: ShipModel, lenM: number): number {
  return Math.max(MIN_LEN_M, Math.min(MAX_LEN_M, lenM)) / REF_LEN[model];
}
