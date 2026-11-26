import * as THREE from 'three';
import { Mesh } from '../world3d/mesh';

// A radiosonde in metres (z up, the sonde itself at z = 0): the box with the instruments, the balloon on its string, or
// the parachute it falls on. One colour per instance. The ground mark is a flat disc of radius 1.

/** height of a balloon model from the sonde to its top, at its smallest */
export const MODEL_H = 28;
/** where the envelope's middle sits above the sonde */
export const ENVELOPE_Z = 21;

export function sondeGeometry(): THREE.BufferGeometry {
  const m = new Mesh();
  m.box([0, 0, 1], [2.4, 2.4, 2], new THREE.Color(0xffffff));
  return m.build();
}

export function stringGeometry(): THREE.BufferGeometry {
  const m = new Mesh();
  m.prism([0, 0, 2], [0, 0, ENVELOPE_Z - 4], 0.3, 0.3, 4, new THREE.Color(0xffffff));
  return m.build();
}

/** the envelope around z = 0, 5 m in radius and a little taller than wide */
export function envelopeGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(5, 20, 14).rotateX(Math.PI / 2).scale(1, 1, 1.15);
}

/** a dome with its four lines down to the sonde (z = 0) */
export function chuteGeometry(): THREE.BufferGeometry {
  const m = new Mesh();
  const [r, z, h] = [6, 13, 4];
  const sides = 12;
  const white = new THREE.Color(0xffffff);
  const rings = 4;
  const at = (i: number, k: number): [number, number, number] => {
    const a = (i / sides) * Math.PI * 2;
    const up = (k / rings) * (Math.PI / 2);
    return [Math.cos(a) * Math.cos(up) * r, Math.sin(a) * Math.cos(up) * r, z + Math.sin(up) * h];
  };
  for (let k = 0; k < rings; k++) for (let i = 0; i < sides; i++) m.quad(at(i, k), at(i + 1, k), at(i + 1, k + 1), at(i, k + 1), white);
  for (let i = 0; i < sides; i += 3) m.prism([0, 0, 2], at(i, 0), 0.2, 0.2, 3, white);
  return m.build();
}

export const markGeometry = (): THREE.BufferGeometry => new THREE.CircleGeometry(1, 20);
