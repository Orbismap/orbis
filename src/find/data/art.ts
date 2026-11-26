// The big pictures of the catalogue: flat drawings on a 160 x 120 grid, white on the tile colour with one dark and one
// yellow accent. Inner SVG markup of static strings written here (never from outside).

/** dark detail on white areas */
export const INK = '#14213a';
export const SUN = '#ffd166';

const line = (d: string, width = 7, colour = '#fff') => `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ring = (cx: number, cy: number, r: number, width = 7, colour = '#fff') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colour}" stroke-width="${width}"/>`;
const dot = (cx: number, cy: number, r: number, colour = '#fff') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colour}"/>`;
const box = (x: number, y: number, w: number, h: number, r = 4, colour = '#fff') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${colour}"/>`;
const shape = (d: string, colour = '#fff') => `<path d="${d}" fill="${colour}"/>`;

/** a bicycle with its rear hub at (x, y) */
const bike = (x: number, y: number) =>
  ring(x, y, 22) + ring(x + 64, y, 22)
  + line(`M${x} ${y}l19-34h31l14 34M${x + 19} ${y - 34}l13 34 18-34M${x} ${y}h32`, 6)
  + line(`M${x + 12} ${y - 42}h15M${x + 50} ${y - 34}l-4-13h11`, 6);

export const ART = {
  // two hoops behind a parked bicycle
  stand: line('M30 108V52a14 14 0 0 1 28 0v56M102 108V52a14 14 0 0 1 28 0v56', 8, SUN) + bike(48, 84) + line('M14 110h132', 6),
  // a bicycle and the key that unlocks it
  rental: bike(30, 86) + dot(122, 30, 22, SUN) + ring(114, 30, 7, 5, INK) + line('M121 30h16M131 30v8M137 30v6', 5, INK),
  // floor pump and spanner
  repair: line('M52 30v22', 7) + line('M34 28h36', 9) + box(39, 50, 26, 52, 6) + line('M28 106h48', 9) + line('M65 90c26 0 6-54 30-54', 5, SUN)
    + `<g transform="rotate(35 118 66)">${line('M118 58v46', 13)}${line('M110 27a17 17 0 1 0 16 0', 11)}</g>`,
  // the two figures every toilet sign shows
  toilet: dot(44, 24, 11) + box(31, 38, 26, 40, 9) + line('M38 76v28M50 76v28', 9) + line('M80 14v94', 5, SUN)
    + dot(116, 24, 11) + shape('M106 38h20l16 44H90z') + line('M110 82v22M122 82v22', 9),
  // tap, drop and glass
  water: box(18, 34, 16, 38, 3) + line('M34 52h40a18 18 0 0 1 18 18v4', 14) + line('M56 44V28M42 26h28', 8)
    + shape('M92 82c7 10 10 14 10 19a10 10 0 0 1-20 0c0-5 3-9 10-19z', SUN) + line('M114 62l6 46h24l6-46', 6) + shape('M118 82h28l-3 23h-22z'),
  // banknote coming out of the machine
  cash: box(30, 14, 100, 66, 10) + box(42, 25, 76, 30, 5, INK) + line('M58 40h44', 5, SUN) + box(52, 64, 56, 7, 3, INK)
    + box(50, 72, 60, 36, 4, SUN) + ring(80, 90, 9, 5, INK),
  // the pretzel of German bakeries
  bakery: line('M80 100C42 100 20 78 24 52c3-18 18-28 32-22 20 9 33 36 46 60M80 100c38 0 60-22 56-48-3-18-18-28-32-22-20 9-33 36-46 60', 14, SUN)
    + dot(48, 40, 2.5) + dot(114, 40, 2.5) + dot(34, 70, 2.5) + dot(126, 70, 2.5) + dot(80, 100, 2.5),
  // shopping trolley with goods
  supermarket: dot(64, 38, 13, SUN) + box(78, 22, 18, 30, 4, SUN) + dot(110, 40, 11, SUN)
    + shape('M42 44h98l-12 40H55z') + line('M18 22h18l20 74h70', 8) + dot(62, 106, 9) + dot(118, 106, 9),
  // cross and capsule
  pharmacy: shape('M56 16h28v28h28v28H84v28H56V72H28V44h28z')
    + `<g transform="rotate(-40 120 88)">${box(96, 76, 48, 24, 12, SUN)}<path d="M120 76v24" stroke="${INK}" stroke-width="4"/></g>`,
  // a train from the front on its track
  station: box(46, 10, 68, 80, 20) + box(56, 24, 48, 28, 8, INK) + dot(62, 70, 6, SUN) + dot(98, 70, 6, SUN)
    + line('M58 92 38 112M102 92l20 20M50 102h60', 6),
  // a bus and the stop sign
  bus: box(14, 28, 92, 64, 12) + box(23, 38, 22, 22, 4, INK) + box(50, 38, 22, 22, 4, INK) + box(77, 38, 22, 22, 4, INK)
    + dot(36, 94, 11) + dot(84, 94, 11) + dot(36, 94, 4, INK) + dot(84, 94, 4, INK)
    + line('M136 46v64', 7) + dot(136, 32, 18, SUN) + line('M129 23v18M143 23v18M129 32h14', 5, INK),
  // fuel pump with hose
  fuel: box(40, 16, 56, 92, 8) + box(50, 28, 36, 24, 4, INK) + line('M30 110h76', 8) + line('M96 56h12a8 8 0 0 1 8 8v22a9 9 0 0 0 18 0V44l-16-18', 7)
    + shape('M68 64c8 11 12 16 12 22a12 12 0 0 1-24 0c0-6 4-11 12-22z', SUN),
  // charging post with bolt and plug
  charger: box(38, 14, 58, 94, 14) + shape('M72 28 52 66h15l-5 30 24-42H70z', INK) + line('M28 110h78', 8)
    + line('M96 80c24 0 12 22 28 22s14-18 14-34', 7) + box(128, 40, 20, 28, 6, SUN) + line('M133 40V28M143 40V28', 5, SUN),
  // heart with a bolt
  defibrillator: `<g transform="translate(80 61) scale(0.84) translate(-80 -59)">${shape('M80 108C34 80 18 60 18 41a29 29 0 0 1 62-18 29 29 0 0 1 62 18c0 19-16 39-62 67z') + shape('M87 30 58 70h20l-8 28 32-44H81z', '#e5484d')}</g>`,
} as const;

export type ArtId = keyof typeof ART;
