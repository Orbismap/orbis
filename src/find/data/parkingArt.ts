// Illustrations of the kinds of bicycle parking (`bicycle_parking=*`) for the picture choice of a new stand. Each shows the
// thing as it stands on the street, seen from a little above and to the side: its shape in metres is projected here, so that
// perspective and sizes agree. Yellow is steel one parks at, white is a wheel. Inner SVG markup on the 160 x 120 grid of art.ts;
// everything in it is computed from the numbers below.
import { INK, SUN } from './art';

type Point = [x: number, y: number, z: number];

/** A piece to draw: its corner points (for fitting it into the picture) and its markup once the projection is known. */
interface Piece { points: Point[]; draw(at: (p: Point) => string): string }

/** x to the right, y up, z towards the viewer, who stands `turn` degrees to the right and `rise` degrees above. */
function picture(turn: number, rise: number, pieces: Piece[]): string {
  const a = (turn * Math.PI) / 180, e = (rise * Math.PI) / 180;
  const flat = ([x, y, z]: Point): [number, number] => [
    x * Math.cos(a) - z * Math.sin(a),
    -(y * Math.cos(e) - (x * Math.sin(a) + z * Math.cos(a)) * Math.sin(e)),
  ];
  const all = pieces.flatMap((p) => p.points).map(flat);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const left = Math.min(...xs), top = Math.min(...ys), width = Math.max(...xs) - left, height = Math.max(...ys) - top;
  const scale = Math.min(136 / width, 98 / height);
  const at = (p: Point) => {
    const [x, y] = flat(p);
    return `${(80 + (x - left - width / 2) * scale).toFixed(1)} ${(60 + (y - top - height / 2) * scale).toFixed(1)}`;
  };
  // drawn in the order given: from the back to the front
  return pieces.map((p) => p.draw(at)).join('');
}

const stroke = (d: string, width: number, colour: string) => `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A bent tube through the points, its corners rounded over `bend` metres, with a dark rim that sets it apart from what is behind. */
function tube(points: Point[], width = 5, bend = 0.1, colour = SUN): Piece {
  const toward = (from: Point, to: Point, most: number): Point => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const t = length ? Math.min(0.5, most / length) : 0;
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
  };
  return {
    points,
    draw(at) {
      let d = `M${at(points[0]!)}`;
      for (let i = 1; i < points.length - 1; i++) {
        const corner = points[i]!;
        d += `L${at(toward(corner, points[i - 1]!, bend))}Q${at(corner)} ${at(toward(corner, points[i + 1]!, bend))}`;
      }
      d += `L${at(points[points.length - 1]!)}`;
      return stroke(d, width + 3, INK) + stroke(d, width, colour);
    },
  };
}

function face(points: Point[], fill: string, rim = INK): Piece {
  return { points, draw: (at) => `<path d="M${points.map(at).join('L')}Z" fill="${fill}" stroke="${rim}" stroke-width="2" stroke-linejoin="round"/>` };
}

/** the points of an upright plane: `along` metres in the direction one rides, `up` metres above the ground */
type Plane = (along: number, up: number) => Point;
/** side on to the front, at depth z */
const across = (x: number, z: number): Plane => (along, up) => [x + along, up, z];
/** riding away from the viewer, at x, the rear wheel at depth z */
const inwards = (x: number, z: number): Plane => (along, up) => [x, up, z - along];

const circle = (plane: Plane, along: number, up: number, radius: number): Point[] =>
  Array.from({ length: 37 }, (_, i) => plane(along + Math.cos((i / 36) * Math.PI * 2) * radius, up + Math.sin((i / 36) * Math.PI * 2) * radius));

function wheel(plane: Plane, along: number, up: number, radius: number, width: number, spokes: boolean): Piece {
  const rim = circle(plane, along, up, radius);
  return {
    points: rim,
    draw(at) {
      const round = `M${rim.map(at).join('L')}Z`;
      const inside = spokes ? stroke([0, 3, 6, 9, 12, 15].map((i) => `M${at(rim[i]!)}L${at(rim[i + 18]!)}`).join(''), 1.1, '#fff') : '';
      return inside + stroke(round, width + 2.5, INK) + stroke(round, width, '#fff');
    },
  };
}

/** a whole bicycle, its rear hub above the start of the plane */
function bicycle(plane: Plane, width = 2.6): Piece[] {
  const line = (...points: [along: number, up: number][]) => tube(points.map(([along, up]) => plane(along, up)), width, 0, '#fff');
  return [
    wheel(plane, 0, 0.27, 0.27, width + 0.4, false), wheel(plane, 0.76, 0.27, 0.27, width + 0.4, false),
    line([0, 0.27], [0.22, 0.66], [0.6, 0.66], [0.76, 0.27]),
    line([0, 0.27], [0.34, 0.27], [0.18, 0.76]), line([0.34, 0.27], [0.6, 0.66], [0.55, 0.84], [0.7, 0.84]),
    line([0.1, 0.77], [0.27, 0.77]),
  ];
}

/** the flat base frame of a rack: rails along z at x = a and b, and the two ends */
const frame = (a: number, b: number, half: number): { back: Piece[]; front: Piece[] } => ({
  back: [tube([[b, 0, -half], [a, 0, -half], [a, 0, half]], 4, 0.02)],
  front: [tube([[a, 0, half], [b, 0, half], [b, 0, -half]], 4, 0.02)],
});

function stands(): string {
  const foot = (x: number): Piece => face(Array.from({ length: 24 }, (_, i): Point => [x + Math.cos((i / 24) * Math.PI * 2) * 0.11, 0, Math.sin((i / 24) * Math.PI * 2) * 0.11]), SUN);
  return picture(26, 16, [
    foot(-0.55), foot(0.55),
    tube([[-0.55, 0.45, 0], [0.55, 0.45, 0]], 6),
    tube([[-0.55, 0, 0], [-0.55, 0.9, 0], [0.55, 0.9, 0], [0.55, 0, 0]], 7, 0.2),
  ]);
}

function safeLoops(): string {
  const base = frame(-0.38, 0.36, 0.56);
  const slot = (z: number): Piece[] => {
    const loop = (offset: number) => tube([[-0.38, 0, z + offset], [-0.38, 0.28, z + offset], [-0.24, 0.46, z + offset], [-0.1, 0.4, z + offset], [0.18, 0.1, z + offset], [0.36, 0.05, z + offset]], 3.2, 0.1);
    // the tall hoop one locks the frame to
    return [loop(-0.1), loop(0.04), tube([[0.3, 0, z + 0.16], [0.3, 0.48, z + 0.16], [0.74, 0.98, z + 0.16], [0.62, 1.1, z + 0.16], [0.02, 0.4, z + 0.16], [-0.18, 0, z + 0.16]], 4.5, 0.08)];
  };
  return picture(40, 18, [...base.back, ...slot(-0.42), ...slot(0.26), ...base.front]);
}

function wallLoops(): string {
  const base = frame(-0.3, 0.3, 0.52);
  const arch = (z: number) => tube([[-0.3, 0, z], [-0.3, 0.46, z], [0.3, 0.46, z], [0.3, 0, z]], 4, 0.28);
  // two narrow slots, a wheel stuck in the front one
  return picture(40, 18, [...base.back, arch(-0.36), arch(-0.22), arch(0.17), wheel(across(0.04, 0.25), 0, 0.37, 0.37, 5, true), arch(0.33), ...base.front]);
}

function rack(): string {
  const base = frame(-0.34, 0.32, 0.82);
  const loops = [-0.6, -0.2, 0.2, 0.6].flatMap((z, i) => {
    const up = i % 2 === 0 ? 0.3 : 0; // every other space sits higher, so that handlebars pass each other
    return [-0.06, 0.06].map((offset) => tube([[-0.34, 0, z + offset], [-0.16, 0.34 + up, z + offset], [0.02, 0.34 + up, z + offset], [0.08, 0.08 + up, z + offset], [0.32, 0.06 + up, z + offset], [0.32, 0, z + offset]], 3.2, 0.07));
  });
  return picture(48, 22, [...base.back, ...loops, ...base.front]);
}

const WOOD = '#e9a25f', WOOD_SIDE = '#bd7a3e', LIGHT = '#f4f7fb', SHADED = '#c3ccd9';

/** upright boards on a wall from one corner to the other */
function boards(from: Point, to: Point, count: number, top: (t: number) => number, colour: string): Piece {
  return {
    points: [],
    draw: (at) => stroke(Array.from({ length: count - 1 }, (_, i) => {
      const t = (i + 1) / count, x = from[0] + (to[0] - from[0]) * t, z = from[2] + (to[2] - from[2]) * t;
      return `M${at([x, 0.05, z])}L${at([x, top(t) - 0.05, z])}`;
    }).join(''), 1.4, colour),
  };
}

/** a wooden hut, its sliding door pushed aside, a bicycle inside */
function shed(): string {
  const w = 1.25, d = 0.7, low = 1.38, high = 1.62, over = 0.14, edge = -0.5;
  return picture(24, 15, [
    face([[w, 0, d], [w, 0, -d], [w, high, -d], [w, low, d]], WOOD_SIDE),
    boards([w, 0, d], [w, 0, -d], 6, (t) => low + (high - low) * t, '#8a5524'),
    face([[-w, 0, d], [w, 0, d], [w, low, d], [-w, low, d]], WOOD),
    face([[edge, 0.04, d], [w - 0.12, 0.04, d], [w - 0.12, low - 0.1, d], [edge, low - 0.1, d]], INK),
    ...bicycle(across(-0.17, d), 3.4),
    // the door
    face([[-w, 0, d], [edge, 0, d], [edge, low - 0.06, d], [-w, low - 0.06, d]], WOOD),
    boards([-w, 0, d], [edge, 0, d], 5, () => low - 0.06, WOOD_SIDE),
    tube([[edge - 0.14, 0.55, d], [edge - 0.14, 0.82, d]], 3, 0, '#fff'),
    // the roof, a little wider than the hut
    face([[w + over, low, d + over], [w + over, high + 0.02, -d - over], [w + over, high + 0.18, -d - over], [w + over, low + 0.16, d + over]], SHADED),
    face([[-w - over, low, d + over], [w + over, low, d + over], [w + over, low + 0.16, d + over], [-w - over, low + 0.16, d + over]], SHADED),
    face([[-w - over, low + 0.16, d + over], [w + over, low + 0.16, d + over], [w + over, high + 0.18, -d - over], [-w - over, high + 0.18, -d - over]], LIGHT),
  ]);
}

/** a rounded surface made of strips: outlined as a whole, without lines between them */
function curved(strips: Point[][], fill: string): Piece {
  return {
    points: strips.flat(),
    draw(at) {
      const paths = strips.map((s) => `M${s.map(at).join('L')}Z`);
      return stroke(paths.join(''), 4, INK) + paths.map((d) => `<path d="${d}" fill="${fill}" stroke="${fill}" stroke-width="0.6" stroke-linejoin="round"/>`).join('');
    },
  };
}

/** the long boxes with a rounded top as they stand at stations, a bicycle half way into one */
function lockers(): string {
  const w = 0.72, h = 0.98, rise = 0.28, d = 1.5, gap = 0.05;
  /** the outline of an end of a box: up, over the arch and down */
  const end = (x: number, z: number, inset = 0): Point[] => [
    [x + inset, inset, z],
    ...Array.from({ length: 13 }, (_, i): Point => [x + w / 2 - Math.cos((i / 12) * Math.PI) * (w / 2 - inset), h + Math.sin((i / 12) * Math.PI) * (rise - inset), z]),
    [x + w - inset, inset, z],
  ];
  const box = (x: number, open: boolean): Piece[] => {
    const front = end(x, 0), back = end(x, -d);
    return [
      face([[x + w, 0, 0], [x + w, 0, -d], [x + w, h, -d], [x + w, h, 0]], SHADED),
      curved(front.slice(1, -2).map((point, i) => [point, front[i + 2]!, back[i + 2]!, back[i + 1]!]), LIGHT),
      face(front, '#fff'),
      ...(open
        ? [face(end(x, 0, 0.07), INK)]
        : [face(end(x, 0, 0.09), '#fff'), tube([[x + w - 0.2, 0.52, 0], [x + w - 0.2, 0.76, 0]], 3.5, 0, SUN)]),
    ];
  };
  const x = (i: number) => i * (w + gap);
  // the open door, swung out to the left
  const door = end(0, 0, 0.04).map(([px, py]): Point => [px * 0.28 - 0.02, py, (px / w) * 0.9]);
  return picture(46, 17, [
    ...box(x(0), true), ...box(x(1), false), ...box(x(2), false),
    face(door.map(([px, py, pz]): Point => [px - 0.02, py, pz * 0.55]), SHADED),
    ...bicycle(inwards(w * 0.55, 0.98), 2.4),
  ]);
}

/** the tile colour of bicycle parking */
export const PARKING_TILE = '#1d6fd8';

export const PARKING_ART: Record<string, string> = {
  stands: stands(),
  safe_loops: safeLoops(),
  wall_loops: wallLoops(),
  rack: rack(),
  shed: shed(),
  lockers: lockers(),
};
