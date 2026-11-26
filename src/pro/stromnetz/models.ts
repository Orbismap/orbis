import * as THREE from 'three';
import { Mesh, norm, type V } from '../world3d/mesh';
import { DESIGNS, profileWidth, type ArmSpec, type DesignId, type DesignSpec } from './designs';

// Procedural low-poly power towers built from the numbers of designs.ts (metres, x across the line, y along it, z up, base
// at z = 0). Lattice towers are real frameworks (four tapering legs, belts, X bracing, trussed crossarms), poles are
// tapered tubes, insulators hang where the wires attach. One merged geometry per design with vertex colours, drawn
// instanced by GeoInstances (one draw call per design).

const STEEL = new THREE.Color(0xc9d0d8);
const STEEL_DARK = new THREE.Color(0xaab3bd);
const CONCRETE = new THREE.Color(0xc4c0b6);
const WOOD = new THREE.Color(0x7a5a3c);
const WOOD_ARM = new THREE.Color(0x634a33);
const GLASS = new THREE.Color(0xb5d3c4);
const CERAMIC = new THREE.Color(0xa88468);

/** A square lattice column around (cx, 0): four tapering legs, belts and X bracing on the four faces. */
function lattice(m: Mesh, cx: number, profile: [number, number][], top: number, color: THREE.Color) {
  const panels = Math.max(5, Math.min(12, Math.round(top / 3.6)));
  const corners: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const at = (k: number) => {
    const z = (top * k) / panels;
    const w = profileWidth(profile, top, z);
    return { z, pts: corners.map(([sx, sy]) => [cx + sx * w, sy * w, z] as V) };
  };
  let lower = at(0);
  for (let k = 1; k <= panels; k++) {
    const upper = at(k);
    const leg = Math.max(0.09, upper.pts[0]![1] * 0.1);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      m.prism(lower.pts[i]!, upper.pts[i]!, leg, leg, 4, color);
      // the face between corner i and j faces outwards: along the mean of the two corners (without the column's centre)
      const face = norm([lower.pts[i]![0] + lower.pts[j]![0] - 2 * cx, lower.pts[i]![1] + lower.pts[j]![1], 0]);
      m.strut(lower.pts[i]!, upper.pts[j]!, leg * 0.8, face, color);
      m.strut(lower.pts[j]!, upper.pts[i]!, leg * 0.8, face, color);
      m.strut(upper.pts[i]!, upper.pts[j]!, leg * 0.8, [0, 0, 1], color);
    }
    lower = upper;
  }
}

/** A vertical truss in the plane y = `y` from x = `xa` to `xb` (bottom chord at `z`, top chord `ah0` / `ah1` above it). */
function truss(m: Mesh, y: number, xa: number, xb: number, z: number, ah0: number, ah1: number, color: THREE.Color) {
  const len = Math.abs(xb - xa);
  const n = Math.max(3, Math.round(len / 1.5));
  const bottom = (t: number): V => [xa + (xb - xa) * t, y, z];
  const top = (t: number): V => [xa + (xb - xa) * t, y, z + ah0 + (ah1 - ah0) * t];
  m.prism(bottom(0), bottom(1), 0.09, 0.09, 3, color);
  m.prism(top(0), top(1), 0.09, 0.09, 3, color);
  for (let i = 0; i <= n; i++) m.strut(bottom(i / n), top(i / n), 0.1, [0, 1, 0], color);
  for (let i = 0; i < n; i++) {
    const [a, b] = i % 2 ? [top(i / n), bottom((i + 1) / n)] : [bottom(i / n), top((i + 1) / n)];
    m.strut(a, b, 0.1, [0, 1, 0], color);
  }
}

/** The insulator at a wire point: a glass string hanging from the arm, or a ceramic pin standing on it. */
function insulator(m: Mesh, x: number, arm: ArmSpec, zArm = arm.z) {
  if (arm.pin) {
    m.prism([x, 0, zArm], [x, 0, zArm + 0.5], 0.13, 0.08, 6, CERAMIC, true);
    return;
  }
  m.prism([x, 0, zArm], [x, 0, zArm - arm.hang], 0.17, 0.17, 6, GLASS, true);
  // the clamp the wire hangs in
  m.box([x, 0, zArm - arm.hang - 0.15], [0.3, 0.3, 0.3], STEEL_DARK);
}

const xs = (arm: ArmSpec) => {
  const out: number[] = [];
  for (const side of [-1, 1]) {
    if ((arm.sides === 'left' && side > 0) || (arm.sides === 'right' && side < 0)) continue;
    for (const p of arm.points) out.push(side * arm.reach * p);
  }
  if (arm.center) out.push(0);
  return out;
};

function latticeTower(spec: DesignSpec, m: Mesh) {
  const body = spec.body;
  if (body.kind !== 'lattice') return;
  lattice(m, 0, body.profile, body.top, STEEL);
  for (const arm of spec.arms) {
    const w = profileWidth(body.profile, body.top, arm.z);
    for (const side of [-1, 1]) {
      if ((arm.sides === 'left' && side > 0) || (arm.sides === 'right' && side < 0)) continue;
      // one truss per face of the column, so the arm is a framework and not a flat sheet
      for (const y of [-w, w]) truss(m, y, side * w, side * arm.reach, arm.z, Math.min(2.2, 0.16 * arm.reach + 0.7), 0.25, STEEL);
      m.strut([side * w, -w, arm.z], [side * w, w, arm.z], 0.12, [0, 0, 1], STEEL);
      m.strut([side * arm.reach, -w, arm.z], [side * arm.reach, w, arm.z], 0.12, [0, 0, 1], STEEL);
    }
    for (const x of xs(arm)) insulator(m, x, arm);
  }
  // the peak that carries the earth wire
  m.prism([0, 0, body.top], [0, 0, spec.h], 0.2, 0.06, 4, STEEL, true);
}

function portalTower(spec: DesignSpec, m: Mesh) {
  const body = spec.body;
  if (body.kind !== 'portal') return;
  for (const s of [-1, 1]) {
    lattice(m, s * body.legX, body.profile, body.top, STEEL);
    m.prism([s * body.legX, 0, body.top], [s * body.legX, 0, spec.h], 0.15, 0.05, 4, STEEL, true);
  }
  for (const arm of spec.arms) {
    const w = profileWidth(body.profile, body.top, arm.z);
    // the beam: between the legs and out over them
    for (const y of [-w, w]) truss(m, y, -arm.reach, arm.reach, arm.z, 1.5, 1.5, STEEL);
    m.strut([-arm.reach, -w, arm.z], [-arm.reach, w, arm.z], 0.12, [0, 0, 1], STEEL);
    m.strut([arm.reach, -w, arm.z], [arm.reach, w, arm.z], 0.12, [0, 0, 1], STEEL);
    for (const x of xs(arm)) insulator(m, x, arm);
  }
}

function tubeTower(spec: DesignSpec, m: Mesh) {
  const body = spec.body;
  if (body.kind !== 'tube') return;
  const color = body.material === 'concrete' ? CONCRETE : body.material === 'wood' ? WOOD : STEEL_DARK;
  const armColor = body.material === 'wood' ? WOOD_ARM : body.material === 'concrete' ? STEEL_DARK : STEEL;
  m.prism([0, 0, 0], [0, 0, body.top], body.r0, body.r1, body.sides, color, true);
  const rAt = (z: number) => body.r0 + (body.r1 - body.r0) * (z / body.top);
  for (const arm of spec.arms) {
    for (const side of [-1, 1]) {
      if ((arm.sides === 'left' && side > 0) || (arm.sides === 'right' && side < 0)) continue;
      const r = rAt(arm.z);
      if (arm.style === 'beam') {
        m.box([side * (arm.reach + r) / 2, 0, arm.z], [arm.reach - r, 0.16, 0.2], armColor);
        // diagonal brace down to the pole
        m.prism([side * r, 0, arm.z - 0.9], [side * arm.reach * 0.55, 0, arm.z], 0.045, 0.045, 4, armColor);
      } else {
        m.prism([side * r, 0, arm.z], [side * arm.reach, 0, arm.z], 0.17, 0.07, 6, armColor, true);
        m.prism([side * r, 0, arm.z - 1.3], [side * arm.reach * 0.6, 0, arm.z - 0.05], 0.05, 0.05, 4, armColor);
      }
    }
    for (const x of xs(arm)) insulator(m, x, arm);
  }
  if (spec.topPin) m.prism([0, 0, spec.h], [0, 0, spec.h + 0.5], 0.13, 0.08, 6, CERAMIC, true);
  if (spec.earth.length && spec.h > body.top) m.prism([0, 0, body.top], [0, 0, spec.h], 0.1, 0.04, 4, color, true);
}

function twinTower(spec: DesignSpec, m: Mesh) {
  const body = spec.body;
  if (body.kind !== 'twin') return;
  for (const s of [-1, 1]) m.prism([s * body.legX, 0, 0], [s * body.legX, 0, body.top], body.r0, body.r1, 7, WOOD, true);
  for (const arm of spec.arms) {
    m.box([0, 0, arm.z], [arm.reach * 2, 0.18, 0.22], WOOD_ARM);
    // an X of braces between the poles under the beam
    const lo = arm.z - 3.2;
    m.strut([-body.legX, 0, lo], [body.legX, 0, arm.z - 0.2], 0.14, [0, 1, 0], WOOD_ARM);
    m.strut([body.legX, 0, lo], [-body.legX, 0, arm.z - 0.2], 0.14, [0, 1, 0], WOOD_ARM);
    for (const x of xs(arm)) insulator(m, x, arm);
  }
}

/** The geometry of one design (the caller owns it). */
export function buildDesign(id: DesignId): THREE.BufferGeometry {
  const spec = DESIGNS[id];
  const m = new Mesh();
  if (spec.body.kind === 'lattice') latticeTower(spec, m);
  else if (spec.body.kind === 'portal') portalTower(spec, m);
  else if (spec.body.kind === 'twin') twinTower(spec, m);
  else tubeTower(spec, m);
  return m.build();
}

/** One geometry per design; GeoInstances disposes them. */
export function towerGeometries(): Record<DesignId, THREE.BufferGeometry> {
  return Object.fromEntries((Object.keys(DESIGNS) as DesignId[]).map((id) => [id, buildDesign(id)])) as Record<DesignId, THREE.BufferGeometry>;
}

export function towerMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
}
