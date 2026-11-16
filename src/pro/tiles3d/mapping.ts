import * as THREE from 'three';
import { EARTH_RADIUS_M } from '../world3d/frame';

// Pure maths for 3D Tiles on the map: where a tileset's ECEF frame sits, and the camera the tile renderer judges detail by.

const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const rad = (d: number) => (d * Math.PI) / 180;

/** WGS84 geodetic position to ECEF in metres. */
export function geodeticToEcef(lon: number, lat: number, h = 0): [number, number, number] {
  const [sLa, cLa, sLo, cLo] = [Math.sin(rad(lat)), Math.cos(rad(lat)), Math.sin(rad(lon)), Math.cos(rad(lon))];
  const n = A / Math.sqrt(1 - E2 * sLa * sLa);
  return [(n + h) * cLa * cLo, (n + h) * cLa * sLo, (n * (1 - E2) + h) * sLa];
}

/** ECEF → local east / north / up at a place (the tangent frame the stage's `place` works in). Double precision. */
export function ecefToEnu(lon: number, lat: number, h = 0, out = new THREE.Matrix4()): THREE.Matrix4 {
  const [sLa, cLa, sLo, cLo] = [Math.sin(rad(lat)), Math.cos(rad(lat)), Math.sin(rad(lon)), Math.cos(rad(lon))];
  const [x, y, z] = geodeticToEcef(lon, lat, h);
  const east = [-sLo, cLo, 0];
  const north = [-sLa * cLo, -sLa * sLo, cLa];
  const up = [cLa * cLo, cLa * sLo, sLa];
  const dot = (v: number[]) => v[0]! * x + v[1]! * y + v[2]! * z;
  return out.set(
    east[0]!, east[1]!, east[2]!, -dot(east),
    north[0]!, north[1]!, north[2]!, -dot(north),
    up[0]!, up[1]!, up[2]!, -dot(up),
    0, 0, 0, 1,
  );
}

/**
 * How far a point at `distM` metres from the anchor lies above the flat ENU plane when it sits on the ground of a
 * sphere (the Earth bends away, the flat map does not): a rigid tileset at 10 km would otherwise hang about 8 m.
 * Applied with the weight `flat` (1: flat map, 0: globe).
 */
export function curvatureLift(distM: number, flat = 1): number {
  return flat * (distM * distM) / (2 * EARTH_RADIUS_M);
}

/**
 * The camera of a frame as the tile renderer wants it: a perspective camera with the real field of view whose pose is that
 * of the map's camera in render space. `proj` is the frame's matrix (render space → clip space).
 * `metre`: render units per metre at the tileset (near and far planes are given in metres).
 */
export function proxyCamera(cam: THREE.PerspectiveCamera, proj: THREE.Matrix4, fovRad: number, width: number, height: number, metre: number): void {
  const inv = proj.clone().invert();
  const unproject = (x: number, y: number, z: number, w: number) => {
    const v = new THREE.Vector4(x, y, z, w).applyMatrix4(inv);
    return new THREE.Vector3(v.x / v.w, v.y / v.w, v.z / v.w);
  };
  // the eye is where the clip space w is zero
  const e = new THREE.Vector4(0, 0, 1, 0).applyMatrix4(inv);
  const eye = new THREE.Vector3(e.x / e.w, e.y / e.w, e.z / e.w);
  const centre0 = unproject(0, 0, 0, 1);
  const forward = centre0.clone().sub(eye).normalize();
  // screen up: the direction from the centre of the screen to the top, with the part along the view removed
  const up = unproject(0, 1, 0, 1).sub(centre0);
  up.addScaledVector(forward, -up.dot(forward)).normalize();
  cam.fov = (fovRad * 180) / Math.PI;
  cam.aspect = width / height;
  cam.near = metre;
  cam.far = 5e6 * metre;
  cam.updateProjectionMatrix();
  cam.position.copy(eye);
  cam.up.copy(up);
  cam.matrixAutoUpdate = false;
  // the right-hand side is read off the map, not crossed: the mercator square is mirrored (y points south)
  const right = unproject(1, 0, 0, 1).sub(centre0);
  right.addScaledVector(forward, -right.dot(forward)).addScaledVector(up, -right.dot(up)).normalize();
  cam.matrixWorld.makeBasis(right, up, forward.clone().negate()).setPosition(eye);
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
}
