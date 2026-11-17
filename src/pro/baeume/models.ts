import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Smooth procedural trees: a lumpy rounded crown on a tapered trunk, with smooth normals (no facets) and vertex colours.
// Metres, z up, base at z = 0, nominal height TREE_H; the part scales a model to the tree's real height. Four shapes (three
// broadleaf crowns, one conifer), each in a high and a low detail version: the near trees get the smooth one, the far ones
// the cheap one. Drawn instanced by GeoInstances, one draw call per model.

/** Height of every model before scaling (m). */
export const TREE_H = 10;

export type TreeShape = 'rund' | 'oval' | 'breit' | 'nadel';
export type TreeDetail = 'hoch' | 'niedrig';

export const SHAPES: readonly TreeShape[] = ['rund', 'oval', 'breit', 'nadel'];
export const modelKey = (shape: TreeShape, detail: TreeDetail) => `${shape}:${detail}`;

const TRUNK = new THREE.Color(0x6b5b3b);
const BROAD_LOW = new THREE.Color(0x0b5f5c);
const BROAD_HIGH = new THREE.Color(0x1b8a80);
const NEEDLE_LOW = new THREE.Color(0x0e4f45);
const NEEDLE_HIGH = new THREE.Color(0x1f7a66);

interface Crown {
  /** radii across and up (m) and the height of the crown's centre */
  rx: number;
  rz: number;
  cz: number;
  /** strength of the lumps (share of the radius) */
  lump: number;
  /** how much wider the upper half is than the lower one (an egg shape), share of the radius */
  egg: number;
  /** a different seed gives a different lump pattern */
  seed: number;
}

// Tall, egg-shaped crowns that start low on a short trunk, like the reference pictures: the crown is about four fifths of the tree.
const CROWNS: Record<Exclude<TreeShape, 'nadel'>, Crown> = {
  rund: { rx: 3.1, rz: 3.9, cz: 6.1, lump: 0.13, egg: 0.14, seed: 1.3 },
  oval: { rx: 2.6, rz: 4.3, cz: 5.7, lump: 0.12, egg: 0.18, seed: 4.1 },
  breit: { rx: 3.5, rz: 3.6, cz: 6.4, lump: 0.15, egg: 0.1, seed: 7.7 },
};

/** Smooth, deterministic lump pattern over the unit sphere, about -1 … 1. */
const lumps = (x: number, y: number, z: number, seed: number) =>
  (Math.sin(x * 2.3 + seed) * Math.cos(y * 2.1 - seed * 1.7) + Math.sin(z * 2.9 + y * 1.5 + seed * 0.6) * 0.9 + Math.sin((x + z) * 4.7 - seed) * 0.4 + Math.cos((y - z) * 6.1 + seed * 2) * 0.2) / 2.5;

/** An indexed geometry with position, normal (smooth) and colour only. */
function finish(g: THREE.BufferGeometry, colour: (x: number, y: number, z: number) => THREE.Color): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = colour(pos.getX(i), pos.getY(i), pos.getZ(i));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Welds the vertices of a three.js primitive so that its normals come out smooth. */
function weld(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return mergeVertices(g, 1e-4);
}

function broadCrown(c: Crown, subdivisions: number): THREE.BufferGeometry {
  const g = weld(new THREE.IcosahedronGeometry(1, subdivisions));
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const k = 1 + c.lump * lumps(x, y, z, c.seed);
    // egg: wider above the middle, rounded and narrower below
    const wide = 1 + c.egg * z;
    pos.setXYZ(i, x * c.rx * k * wide, y * c.rx * k * wide, c.cz + z * c.rz * k);
  }
  return finish(g, (_x, _y, z) => BROAD_LOW.clone().lerp(BROAD_HIGH, Math.min(1, Math.max(0, (z - (c.cz - c.rz)) / (2 * c.rz)))));
}

/** A conifer: a smooth, slightly wavy cone from near the ground to the tip. */
function needleCrown(subdivisions: number, seed: number): THREE.BufferGeometry {
  const rings = 6 + subdivisions * 3;
  const sides = 8 + subdivisions * 4;
  const [bottom, top, radius] = [1.4, TREE_H, 2.5];
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    // wide below, a rounded tip above; the tiers show as a gentle wave
    const r = radius * Math.pow(1 - t, 0.9) * (1 + 0.07 * Math.sin(t * Math.PI * 5 + seed)) * (1 - Math.pow(t, 6) * 0.2);
    profile.push(new THREE.Vector2(Math.max(r, 0.001), bottom + t * (top - bottom)));
  }
  const g = new THREE.LatheGeometry(profile, sides);
  g.rotateX(Math.PI / 2); // lathe turns around y: z up
  const w = weld(g);
  const pos = w.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const k = 1 + 0.06 * lumps(x, y, z, seed);
    pos.setXYZ(i, x * k, y * k, z);
  }
  return finish(w, (_x, _y, z) => NEEDLE_LOW.clone().lerp(NEEDLE_HIGH, Math.min(1, Math.max(0, (z - bottom) / (top - bottom)))));
}

function trunk(height: number, r0: number, r1: number, sides: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, height, sides, 1, true);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, height / 2);
  return finish(weld(g), () => TRUNK);
}

/** One tree model: trunk and crown in one geometry, vertex colours, smooth normals. */
export function buildTree(shape: TreeShape, detail: TreeDetail): THREE.BufferGeometry {
  const high = detail === 'hoch';
  const sides = high ? 8 : 5;
  if (shape === 'nadel') return mergeGeometries([trunk(2.4, 0.26, 0.18, sides), needleCrown(high ? 3 : 0, 2.2)], false);
  const c = CROWNS[shape];
  return mergeGeometries([trunk(c.cz - 1.2, 0.3, 0.2, sides), broadCrown(c, high ? 4 : 1)], false);
}

/** All models for the instanced mesh, by `modelKey`. */
export function treeGeometries(): Record<string, THREE.BufferGeometry> {
  const out: Record<string, THREE.BufferGeometry> = {};
  for (const shape of SHAPES) for (const detail of ['hoch', 'niedrig'] as const) out[modelKey(shape, detail)] = buildTree(shape, detail);
  return out;
}

export function treeMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
}
