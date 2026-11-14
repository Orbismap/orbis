import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hullsOf } from '../world3d/outline';
import type { PlaneModel } from './smoothing';

// Procedural low-poly aircraft (metres, nose towards +y, x east, z up, wheels at z = 0). Ported from the old app's
// planes3d.ts. They are drawn instanced (one draw call per model for all aircraft). Parts that need another colour
// (glass, wheels, beacon) are extra instances of their own geometry (`MODEL_PARTS`); rotors are instances turned about
// their pivot every frame (`SPINNERS`).

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
const HELI_K = 1.5;

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
  return merge(parts).scale(HELI_K, HELI_K, HELI_K);
}

/** Main rotor: four blades around the origin (the mast), turned about z. */
function heliMainRotor(): THREE.BufferGeometry {
  const blades = Array.from({ length: 4 }, (_, i) => new THREE.BoxGeometry(0.45, 6.3, 0.05).translate(0, 3.35, 0).rotateZ((i * Math.PI) / 2));
  return merge(blades).scale(HELI_K, HELI_K, HELI_K);
}

/** Tail rotor: a cross around the origin (the end of the boom), turned about x. */
function heliTailRotor(): THREE.BufferGeometry {
  return merge([new THREE.BoxGeometry(0.05, 1.5, 0.16), new THREE.BoxGeometry(0.05, 1.5, 0.16).rotateX(Math.PI / 2)]).scale(HELI_K, HELI_K, HELI_K);
}

// --- drone: a quadcopter of about 3 m span (drawn larger than the real 0.3-1 m, like the old app's sonde) ---
const DRONE_ARM = 1.06;
/** the drone is built at about 3 m and scaled up by this (about 6 m span: far larger than the real 0.3-1 m, so it can be seen) */
const DRONE_K = 2;

function drone(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(0.8, 0.8, 0.3).translate(0, 0, 0.8).scale(DRONE_K, DRONE_K, DRONE_K);
}
function droneArms(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(3.0, 0.12, 0.1).rotateZ(Math.PI / 4).translate(0, 0, 0.8),
    new THREE.BoxGeometry(3.0, 0.12, 0.1).rotateZ(-Math.PI / 4).translate(0, 0, 0.8),
  ];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) parts.push(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 8).rotateX(Math.PI / 2).translate(sx * DRONE_ARM, sy * DRONE_ARM, 0.9));
  return merge(parts).scale(DRONE_K, DRONE_K, DRONE_K);
}
function droneNose(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(0.3, 0.25, 0.2).translate(0, 0.5, 0.82).scale(DRONE_K, DRONE_K, DRONE_K);
}
function droneRotor(): THREE.BufferGeometry {
  return merge([new THREE.BoxGeometry(1.15, 0.1, 0.02)]).scale(DRONE_K, DRONE_K, DRONE_K);
}

// --- airport ground vehicles (ADS-B categories C1 emergency, C2 service); ported from the old app, nose towards +y ---
const CAR_K = 1.35;
const TUG_K = 1.35;
const scaled = (parts: THREE.BufferGeometry[], k: number) => merge(parts).scale(k, k, k);
const wheelsAt = (r: number, w: number, x: number, ys: number[], z: number) =>
  ys.flatMap((y) => [-1, 1].map((side) => new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2).translate(side * x, y, z)));

/** Follow-me car */
function car() {
  return {
    body: scaled(
      [
        new THREE.BoxGeometry(2.1, 4.8, 0.75).translate(0, 0, 0.78),
        new THREE.BoxGeometry(2.0, 1.5, 0.35).translate(0, 1.55, 1.2),
        new THREE.BoxGeometry(2.05, 1.9, 0.85).translate(0, -1.35, 1.4),
        new THREE.BoxGeometry(2.2, 0.25, 0.35).translate(0, 2.45, 0.65),
        new THREE.BoxGeometry(2.2, 0.25, 0.35).translate(0, -2.45, 0.65),
        new THREE.BoxGeometry(1.4, 0.16, 0.52).translate(0, -0.6, 2.4),
      ],
      CAR_K,
    ),
    glass: scaled([new THREE.BoxGeometry(1.92, 1.85, 0.82).translate(0, 0.3, 1.55)], CAR_K),
    wheels: scaled(wheelsAt(0.44, 0.32, 1.08, [1.45, -1.45], 0.44), CAR_K),
    beacon: scaled([new THREE.BoxGeometry(1.5, 0.35, 0.18).translate(0, 0.5, 2.1), new THREE.BoxGeometry(1.28, 0.12, 0.42).translate(0, -0.6, 2.4)], CAR_K),
  };
}

/** Pushback tug */
function tug() {
  return {
    body: scaled(
      [
        new THREE.BoxGeometry(2.7, 6.2, 0.85).translate(0, 0, 0.9),
        new THREE.BoxGeometry(2.9, 4.2, 0.6).translate(0, 0, 0.8),
        new THREE.BoxGeometry(0.7, 0.6, 0.4).translate(0, 3.2, 0.65),
        new THREE.BoxGeometry(0.7, 0.6, 0.4).translate(0, -3.2, 0.65),
        new THREE.BoxGeometry(2.9, 1.0, 0.3).translate(0, 2.1, 0.55),
        new THREE.BoxGeometry(2.9, 1.0, 0.3).translate(0, -2.1, 0.55),
      ],
      TUG_K,
    ),
    glass: scaled([new THREE.BoxGeometry(2.0, 2.0, 0.85).translate(0, 0.6, 1.6)], TUG_K),
    wheels: scaled(wheelsAt(0.62, 0.52, 1.38, [1.7, -1.7], 0.62), TUG_K),
    beacon: scaled([new THREE.BoxGeometry(1.6, 0.35, 0.18).translate(0, 0.6, 2.1)], TUG_K),
  };
}

/** Airport crash tender (fire truck), about 10 m long */
function firetruck() {
  return {
    body: merge([
      new THREE.BoxGeometry(2.6, 9.4, 0.9).translate(0, 0, 1.0), // chassis
      new THREE.BoxGeometry(2.6, 2.5, 1.5).translate(0, 3.4, 2.2), // cab
      new THREE.BoxGeometry(2.5, 5.6, 1.5).translate(0, -1.4, 2.3), // water tank / body
      new THREE.BoxGeometry(0.5, 0.5, 0.6).translate(0, 1.4, 3.35), // roof turret
      new THREE.BoxGeometry(0.2, 2.2, 0.2).translate(0, 2.6, 3.8), // turret barrel
    ]),
    glass: merge([new THREE.BoxGeometry(2.4, 1.3, 0.8).translate(0, 3.9, 2.55)]),
    wheels: merge(wheelsAt(0.62, 0.5, 1.3, [3.4, -1.0, -3.4], 0.62)),
    beacon: merge([new THREE.BoxGeometry(1.6, 0.3, 0.2).translate(0, 3.4, 3.1)]),
  };
}

/** The geometries of the models themselves (the part that has the colour of the aircraft). */
const MODEL_KEYS: PlaneModel[] = ['light', 'narrow', 'wide', 'heli', 'drone', 'car', 'tug', 'firetruck'];

/** An extra instance of a model, in a colour of its own; `beacon`: flashes like a warning light. */
export interface ModelPart {
  key: string;
  color: number;
  beacon?: boolean;
}
const GLASS = 0x37474f;
const WHEEL = 0x1f232b;
const BEACON = 0xff9900;
export const MODEL_PARTS: Partial<Record<PlaneModel, ModelPart[]>> = {
  drone: [{ key: 'drone:arms', color: 0x2a2f38 }, { key: 'drone:nose', color: 0xff3b30 }],
  car: [{ key: 'car:glass', color: GLASS }, { key: 'car:wheels', color: WHEEL }, { key: 'car:beacon', color: BEACON, beacon: true }],
  tug: [{ key: 'tug:glass', color: GLASS }, { key: 'tug:wheels', color: WHEEL }, { key: 'tug:beacon', color: BEACON, beacon: true }],
  firetruck: [{ key: 'firetruck:glass', color: GLASS }, { key: 'firetruck:wheels', color: WHEEL }, { key: 'firetruck:beacon', color: 0x2f7bff, beacon: true }],
};
/** Models that keep one colour instead of the aircraft's altitude colour. */
export const MODEL_COLOR: Partial<Record<PlaneModel, number>> = { car: 0xffd21f, tug: 0xe9ecef, firetruck: 0xd7261e };

/**
 * Small models are drawn larger when the map is zoomed out, so they stay findable: their minimum on-screen size is this many
 * times that of an airliner per metre (about as long on screen as a narrow-body aircraft). Close up they have their real size.
 */
export const MODEL_BOOST: Partial<Record<PlaneModel, number>> = { drone: 8, car: 5, tug: 5, firetruck: 3.5 };

/** Smallest scale of a model at any zoom: close up the drone is this many times its (already enlarged) size, about 15 m span. */
export const MODEL_MIN_SCALE: Partial<Record<PlaneModel, number>> = { drone: 2.5 };

/** A part of a model that turns about `pivot` (model units, before the instance scale); `rps` turns per second (negative: the other way). */
export interface Spinner {
  key: string;
  pivot: [number, number, number];
  axis: 'x' | 'z';
  rps: number;
  color: number;
}
const ROTOR = 0x20242b;
const HELI_PIVOT = (x: number, y: number, z: number): [number, number, number] => [x * HELI_K, y * HELI_K, z * HELI_K];
export const SPINNERS: Partial<Record<PlaneModel, Spinner[]>> = {
  heli: [
    { key: 'heli:main', pivot: HELI_PIVOT(0, 0.2, 4.85), axis: 'z', rps: 2.5, color: ROTOR },
    { key: 'heli:tail', pivot: HELI_PIVOT(0.3, -8.9, 3.5), axis: 'x', rps: 5, color: ROTOR },
  ],
  drone: [
    { key: 'drone:rotor', pivot: [DRONE_ARM * DRONE_K, DRONE_ARM * DRONE_K, 1.05 * DRONE_K], axis: 'z', rps: 4, color: ROTOR },
    { key: 'drone:rotor', pivot: [-DRONE_ARM * DRONE_K, DRONE_ARM * DRONE_K, 1.05 * DRONE_K], axis: 'z', rps: -4, color: ROTOR },
    { key: 'drone:rotor', pivot: [DRONE_ARM * DRONE_K, -DRONE_ARM * DRONE_K, 1.05 * DRONE_K], axis: 'z', rps: -4, color: ROTOR },
    { key: 'drone:rotor', pivot: [-DRONE_ARM * DRONE_K, -DRONE_ARM * DRONE_K, 1.05 * DRONE_K], axis: 'z', rps: 4, color: ROTOR },
  ],
};
/** Most rotors one aircraft has (the instance buffer of the rotors is sized by it). */
export const MAX_SPINNERS = 4;

/** One geometry per model and per part; the caller owns them (GeoInstances disposes them). */
export function planeGeometries(): Record<string, THREE.BufferGeometry> {
  const c = car();
  const t = tug();
  const f = firetruck();
  return {
    light: airliner(0.35), narrow: airliner(1), wide: airliner(1.68), heli: helicopter(),
    drone: drone(), 'drone:arms': droneArms(), 'drone:nose': droneNose(),
    car: c.body, 'car:glass': c.glass, 'car:wheels': c.wheels, 'car:beacon': c.beacon,
    tug: t.body, 'tug:glass': t.glass, 'tug:wheels': t.wheels, 'tug:beacon': t.beacon,
    firetruck: f.body, 'firetruck:glass': f.glass, 'firetruck:wheels': f.wheels, 'firetruck:beacon': f.beacon,
  };
}

/** The turning parts (rotors), geometries around their pivot. */
export function spinnerGeometries(): Record<string, THREE.BufferGeometry> {
  return { 'heli:main': heliMainRotor(), 'heli:tail': heliTailRotor(), 'drone:rotor': droneRotor() };
}

/** One outline geometry per model (see `hull` in world3d/outline); the caller owns them. */
export function hullGeometries(): Record<string, THREE.BufferGeometry> {
  const all = planeGeometries();
  const mine: Record<string, THREE.BufferGeometry> = {};
  for (const k of Object.keys(all)) {
    if ((MODEL_KEYS as string[]).includes(k)) mine[k] = all[k]!;
    else all[k]!.dispose();
  }
  return hullsOf(mine);
}
