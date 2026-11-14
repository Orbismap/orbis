import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlaneModel } from './smoothing';

// Procedural low-poly aircraft (metres, nose towards +y, x east, z up, wheels at z = 0). Ported from the old app's
// planes3d.ts. They are drawn instanced (one draw call per model for all aircraft), so the helicopter's rotors are
// part of its geometry and do not turn.

/** A swept, flat wing panel on the +x side, plus its mirror image. */
function wingPanel(rootX: number, tipX: number, rootLeadY: number, rootChord: number, tipChord: number, sweep: number, thick: number, z: number): THREE.BufferGeometry[] {
  const s = new THREE.Shape();
  const tipLeadY = rootLeadY - sweep;
  s.moveTo(rootX, rootLeadY);
  s.lineTo(tipX, tipLeadY);
  s.lineTo(tipX, tipLeadY - tipChord);
  s.lineTo(rootX, rootLeadY - rootChord);
  s.closePath();
  const right = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false }).translate(0, 0, z);
  const left = right.clone().scale(-1, 1, 1);
  return [right, left];
}

/** Only position + normal are needed; keep the attributes identical so the parts can be merged. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(
    parts.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      n.deleteAttribute('uv');
      return n;
    }),
  )!;
}

export function airliner(k: number): THREE.BufferGeometry {
  const L = 37.6 * k;
  const r = 1.95 * k;
  const zc = 3.3 * k;
  const noseH = 0.14 * L;
  const tailH = 0.24 * L;
  const bodyL = L - noseH - tailH;
  const bodyMid = (tailH - noseH) / 2; // body centre so the whole fuselage is centred on y = 0
  const parts: THREE.BufferGeometry[] = [];
  parts.push(new THREE.CylinderGeometry(r, r, bodyL, 14).translate(0, bodyMid, zc));
  parts.push(new THREE.CylinderGeometry(r * 0.22, r, noseH, 14).translate(0, bodyMid + bodyL / 2 + noseH / 2, zc));
  parts.push(new THREE.CylinderGeometry(r, r * 0.18, tailH, 14).translate(0, bodyMid - bodyL / 2 - tailH / 2, zc + r * 0.1));
  // wings (low wing), horizontal tail
  parts.push(...wingPanel(r * 0.7, 17.9 * k, 3.2 * k, 6.5 * k, 1.6 * k, 7.5 * k, 0.5 * k, zc - r * 0.55));
  parts.push(...wingPanel(r * 0.5, 6.2 * k, -L * 0.34, 4.2 * k, 1.3 * k, 3.4 * k, 0.35 * k, zc + r * 0.25));
  // engines
  for (const side of [-1, 1]) {
    parts.push(new THREE.CylinderGeometry(1.05 * k, 1.0 * k, 3.6 * k, 10).translate(side * 5.8 * k, 3.3 * k, zc - r * 0.55 - 1.0 * k));
  }
  // vertical fin: drawn in (y, z), extruded along x
  const fin = new THREE.Shape();
  const fz = zc + r * 0.55;
  fin.moveTo(-L * 0.28, fz);
  fin.lineTo(-L * 0.4, fz + 6.4 * k);
  fin.lineTo(-L * 0.4 - 2.6 * k, fz + 6.4 * k);
  fin.lineTo(-L * 0.47, fz);
  fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.5 * k, bevelEnabled: false }).translate(0, 0, -0.25 * k);
  // (x, y, z) → (z, x, y): shape x becomes the plane's y axis, shape y its z axis
  finGeo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  parts.push(finGeo);
  return merge(parts);
}

/** the helicopter model is built a little larger than its metre dimensions suggest */
const HELI_K = 1.15;

function helicopter(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    new THREE.SphereGeometry(1, 16, 12).scale(1.5, 3.2, 1.55).translate(0, 0.8, 2.0), // cabin
    new THREE.SphereGeometry(1, 12, 8).scale(0.95, 1.8, 0.8).translate(0, -0.6, 3.5), // engine housing
    new THREE.CylinderGeometry(0.5, 0.2, 7, 10).translate(0, -5.3, 2.6), // tail boom
    new THREE.BoxGeometry(0.16, 1.3, 1.9).translate(0, -8.6, 3.4), // fin
    new THREE.BoxGeometry(2.4, 0.8, 0.12).translate(0, -7.6, 2.7), // stabiliser
    new THREE.CylinderGeometry(0.17, 0.2, 1.2, 8).rotateX(Math.PI / 2).translate(0, 0.2, 4.2), // rotor mast
  ];
  for (const side of [-1, 1]) {
    parts.push(new THREE.CylinderGeometry(0.12, 0.12, 5.4, 6).translate(side * 1.35, 0.6, 0.3)); // skid
    for (const y of [-0.9, 1.9]) parts.push(new THREE.BoxGeometry(0.12, 0.12, 1.5).translate(side * 1.25, y, 1.0)); // strut
  }
  // main rotor: four blades at the mast, tail rotor: a cross at the end of the boom
  for (let i = 0; i < 4; i++) parts.push(new THREE.BoxGeometry(0.45, 6.3, 0.05).translate(0, 3.35, 0).rotateZ((i * Math.PI) / 2).translate(0, 0.2, 4.85));
  parts.push(new THREE.BoxGeometry(0.05, 1.5, 0.16).translate(0.3, -8.9, 3.5), new THREE.BoxGeometry(0.05, 1.5, 0.16).rotateX(Math.PI / 2).translate(0.3, -8.9, 3.5));
  return merge(parts).scale(HELI_K, HELI_K, HELI_K);
}

/** One geometry per model; the caller owns them (GeoInstances disposes them). */
export function planeGeometries(): Record<PlaneModel, THREE.BufferGeometry> {
  return { light: airliner(0.35), narrow: airliner(1), wide: airliner(1.68), heli: helicopter() };
}

/**
 * The same shapes for an outline (inverted hull): normals averaged over the corners that share a place, so that pushing
 * every vertex out along its normal keeps hard edges closed. The stored normals are used, not the winding: the mirrored
 * wing panels have the opposite winding.
 */
function hull(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const key = (i: number) => `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
  const sums = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const s = sums.get(k) ?? sums.set(k, new THREE.Vector3()).get(k)!;
    s.x += nor.getX(i);
    s.y += nor.getY(i);
    s.z += nor.getZ(i);
  }
  const out = g.clone();
  const n = out.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const s = sums.get(key(i))!.clone().normalize();
    n.setXYZ(i, s.x, s.y, s.z);
  }
  return out;
}

/** One outline geometry per model (see `hull`); the caller owns them. */
export function hullGeometries(): Record<PlaneModel, THREE.BufferGeometry> {
  const g = planeGeometries();
  const out = {} as Record<PlaneModel, THREE.BufferGeometry>;
  for (const k of Object.keys(g) as PlaneModel[]) {
    out[k] = hull(g[k]);
    g[k].dispose();
  }
  return out;
}
