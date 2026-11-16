// The power tower designs as data: dimensions in metres (x across the line, y along it, z up, base at z = 0) and where
// the conductors hang. models.ts builds the geometry from these numbers and network.ts attaches the wires to the same
// points, so a wire always ends exactly at an insulator of the model that is drawn. Pure, no three.js.

export type DesignId = 'donau' | 'tannen' | 'tonne' | 'portal' | 'tubular3' | 'tubular1' | 'concrete' | 'wood' | 'woodH';

/** A crossarm (both sides unless `sides` says otherwise). */
export interface ArmSpec {
  /** height of the arm (m) */
  z: number;
  /** distance from the axis to the tip (m) */
  reach: number;
  style: 'truss' | 'tube' | 'beam';
  /** conductor points as shares of `reach` (mirrored to both sides) */
  points: number[];
  sides?: 'both' | 'left' | 'right';
  /** one more conductor at x = 0 (between the legs of a portal) */
  center?: boolean;
  /** x where the arm starts at the body (default: the body's half width at that height) */
  root?: number;
  /** length of the hanging insulator string (m); with `pin` the insulator stands on the arm instead */
  hang: number;
  pin?: boolean;
}

export type BodySpec =
  | { kind: 'lattice'; /** [share of `top`, half width m] */ profile: [number, number][]; top: number }
  | { kind: 'tube'; r0: number; r1: number; top: number; sides: number; material: 'steel' | 'concrete' | 'wood' }
  | { kind: 'portal'; legX: number; profile: [number, number][]; top: number }
  | { kind: 'twin'; legX: number; r0: number; r1: number; top: number };

export interface DesignSpec {
  id: DesignId;
  /** total height the model is built at (m); a tower with another height is scaled uniformly */
  h: number;
  /** systems the arms carry */
  circuits: 1 | 2;
  body: BodySpec;
  arms: ArmSpec[];
  /** a conductor on top of the pole (wooden, concrete and small steel poles) */
  topPin?: boolean;
  /** earth wire points [x, z] */
  earth: [number, number][];
}

/** A place where a wire is attached, in model metres. */
export interface Slot {
  x: number;
  z: number;
  /** system 0 (x < 0) or 1; single-system designs only have 0 */
  circuit: number;
  earth: boolean;
}

export const DESIGNS: Record<DesignId, DesignSpec> = {
  // two crossarms, the lower one longer: the typical 380 / 220 kV pylon of Central Europe
  donau: {
    id: 'donau', h: 52, circuits: 2,
    body: { kind: 'lattice', profile: [[0, 3.6], [0.55, 1.7], [0.8, 1.4], [1, 0.9]], top: 0.96 * 52 },
    arms: [
      { z: 0.64 * 52, reach: 11, style: 'truss', points: [1, 0.52], hang: 3.4 },
      { z: 0.8 * 52, reach: 8.4, style: 'truss', points: [1], hang: 3.4 },
    ],
    earth: [[0, 52]],
  },
  // three crossarms, shortening upwards: the fir tree
  tannen: {
    id: 'tannen', h: 58, circuits: 2,
    body: { kind: 'lattice', profile: [[0, 4], [0.5, 1.5], [1, 0.8]], top: 0.955 * 58 },
    arms: [
      { z: 0.58 * 58, reach: 11, style: 'truss', points: [1], hang: 3.4 },
      { z: 0.72 * 58, reach: 8.5, style: 'truss', points: [1], hang: 3.4 },
      { z: 0.86 * 58, reach: 6, style: 'truss', points: [1], hang: 3.4 },
    ],
    earth: [[0, 58]],
  },
  // one system, two crossarms, a barrel-shaped head
  tonne: {
    id: 'tonne', h: 44, circuits: 1,
    body: { kind: 'lattice', profile: [[0, 3.2], [0.5, 1.2], [0.78, 1.9], [0.9, 1.9], [1, 0.9]], top: 0.95 * 44 },
    arms: [
      { z: 0.62 * 44, reach: 8, style: 'truss', points: [1], hang: 3 },
      { z: 0.8 * 44, reach: 5, style: 'truss', points: [1], sides: 'right', hang: 3 },
    ],
    earth: [[0, 44]],
  },
  // one level: two legs and a beam, three wires side by side
  portal: {
    id: 'portal', h: 34, circuits: 1,
    body: { kind: 'portal', legX: 5, profile: [[0, 1], [1, 0.55]], top: 0.94 * 34 },
    arms: [{ z: 0.86 * 34, reach: 7.6, style: 'truss', points: [1], center: true, root: 5, hang: 2.4 }],
    earth: [[-5, 34], [5, 34]],
  },
  // steel tube with three crossarms: two systems of a 60 to 110 kV line
  tubular3: {
    id: 'tubular3', h: 30, circuits: 2,
    body: { kind: 'tube', r0: 0.62, r1: 0.3, top: 0.97 * 30, sides: 10, material: 'steel' },
    arms: [
      { z: 0.55 * 30, reach: 6, style: 'tube', points: [1], hang: 1.8 },
      { z: 0.72 * 30, reach: 4.8, style: 'tube', points: [1], hang: 1.8 },
      { z: 0.89 * 30, reach: 3.6, style: 'tube', points: [1], hang: 1.8 },
    ],
    earth: [[0, 30]],
  },
  // small steel tube: three pins, medium voltage
  tubular1: {
    id: 'tubular1', h: 20, circuits: 1,
    body: { kind: 'tube', r0: 0.4, r1: 0.22, top: 20, sides: 8, material: 'steel' },
    arms: [{ z: 0.88 * 20, reach: 2.6, style: 'tube', points: [1], hang: 0, pin: true }],
    topPin: true,
    earth: [],
  },
  concrete: {
    id: 'concrete', h: 13, circuits: 1,
    body: { kind: 'tube', r0: 0.27, r1: 0.17, top: 13, sides: 8, material: 'concrete' },
    arms: [{ z: 0.88 * 13, reach: 1.9, style: 'beam', points: [1], hang: 0, pin: true }],
    topPin: true,
    earth: [],
  },
  wood: {
    id: 'wood', h: 11, circuits: 1,
    body: { kind: 'tube', r0: 0.17, r1: 0.11, top: 11, sides: 7, material: 'wood' },
    arms: [{ z: 0.88 * 11, reach: 1.2, style: 'beam', points: [1], hang: 0, pin: true }],
    topPin: true,
    earth: [],
  },
  // two wooden poles with a crossbeam: 60 / 110 kV
  woodH: {
    id: 'woodH', h: 15, circuits: 1,
    body: { kind: 'twin', legX: 2.1, r0: 0.2, r1: 0.15, top: 15 },
    arms: [{ z: 0.9 * 15, reach: 3.4, style: 'beam', points: [1], center: true, root: 2.1, hang: 1.1 }],
    earth: [],
  },
};

const PIN_M = 0.5;

/** Where wires are attached to a design: insulator ends (or pin tops), then the earth wire points. */
export function slotsOf(spec: DesignSpec): Slot[] {
  const out: Slot[] = [];
  const circuitOf = (side: number) => (spec.circuits === 2 && side > 0 ? 1 : 0);
  for (const arm of spec.arms) {
    const z = arm.pin ? arm.z + PIN_M : arm.z - arm.hang;
    for (const side of [-1, 1]) {
      if ((arm.sides === 'left' && side > 0) || (arm.sides === 'right' && side < 0)) continue;
      for (const share of arm.points) out.push({ x: side * arm.reach * share, z, circuit: circuitOf(side), earth: false });
    }
    if (arm.center) out.push({ x: 0, z, circuit: 0, earth: false });
  }
  if (spec.topPin) out.push({ x: 0, z: spec.h + PIN_M, circuit: 0, earth: false });
  for (const [x, z] of spec.earth) out.push({ x, z, circuit: 0, earth: true });
  return out;
}

export const SLOTS: Record<DesignId, Slot[]> = Object.fromEntries(Object.values(DESIGNS).map((d) => [d.id, slotsOf(d)])) as Record<DesignId, Slot[]>;

/** Half width of a lattice profile at height `z` (m). */
export function profileWidth(profile: [number, number][], top: number, z: number): number {
  const s = Math.max(0, Math.min(1, z / top));
  for (let i = 1; i < profile.length; i++) {
    const [s0, w0] = profile[i - 1]!;
    const [s1, w1] = profile[i]!;
    if (s <= s1) return w0 + ((w1 - w0) * (s - s0)) / Math.max(1e-9, s1 - s0);
  }
  return profile[profile.length - 1]![1];
}
