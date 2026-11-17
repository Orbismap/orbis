import { Color } from 'three';
import type { Tags } from './roofs';

// Colours of walls and roofs from the OSM tags: an explicit colour (`building:colour`, `colour`, `roof:colour`) wins, then the
// material, then a neutral default. Values are '#rrggbb' numbers (sRGB), the way three.js takes them.

const NAMES = Color.NAMES as Record<string, number>;

/** '#abc', '#aabbcc' or a CSS colour name ("light_grey" and "light grey" included) → 0xrrggbb. */
export function parseColour(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const s = v.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const hex = /^#([0-9a-f]{6})$/.exec(s);
  if (hex) return parseInt(hex[1]!, 16);
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (short) return parseInt(short[1]! + short[1]! + short[2]! + short[2]! + short[3]! + short[3]!, 16);
  return NAMES[s];
}

const WALL_MATERIAL: Record<string, number> = {
  brick: 0xb5614a, concrete: 0xb9b6b0, cement_block: 0xb9b6b0, stone: 0xbdb2a0, sandstone: 0xc9b48a, limestone: 0xd2c8b0, granite: 0x9a9a9a,
  wood: 0xa9835a, timber_framing: 0xcdbb98, glass: 0x9fc3d6, metal: 0x9aa4ae, steel: 0x9aa4ae, plaster: 0xe2dccd, stucco: 0xe2dccd, render: 0xe2dccd,
  plastic: 0xd8d8d8, tin: 0x9aa4ae, mud: 0xb09372, adobe: 0xb09372, clay: 0xb5714a,
};
const ROOF_MATERIAL: Record<string, number> = {
  roof_tiles: 0xa5523b, tile: 0xa5523b, tiles: 0xa5523b, clay_tiles: 0xa5523b, slate: 0x4b5159, metal: 0x8d98a3, metal_sheet: 0x8d98a3, copper: 0x6fa58f,
  zinc: 0x8a96a0, tar_paper: 0x62646a, concrete: 0x8f8f8f, gravel: 0x8a8782, thatch: 0xa89462, glass: 0x9fc3d6, grass: 0x6d9a58, eternit: 0x7d7f84,
  asphalt: 0x4f5156, stone: 0x8e8a82, wood: 0x8c6a45, plants: 0x6d9a58, solar_panels: 0x2f3d58,
};
const FIRST = (v: string | undefined) => (v ?? '').split(';')[0]!.trim().toLowerCase();

const DEFAULT_WALL = 0xd8d2c8;
const DEFAULT_PART = 0xc5beb2;
const DEFAULT_ROOF_FLAT = 0x8b8d92;
const DEFAULT_ROOF_PITCHED = 0xa0624e;

export function wallColour(tags: Tags): number {
  return parseColour(tags['building:colour'] ?? tags.colour) ?? WALL_MATERIAL[FIRST(tags['building:material'] ?? tags.material)] ?? (tags['building:part'] !== undefined && tags.building === undefined ? DEFAULT_PART : DEFAULT_WALL);
}

/** The roof: its own colour, else its material, else red-brown for pitched and grey for flat roofs. */
export function roofColour(tags: Tags, pitched: boolean): number {
  return parseColour(tags['roof:colour']) ?? ROOF_MATERIAL[FIRST(tags['roof:material'])] ?? (pitched ? DEFAULT_ROOF_PITCHED : DEFAULT_ROOF_FLAT);
}
