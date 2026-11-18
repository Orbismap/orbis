// Basemaps of providers that need the user's own key (Settings → Boost). The tiles are requested through the `orbis-tiles://<id>/z/x/y`
// protocol (see keyed-protocol.ts), which adds the key at request time: it is never part of the style, a URL or a shared link.
import type { BasemapId } from '../types';
import type { BasemapDef } from './types';
import { rasterDef } from './raster';

export interface KeyedProvider {
  /** = id of the key definition in src/keys/defs and the name in `settings.keys` */
  key: string;
  title: string;
  /** link in the credit line */
  home: string;
  /** tile URL with {z} {x} {y} and {key} */
  url: (style: string) => string;
  attribution: string;
}

const a = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
const OSM = `© ${a('https://www.openstreetmap.org/copyright', 'OpenStreetMap')}-Mitwirkende`;

export const KEYED_PROVIDERS = {
  thunderforest: {
    key: 'thunderforest', title: 'Thunderforest', home: 'https://www.thunderforest.com/',
    url: (s) => `https://tile.thunderforest.com/${s}/{z}/{x}/{y}.png?apikey={key}`,
    attribution: `Karte: © ${a('https://www.thunderforest.com/', 'Thunderforest')}, Daten: ${OSM}`,
  },
  maptiler: {
    key: 'maptiler', title: 'MapTiler', home: 'https://www.maptiler.com/copyright/',
    url: (s) => (s === 'satellite' ? 'https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key={key}' : s === 'hybrid' ? 'https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}.jpg?key={key}' : `https://api.maptiler.com/maps/${s}/256/{z}/{x}/{y}.png?key={key}`),
    attribution: `© ${a('https://www.maptiler.com/copyright/', 'MapTiler')} ${OSM}`,
  },
  stadia: {
    key: 'stadia', title: 'Stadia Maps', home: 'https://stadiamaps.com/attribution/',
    url: (s) => `https://tiles.stadiamaps.com/tiles/${s}/{z}/{x}/{y}.${s === 'alidade_satellite' || s === 'stamen_watercolor' ? 'jpg' : 'png'}?api_key={key}`,
    attribution: `© ${a('https://stadiamaps.com/attribution/', 'Stadia Maps')} © ${a('https://openmaptiles.org/', 'OpenMapTiles')} ${OSM}`,
  },
  jawg: {
    key: 'jawg', title: 'Jawg Maps', home: 'https://www.jawg.io/',
    url: (s) => `https://tile.jawg.io/${s}/{z}/{x}/{y}.png?access-token={key}`,
    attribution: `© ${a('https://www.jawg.io/', 'Jawg Maps')} ${OSM}`,
  },
  mapbox: {
    key: 'mapbox', title: 'Mapbox', home: 'https://www.mapbox.com/about/maps/',
    url: (s) => `https://api.mapbox.com/styles/v1/mapbox/${s}/tiles/256/{z}/{x}/{y}?access_token={key}`,
    attribution: `© ${a('https://www.mapbox.com/about/maps/', 'Mapbox')} ${OSM}`,
  },
  tomtom: {
    key: 'tomtom', title: 'TomTom', home: 'https://www.tomtom.com/',
    url: (s) => `https://api.tomtom.com/map/1/tile/basic/${s}/{z}/{x}/{y}.png?key={key}`,
    attribution: `© ${a('https://www.tomtom.com/', 'TomTom')}`,
  },
  here: {
    key: 'here', title: 'HERE', home: 'https://www.here.com/',
    url: (s) => {
      const [layer, style] = s.split('/');
      return `https://maps.hereapi.com/v3/${layer}/mc/{z}/{x}/{y}/png8?style=${style}&apiKey={key}`;
    },
    attribution: `© ${a('https://www.here.com/', 'HERE')}`,
  },
} as const satisfies Record<string, KeyedProvider>;

type ProviderId = keyof typeof KEYED_PROVIDERS;
interface Entry { id: string; provider: ProviderId; style: string; label: string; maxzoom: number; dark?: boolean; credit?: string }

/** Every keyed basemap. The id is URL-safe (a-z, 0-9, -, at most 32 characters); the style is what the provider's URL needs. */
export const KEYED_ENTRIES = [
  { id: 'tf-landscape', provider: 'thunderforest', style: 'landscape', label: 'Landscape', maxzoom: 22 },
  { id: 'tf-outdoors', provider: 'thunderforest', style: 'outdoors', label: 'Outdoors', maxzoom: 22 },
  { id: 'tf-cycle', provider: 'thunderforest', style: 'cycle', label: 'OpenCycleMap', maxzoom: 22 },
  { id: 'tf-transport', provider: 'thunderforest', style: 'transport', label: 'Verkehr', maxzoom: 22 },
  { id: 'tf-transport-dark', provider: 'thunderforest', style: 'transport-dark', label: 'Verkehr dunkel', maxzoom: 22, dark: true },
  { id: 'tf-pioneer', provider: 'thunderforest', style: 'pioneer', label: 'Pioneer', maxzoom: 22 },
  { id: 'tf-neighbourhood', provider: 'thunderforest', style: 'neighbourhood', label: 'Neighbourhood', maxzoom: 22 },
  { id: 'tf-atlas', provider: 'thunderforest', style: 'mobile-atlas', label: 'Mobile Atlas', maxzoom: 22 },
  { id: 'tf-spinal', provider: 'thunderforest', style: 'spinal-map', label: 'Spinal Map', maxzoom: 22, dark: true },
  { id: 'mt-streets', provider: 'maptiler', style: 'streets-v2', label: 'Straßen', maxzoom: 22 },
  { id: 'mt-outdoor', provider: 'maptiler', style: 'outdoor-v2', label: 'Outdoor', maxzoom: 22 },
  { id: 'mt-topo', provider: 'maptiler', style: 'topo-v2', label: 'Topografie', maxzoom: 22 },
  { id: 'mt-winter', provider: 'maptiler', style: 'winter-v2', label: 'Winter', maxzoom: 22 },
  { id: 'mt-ocean', provider: 'maptiler', style: 'ocean', label: 'Ozean', maxzoom: 22 },
  { id: 'mt-dataviz', provider: 'maptiler', style: 'dataviz', label: 'Datenvisualisierung', maxzoom: 22 },
  { id: 'mt-dataviz-dark', provider: 'maptiler', style: 'dataviz-dark', label: 'Datenvis. dunkel', maxzoom: 22, dark: true },
  { id: 'mt-satellite', provider: 'maptiler', style: 'satellite', label: 'Satellit', maxzoom: 20, dark: true, credit: 'Bilder: MapTiler, Maxar' },
  { id: 'mt-hybrid', provider: 'maptiler', style: 'hybrid', label: 'Hybrid', maxzoom: 20, dark: true },
  { id: 'st-smooth', provider: 'stadia', style: 'alidade_smooth', label: 'Alidade Smooth', maxzoom: 20 },
  { id: 'st-smooth-dark', provider: 'stadia', style: 'alidade_smooth_dark', label: 'Alidade dunkel', maxzoom: 20, dark: true },
  { id: 'st-satellite', provider: 'stadia', style: 'alidade_satellite', label: 'Alidade Satellit', maxzoom: 20, dark: true },
  { id: 'st-bright', provider: 'stadia', style: 'osm_bright', label: 'OSM Bright', maxzoom: 20 },
  { id: 'st-outdoors', provider: 'stadia', style: 'outdoors', label: 'Outdoors', maxzoom: 20 },
  { id: 'st-toner', provider: 'stadia', style: 'stamen_toner', label: 'Stamen Toner', maxzoom: 20, credit: '© Stamen Design' },
  { id: 'st-toner-lite', provider: 'stadia', style: 'stamen_toner_lite', label: 'Stamen Toner Lite', maxzoom: 20, credit: '© Stamen Design' },
  { id: 'st-terrain', provider: 'stadia', style: 'stamen_terrain', label: 'Stamen Terrain', maxzoom: 18, credit: '© Stamen Design' },
  { id: 'st-watercolor', provider: 'stadia', style: 'stamen_watercolor', label: 'Stamen Watercolor', maxzoom: 16, credit: '© Stamen Design' },
  { id: 'jg-streets', provider: 'jawg', style: 'jawg-streets', label: 'Streets', maxzoom: 22 },
  { id: 'jg-terrain', provider: 'jawg', style: 'jawg-terrain', label: 'Terrain', maxzoom: 22 },
  { id: 'jg-sunny', provider: 'jawg', style: 'jawg-sunny', label: 'Sunny', maxzoom: 22 },
  { id: 'jg-lagoon', provider: 'jawg', style: 'jawg-lagoon', label: 'Lagoon', maxzoom: 22 },
  { id: 'jg-light', provider: 'jawg', style: 'jawg-light', label: 'Light', maxzoom: 22 },
  { id: 'jg-dark', provider: 'jawg', style: 'jawg-dark', label: 'Dark', maxzoom: 22, dark: true },
  { id: 'mb-streets', provider: 'mapbox', style: 'streets-v12', label: 'Streets', maxzoom: 22 },
  { id: 'mb-outdoors', provider: 'mapbox', style: 'outdoors-v12', label: 'Outdoors', maxzoom: 22 },
  { id: 'mb-light', provider: 'mapbox', style: 'light-v11', label: 'Light', maxzoom: 22 },
  { id: 'mb-dark', provider: 'mapbox', style: 'dark-v11', label: 'Dark', maxzoom: 22, dark: true },
  { id: 'mb-satellite', provider: 'mapbox', style: 'satellite-v9', label: 'Satellit', maxzoom: 22, dark: true, credit: 'Bilder: Mapbox, Maxar' },
  { id: 'mb-hybrid', provider: 'mapbox', style: 'satellite-streets-v12', label: 'Satellit mit Straßen', maxzoom: 22, dark: true, credit: 'Bilder: Mapbox, Maxar' },
  { id: 'tt-day', provider: 'tomtom', style: 'main', label: 'Tag', maxzoom: 22 },
  { id: 'tt-night', provider: 'tomtom', style: 'night', label: 'Nacht', maxzoom: 22, dark: true },
  { id: 'here-day', provider: 'here', style: 'base/explore.day', label: 'Explore Tag', maxzoom: 20 },
  { id: 'here-night', provider: 'here', style: 'base/explore.night', label: 'Explore Nacht', maxzoom: 20, dark: true },
  { id: 'here-satellite', provider: 'here', style: 'background/satellite.day', label: 'Satellit', maxzoom: 20, dark: true },
  { id: 'here-hybrid', provider: 'here', style: 'base/explore.satellite.day', label: 'Satellit mit Straßen', maxzoom: 20, dark: true },
] as const satisfies readonly Entry[];

export type KeyedBasemapId = (typeof KEYED_ENTRIES)[number]['id'];

export const KEYED_PROTOCOL = 'orbis-tiles';
const BY_ID = new Map<string, Entry>(KEYED_ENTRIES.map((e) => [e.id, e]));

/** The real tile URL of a keyed basemap tile ({key} still in it), or undefined for an unknown id. */
export function keyedTileUrl(id: string): { url: string; key: string } | undefined {
  const e = BY_ID.get(id);
  return e && { url: KEYED_PROVIDERS[e.provider].url(e.style), key: KEYED_PROVIDERS[e.provider].key };
}

/** Basemap ids by provider, in picker order. */
export function keyedGroups(): { provider: KeyedProvider; ids: KeyedBasemapId[] }[] {
  const out = new Map<string, { provider: KeyedProvider; ids: KeyedBasemapId[] }>();
  for (const e of KEYED_ENTRIES) {
    const g = out.get(e.provider) ?? { provider: KEYED_PROVIDERS[e.provider] as KeyedProvider, ids: [] };
    g.ids.push(e.id);
    out.set(e.provider, g);
  }
  return [...out.values()];
}

export const keyedDef = (e: Entry): BasemapDef => {
  const p = KEYED_PROVIDERS[e.provider];
  return rasterDef(e.id as BasemapId, `${p.title} ${e.label}`, {
    type: 'raster',
    tiles: [`${KEYED_PROTOCOL}://${e.id}/{z}/{x}/{y}`],
    tileSize: 256,
    maxzoom: e.maxzoom,
    attribution: e.credit ? `${e.credit} | ${p.attribution}` : p.attribution,
  }, { light: !e.dark });
};

export const keyedBasemaps = (): Record<string, BasemapDef> => Object.fromEntries(KEYED_ENTRIES.map((e) => [e.id, keyedDef(e)]));
