import * as THREE from 'three';

// Simple stand-ins for the replay's vehicles, in metres, standing upright: the axis is z, the belly (heat shield side) faces +y,
// the model's centre is the middle of the body. They are built from primitives on purpose (a detailed model can replace them later
// without touching the part): a stainless-steel cylinder with a nose cone, four flaps and a dark belly for the ship, a cylinder
// with grid fins for the booster, a flat panel for a Starlink V3.

const STEEL = new THREE.MeshLambertMaterial({ color: 0xc9cdd4 });
const STEEL_DARK = new THREE.MeshLambertMaterial({ color: 0x8b9099 });
const TILES = new THREE.MeshLambertMaterial({ color: 0x15161a, side: THREE.DoubleSide });
const ENGINES = new THREE.MeshLambertMaterial({ color: 0x2a2c31 });
const PANEL = new THREE.MeshLambertMaterial({ color: 0xe6e9ef });
const SOLAR = new THREE.MeshLambertMaterial({ color: 0x1c2a4a });

export const R = 4.5;
export const BOOSTER_LEN = 71;
export const SHIP_LEN = 52;
export const SAT_LEN = 8;

/** a cylinder along z from z0 to z1 */
function tube(r0: number, r1: number, z0: number, z1: number, mat: THREE.Material, open = false): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, 28, 1, open);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (z0 + z1) / 2);
  return new THREE.Mesh(g, mat);
}

const box = (w: number, d: number, h: number, x: number, y: number, z: number, mat: THREE.Material, rotZ = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat);
  m.position.set(x, y, z);
  m.rotation.z = rotZ;
  return m;
};

export function makeBooster(): THREE.Group {
  const g = new THREE.Group();
  const bottom = -BOOSTER_LEN / 2;
  g.add(tube(R, R, bottom + 3, BOOSTER_LEN / 2 - 2, STEEL));
  // hot-stage ring and the cone-less top
  g.add(tube(R, R, BOOSTER_LEN / 2 - 2, BOOSTER_LEN / 2, STEEL_DARK));
  // engine section
  g.add(tube(R * 0.98, R * 0.92, bottom, bottom + 3, ENGINES));
  // four grid fins near the top
  for (const a of [45, 135, 225, 315]) {
    const rad = (a * Math.PI) / 180;
    const fin = box(3.4, 0.5, 4.6, Math.cos(rad) * (R + 1.6), Math.sin(rad) * (R + 1.6), BOOSTER_LEN / 2 - 8, STEEL_DARK, rad + Math.PI / 2);
    g.add(fin);
  }
  return g;
}

export function makeShip(): THREE.Group {
  const g = new THREE.Group();
  const bottom = -SHIP_LEN / 2;
  const shoulder = SHIP_LEN / 2 - 13;
  g.add(tube(R, R, bottom + 2, shoulder, STEEL));
  // nose: a cone that narrows from the shoulder to a rounded tip
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.6, R, SHIP_LEN / 2 - shoulder, 28, 1), STEEL);
  nose.geometry.rotateX(Math.PI / 2);
  nose.geometry.translate(0, 0, (SHIP_LEN / 2 + shoulder) / 2);
  g.add(nose);
  // heat shield: half a tube on the belly (+y) side, slightly proud of the body
  const belly = new THREE.CylinderGeometry(R + 0.04, R + 0.04, shoulder - bottom - 2, 20, 1, true, 0, Math.PI);
  belly.rotateX(Math.PI / 2);
  // theta 0 is +z before the rotation, so the half faces +x; turn it onto +y
  belly.rotateZ(Math.PI / 2);
  belly.translate(0, 0, (shoulder + bottom + 2) / 2);
  g.add(new THREE.Mesh(belly, TILES));
  g.add(tube(R * 0.97, R * 0.9, bottom, bottom + 2, ENGINES));
  // aft flaps (large) and forward flaps (small), one each side
  for (const s of [-1, 1]) {
    g.add(box(8.2, 0.7, 9.5, s * (R + 3.6), 0.9, bottom + 7, STEEL_DARK));
    g.add(box(4.6, 0.6, 6.6, s * (R + 1.9), 0.9, shoulder - 3, STEEL_DARK));
  }
  return g;
}

export function makeSatellite(): THREE.Group {
  const g = new THREE.Group();
  // a flat bus with one long solar array: lies in the x / z plane, the long side along x
  g.add(box(SAT_LEN, 0.18, 2.8, 0, 0, 0, PANEL));
  g.add(box(SAT_LEN * 0.92, 0.2, 2.4, 0, 0.02, 0, SOLAR));
  return g;
}

/** Exhaust: two nested additive cones from z = 0 down to z = -1 (scale z by the length, x and y by the width). */
export function makePlume(): { group: THREE.Group; mats: THREE.MeshBasicMaterial[] } {
  const group = new THREE.Group();
  const mats: THREE.MeshBasicMaterial[] = [];
  const cone = (r: number, color: number, opacity: number) => {
    const geo = new THREE.ConeGeometry(r, 1, 24, 1, true);
    // apex at -z, base at z = 0
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -0.5);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    mats.push(mat);
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 3;
    group.add(m);
  };
  cone(1, 0xff7a2e, 0.5);
  cone(0.55, 0xffe3a8, 0.85);
  group.visible = false;
  return { group, mats };
}

/** Re-entry plasma: two nested additive ellipsoids, long along y (the direction of flight, put behind the vehicle by the part). */
export function makePlasma(): { group: THREE.Group; mats: THREE.MeshBasicMaterial[] } {
  const group = new THREE.Group();
  const mats: THREE.MeshBasicMaterial[] = [];
  const blob = (sx: number, sy: number, sz: number, color: number, opacity: number) => {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    mats.push(mat);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat);
    m.scale.set(sx, sy, sz);
    m.renderOrder = 3;
    group.add(m);
  };
  blob(11, 34, 11, 0xff4a14, 0.35);
  blob(8, 22, 8, 0xff9a3c, 0.45);
  blob(5, 12, 5, 0xffe8c0, 0.55);
  group.visible = false;
  return { group, mats };
}

export function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
}
