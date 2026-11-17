import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Smooth procedural trees: a lumpy rounded crown on a tapered trunk, with smooth normals (no facets) and vertex colours.
// Metres, z up, base at z = 0, nominal height TREE_H; the part scales a model to the tree's real height. Twelve shapes: three
// generic broadleaf crowns, the typical genera (oak, birch, poplar, willow), three conifers (spruce, pine, cypress), a bush (for hedges) and a
// palm, each in a high and a low detail version: the near trees get the smooth one, the far ones the cheap one. Drawn
// instanced by GeoInstances, one draw call per model.

/** Height of every model before scaling (m). */
export const TREE_H = 10;

/** rund/oval/breit: unknown broadleaf; nadel: spruce-like cone, the default conifer. */
export type TreeShape = 'rund' | 'oval' | 'breit' | 'eiche' | 'birke' | 'pappel' | 'weide' | 'kiefer' | 'busch' | 'nadel' | 'zypresse' | 'palme';
export type TreeDetail = 'hoch' | 'niedrig';

export const SHAPES: readonly TreeShape[] = ['rund', 'oval', 'breit', 'eiche', 'birke', 'pappel', 'weide', 'kiefer', 'busch', 'nadel', 'zypresse', 'palme'];
export const modelKey = (shape: TreeShape, detail: TreeDetail) => `${shape}:${detail}`;

const TRUNK = new THREE.Color(0x6b5b3b);
const BROAD_LOW = new THREE.Color(0x0b5f5c);
const BROAD_HIGH = new THREE.Color(0x1b8a80);
const NEEDLE_LOW = new THREE.Color(0x0e4f45);
const NEEDLE_HIGH = new THREE.Color(0x1f7a66);
const PALM_LOW = new THREE.Color(0x0b6552);
const PALM_HIGH = new THREE.Color(0x2f9474);

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
  /** crown colour at the bottom and at the top */
  low: THREE.Color;
  high: THREE.Color;
  /** trunk: height (m, default up into the crown), radius at the foot and the top, colour */
  trunk?: { h?: number; r0?: number; r1?: number; colour?: THREE.Color } | false;
}

type CrownShape = 'rund' | 'oval' | 'breit' | 'eiche' | 'birke' | 'pappel' | 'weide' | 'kiefer' | 'busch';

// Tall, egg-shaped crowns that start low on a short trunk, like the reference pictures: the crown is about four fifths of the tree.
// The generic three share the teal of the map; the genera differ in outline and only a little in tone (same hue, a shade lighter or darker), so no tree sticks out of the picture.
const CROWNS: Record<CrownShape, Crown> = {
  rund: { rx: 2.7, rz: 3.8, cz: 6.2, lump: 0.18, egg: 0.12, seed: 1.3, low: BROAD_LOW, high: BROAD_HIGH },
  oval: { rx: 2.4, rz: 4.2, cz: 6, lump: 0.17, egg: 0.16, seed: 4.1, low: BROAD_LOW, high: BROAD_HIGH },
  breit: { rx: 3, rz: 3.7, cz: 6.3, lump: 0.2, egg: 0.1, seed: 7.7, low: BROAD_LOW, high: BROAD_HIGH },
  // oak: wide, knobbly, a thick short trunk
  eiche: { rx: 3.6, rz: 3.4, cz: 6.3, lump: 0.24, egg: 0.05, seed: 9.2, low: new THREE.Color(0x0b5444), high: new THREE.Color(0x1c7c68), trunk: { r0: 0.55, r1: 0.32 } },
  // birch: slim, light, white trunk
  birke: { rx: 2, rz: 4.2, cz: 5.9, lump: 0.18, egg: -0.05, seed: 2.6, low: new THREE.Color(0x218272), high: new THREE.Color(0x4aaa92), trunk: { r0: 0.22, r1: 0.14, colour: new THREE.Color(0xd8d4c8) } },
  // poplar: a tall column
  pappel: { rx: 1.7, rz: 4.6, cz: 5.4, lump: 0.1, egg: 0.04, seed: 5.5, low: new THREE.Color(0x0a5d52), high: new THREE.Color(0x1d8f78), trunk: { h: 3, r0: 0.28, r1: 0.18 } },
  // willow: broad and hanging down almost to the ground
  weide: { rx: 3.6, rz: 4.3, cz: 5.3, lump: 0.16, egg: -0.15, seed: 6.4, low: new THREE.Color(0x2c8468), high: new THREE.Color(0x4fa884), trunk: { h: 3, r0: 0.4, r1: 0.25 } },
  // bush (a piece of a hedge): a dense, low-hanging ball without a trunk, a little wider than a tree crown is tall
  busch: { rx: 4, rz: 4.6, cz: 5.45, lump: 0.14, egg: 0, seed: 8.1, low: new THREE.Color(0x0a5450), high: new THREE.Color(0x1a7a70), trunk: false },
  // pine: a flat crown on a tall, reddish trunk
  kiefer: { rx: 3.5, rz: 1.9, cz: 8.2, lump: 0.24, egg: 0.1, seed: 3.3, low: new THREE.Color(0x0d4f46), high: new THREE.Color(0x23745f), trunk: { h: 7.4, r0: 0.35, r1: 0.22, colour: new THREE.Color(0x8a5a3a) } },
};

/** Smooth, deterministic lump pattern over the unit sphere, about -1 … 1. */
const lumps = (x: number, y: number, z: number, seed: number) =>
  (Math.sin(x * 2.3 + seed) * Math.cos(y * 2.1 - seed * 1.7) + Math.sin(z * 2.9 + y * 1.5 + seed * 0.6) * 0.9 + Math.sin((x + z) * 4.7 - seed) * 0.4 + Math.cos((y - z) * 6.1 + seed * 2) * 0.2) / 2.5;

/** Fine, bumpy irregularity on top of `lumps`, so the crowns read as clusters of foliage instead of smooth balls. */
const bumps = (x: number, y: number, z: number, seed: number) => Math.sin(x * 7.1 + seed * 1.3) * Math.cos(z * 8.3 - seed) * Math.sin(y * 6.7 + seed * 0.8) + Math.sin((x - y) * 9.4 + z * 5.2 + seed) * 0.5;
/** Strength of the bumps (share of the radius). */
const ROUGH = 0.09;

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
    const k = 1 + c.lump * lumps(x, y, z, c.seed) + ROUGH * bumps(x, y, z, c.seed);
    // egg: wider above the middle, rounded and narrower below
    const wide = 1 + c.egg * z;
    pos.setXYZ(i, x * c.rx * k * wide, y * c.rx * k * wide, c.cz + z * c.rz * k);
  }
  return finish(g, (_x, _y, z) => c.low.clone().lerp(c.high, Math.min(1, Math.max(0, (z - (c.cz - c.rz)) / (2 * c.rz)))));
}

/** A column (cypress): a smooth, slightly wavy body from near the ground to a blunt tip; a small `taper` makes it slimmer. */
function columnCrown(subdivisions: number, seed: number, radius = 2.5, bottom = 1.4, taper = 0.9): THREE.BufferGeometry {
  const rings = 6 + subdivisions * 3;
  const sides = 8 + subdivisions * 4;
  const top = TREE_H;
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    // wide below, a rounded tip above; the tiers show as a gentle wave
    const r = radius * Math.pow(1 - t, taper) * (1 + 0.07 * Math.sin(t * Math.PI * 5 + seed)) * (1 - Math.pow(t, 6) * 0.2);
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

/** A spruce: three soft tiers, each with a rounded, scalloped rim and a ledge to the next, and a blunt, rounded tip. */
function tieredCrown(high: boolean, seed: number): THREE.BufferGeometry {
  const tiers = [{ z: 1.5, r: 2.6 }, { z: 4.4, r: 2.0 }, { z: 6.9, r: 1.4 }];
  const top = TREE_H;
  const profile: THREE.Vector2[] = [];
  const add = (r: number, z: number) => profile.push(new THREE.Vector2(Math.max(r, 0.001), z));
  add(0, tiers[0]!.z + 0.3);
  tiers.forEach(({ z, r }, i) => {
    // underside, rounded rim, then the slope up and in
    add(r * 0.82, z + 0.05);
    add(r * 0.97, z + 0.07);
    add(r, z + 0.25);
    add(r * 0.94, z + 0.55);
    const next = tiers[i + 1];
    if (next) {
      add(((r * 0.94 + next.r * 0.82) / 2) * 1.03, (z + 0.55 + next.z + 0.05) / 2);
    } else {
      add(r * 0.62, (z + 0.55 + top - 0.5) / 2);
      add(0.5, top - 0.5);
      add(0.4, top - 0.25);
      add(0.2, top - 0.08);
      add(0, top);
    }
  });
  const g = new THREE.LatheGeometry(profile, high ? 20 : 10);
  g.rotateX(Math.PI / 2); // lathe turns around y: z up
  const w = weld(g);
  const pos = w.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    // scalloped rims and a little lumpiness
    const k = 1 + 0.05 * Math.sin(Math.atan2(y, x) * 5 + seed + z * 0.8) + 0.04 * lumps(x, y, z, seed);
    pos.setXYZ(i, x * k, y * k, z);
  }
  return finish(w, (_x, _y, z) => NEEDLE_LOW.clone().lerp(NEEDLE_HIGH, Math.min(1, Math.max(0, (z - tiers[0]!.z) / (top - tiers[0]!.z)))));
}

function trunk(height: number, r0: number, r1: number, sides: number, colour = TRUNK): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, height, sides, 1, true);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, height / 2);
  return finish(weld(g), () => colour);
}

/** A palm: a tall tapered trunk with a ring of drooping fronds (flat, pointed ellipsoids). */
function palm(high: boolean): THREE.BufferGeometry {
  const [top, fronds, length] = [8.6, high ? 9 : 6, 2.4];
  const parts = [trunk(top, 0.3, 0.2, high ? 8 : 5, new THREE.Color(0x8a7a5a))];
  for (let i = 0; i < fronds; i++) {
    const g = weld(new THREE.SphereGeometry(1, high ? 8 : 5, high ? 5 : 3));
    g.translate(1, 0, 0);
    g.scale(length, 0.5, 0.1);
    g.rotateY(0.35); // droops: +x turns down
    g.rotateZ((i / fronds) * Math.PI * 2 + (i % 2) * 0.2);
    g.translate(0, 0, top);
    parts.push(finish(g, (x, y) => PALM_LOW.clone().lerp(PALM_HIGH, Math.min(1, Math.hypot(x, y) / (2 * length)))));
  }
  return mergeGeometries(parts, false);
}

/** One tree model: trunk and crown in one geometry, vertex colours, smooth normals. */
export function buildTree(shape: TreeShape, detail: TreeDetail): THREE.BufferGeometry {
  const high = detail === 'hoch';
  const sides = high ? 8 : 5;
  const sub = high ? 3 : 0;
  if (shape === 'palme') return palm(high);
  if (shape === 'nadel') return mergeGeometries([trunk(2.6, 0.38, 0.28, sides), tieredCrown(high, 2.2)], false);
  if (shape === 'zypresse') return mergeGeometries([trunk(1.8, 0.22, 0.16, sides), columnCrown(sub, 5.1, 1.5, 1, 0.4)], false);
  const c = CROWNS[shape];
  const t = c.trunk;
  if (t === false) return broadCrown(c, high ? 4 : 2);
  return mergeGeometries([trunk(t?.h ?? c.cz - 1.2, t?.r0 ?? 0.38, t?.r1 ?? 0.24, sides, t?.colour), broadCrown(c, high ? 4 : 2)], false);
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
