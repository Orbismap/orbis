import * as THREE from 'three';
import { Mesh, type V } from '../world3d/mesh';

// A procedural three-bladed wind turbine (metres, x across, y along the rotor axis with the nose at +y, z up) in three
// parts, so that every turbine gets its own hub height and rotor size out of the same geometries: the tower (1 high, base
// radius 1), the nacelle (for a rotor of NACELLE_ROTOR_M, base at the hub axis) and the rotor (diameter 1, turning around y).

const WHITE = new THREE.Color(0xe4e7ea);
const GREY = new THREE.Color(0xc3c9d0);
/** the red marking of the blade tips */
const RED = new THREE.Color(0xc8402f);

/** the rotor diameter the nacelle is modelled for */
export const NACELLE_ROTOR_M = 100;
/** distance of the rotor plane in front of the tower axis, in the nacelle's metres */
export const ROTOR_Y = 5.8;
/** height of the tower top below the hub axis, in the nacelle's metres */
export const NACELLE_DROP = 2;

/** typical machines: [rated MW, rotor diameter m, hub height m] */
const TYPICAL: [number, number, number][] = [
  [0.01, 6, 12], [0.1, 20, 28], [0.5, 40, 50], [0.85, 52, 62], [1.5, 74, 80], [2, 85, 90],
  [3, 108, 110], [4.2, 132, 125], [5.5, 150, 135], [8, 168, 130], [11, 200, 135], [15, 236, 150],
];
/** an untagged turbine */
const DEFAULT_MW = 2;

/** Hub height and rotor diameter (m) of a turbine with this rated power: the map data has only the power. */
export function turbineSize(outputMw?: number): { hubM: number; rotorM: number } {
  const mw = Math.min(TYPICAL[TYPICAL.length - 1]![0], Math.max(TYPICAL[0]![0], outputMw ?? DEFAULT_MW));
  const i = Math.max(1, TYPICAL.findIndex((t) => t[0] >= mw));
  const [a, b] = [TYPICAL[i - 1]!, TYPICAL[i]!];
  const k = (mw - a[0]) / (b[0] - a[0]);
  return { rotorM: a[1] + (b[1] - a[1]) * k, hubM: a[2] + (b[2] - a[2]) * k };
}

export function towerGeometry(): THREE.BufferGeometry {
  const m = new Mesh();
  m.prism([0, 0, 0], [0, 0, 1], 1, 0.6, 14, WHITE, true);
  return m.build();
}

export function nacelleGeometry(): THREE.BufferGeometry {
  const m = new Mesh();
  // the housing: widest in the middle, closed at the back
  m.prism([0, -3, 0], [0, 4.4, 0], 2.7, 2.4, 10, WHITE, true);
  m.prism([0, -3, 0], [0, -8.5, 0], 2.7, 1.7, 10, WHITE, true);
  // the spinner in front of the blades
  m.prism([0, 4.4, 0], [0, 6.8, 0], 2, 1.9, 10, GREY);
  m.prism([0, 6.8, 0], [0, 9.4, 0], 1.9, 0.35, 10, GREY, true);
  return m.build();
}

/** Blade sections from the hub to the tip: [share of the radius, chord, thickness (both as share of the radius), twist °]. */
const BLADE: [number, number, number, number][] = [
  [0.02, 0.045, 0.04, 24], [0.09, 0.05, 0.034, 22], [0.22, 0.086, 0.019, 15], [0.4, 0.068, 0.013, 9],
  [0.62, 0.048, 0.009, 4], [0.86, 0.029, 0.005, 1], [0.96, 0.018, 0.003, 0], [1, 0.004, 0.001, 0],
];
/** the tips are red from this share of the radius on */
const RED_FROM = 0.86;

export function rotorGeometry(): THREE.BufferGeometry {
  const m = new Mesh();
  const R = 0.5;
  for (let blade = 0; blade < 3; blade++) {
    const turn = (blade * Math.PI * 2) / 3;
    const [s, c] = [Math.sin(turn), Math.cos(turn)];
    /** the four corners of a section (leading edge, front, trailing edge, back), turned to this blade */
    const section = ([share, chord, thick, twist]: [number, number, number, number]): V[] => {
      const [ts, tc] = [Math.sin((twist * Math.PI) / 180), Math.cos((twist * Math.PI) / 180)];
      const flat: [number, number][] = [[chord * 0.32, 0], [0, thick / 2], [-chord * 0.68, 0], [0, -thick / 2]];
      return flat.map(([x, y]) => {
        const [px, py, pz] = [(x * tc - y * ts) * R, (x * ts + y * tc) * R, share * R];
        // turned around the rotor axis (y)
        return [px * c + pz * s, py, pz * c - px * s];
      });
    };
    for (let k = 1; k < BLADE.length; k++) {
      const [a, b] = [section(BLADE[k - 1]!), section(BLADE[k]!)];
      const colour = BLADE[k - 1]![0] >= RED_FROM ? RED : WHITE;
      for (let i = 0; i < 4; i++) m.quad(a[i]!, a[(i + 1) % 4]!, b[(i + 1) % 4]!, b[i]!, colour);
    }
  }
  return m.build();
}

export function turbineMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
}
