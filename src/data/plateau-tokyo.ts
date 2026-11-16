// Catalogue of the Plateau 3D city models (MLIT, Project PLATEAU): Tokyo's 23 special wards, LOD2 with textures, 3D Tiles 1.0.
// The tilesets come from the Plateau data catalogue (https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets, `composite_url`),
// the boxes from their root regions. Heights in the tiles are ellipsoidal (ground at about 36-44 m in Tokyo).
import type { TilesetSample } from '../ext/types';

export const PLATEAU_ATTRIBUTION = '3D都市モデル Project PLATEAU (国土交通省)';
export const PLATEAU_LICENSE = 'CC BY 4.0 (Nutzungsbedingungen der Regierung Japans 2.0)';

/** [city code, ward, west, south, east, north, size of the whole ward in MB] */
const WARDS: [string, string, number, number, number, number, number][] = [
  ['13101', 'Chiyoda', 139.7312, 35.6697, 139.7827, 35.7051, 220],
  ['13102', 'Chūō', 139.7543, 35.646, 139.7928, 35.6966, 345],
  ['13103', 'Minato', 139.7087, 35.6231, 139.7824, 35.6828, 364],
  ['13104', 'Shinjuku', 139.6735, 35.6734, 139.7459, 35.7295, 174],
  ['13105', 'Bunkyō', 139.7175, 35.6997, 139.7724, 35.7358, 24],
  ['13106', 'Taitō', 139.7632, 35.6947, 139.8097, 35.7312, 361],
  ['13107', 'Sumida', 139.7889, 35.687, 139.8422, 35.7434, 60],
  ['13108', 'Kōtō', 139.7713, 35.5922, 139.8477, 35.708, 180],
  ['13109', 'Shinagawa', 139.6955, 35.5849, 139.7731, 35.6417, 113],
  ['13110', 'Meguro', 139.6615, 35.6006, 139.7176, 35.6639, 42],
  ['13111', 'Ōta', 139.653, 35.5282, 139.826, 35.6131, 133],
  ['13112', 'Setagaya', 139.5825, 35.5901, 139.6864, 35.6827, 146],
  ['13113', 'Shibuya', 139.6616, 35.6417, 139.7236, 35.692, 143],
  ['13114', 'Nakano', 139.6243, 35.6763, 139.6943, 35.7353, 55],
  ['13115', 'Suginami', 139.5858, 35.6666, 139.6678, 35.7301, 105],
  ['13116', 'Toshima', 139.6773, 35.7123, 139.7528, 35.7458, 129],
  ['13117', 'Kita', 139.6895, 35.7316, 139.7711, 35.7989, 77],
  ['13118', 'Arakawa', 139.7498, 35.7246, 139.8147, 35.754, 28],
  ['13119', 'Itabashi', 139.6245, 35.7359, 139.7227, 35.8005, 115],
  ['13120', 'Nerima', 139.5628, 35.7119, 139.6808, 35.7798, 118],
  ['13121', 'Adachi', 139.7357, 35.7386, 139.8583, 35.8175, 158],
  ['13122', 'Katsushika', 139.8135, 35.7109, 139.8943, 35.7972, 117],
  ['13123', 'Edogawa', 139.8332, 35.6327, 139.9189, 35.7508, 136],
]

/** The tiles carry ellipsoidal heights, the map sea level: Tokyo's geoid lies about 37 m below the ellipsoid. */
const TOKYO_GEOID_M = -37;

const url = (code: string) => `https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/${code}-bldg-lod2-texture-2025/tileset.json`;

export const PLATEAU_TOKYO: readonly (TilesetSample & { sizeMb: number })[] = WARDS.map(([code, ward, w, s, e, n, sizeMb]) => ({
  id: `plateau-${code}`,
  name: `Tokio · ${ward}`,
  url: url(code),
  bbox: [w, s, e, n],
  center: [(w + e) / 2, (s + n) / 2],
  attribution: PLATEAU_ATTRIBUTION,
  license: PLATEAU_LICENSE,
  heightOffsetM: TOKYO_GEOID_M,
  sizeMb,
}));
