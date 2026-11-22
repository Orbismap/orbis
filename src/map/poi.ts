// Points of interest from the OpenFreeMap tiles (OpenMapTiles layer `poi`, source `ofm`): one symbol layer with an icon per group
// (map/poi.ts is the single place that knows groups, colours, icons and importance). Like Google Maps, what shows depends on the zoom:
// stations, airports, hospitals and big sights first, restaurants and shops later, benches and bus stops last. Whatever is left
// competes for room by importance (symbol-sort-key), so a station always wins against the café next to it.
import type { ExpressionSpecification as Ex, FilterSpecification, LayerSpecification } from 'maplibre-gl';
import { signal } from '@preact/signals';
import { multiValues } from '../layers/multi';

export interface PoiGroup { id: string; label: string; color: string; icon: string; classes: string[] }

export const POI_GROUPS: PoiGroup[] = [
  { id: 'essen', label: 'Essen und Trinken', color: '#FF9A3D', icon: 'poi-essen', classes: ['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'ice_cream', 'bakery', 'food_court', 'biergarten', 'butcher', 'confectionery'] },
  { id: 'einkaufen', label: 'Einkaufen', color: '#FFC83D', icon: 'poi-einkaufen', classes: ['shop', 'grocery', 'supermarket', 'clothing_store', 'department_store', 'mall', 'convenience', 'furniture', 'electronics', 'jewelry', 'florist', 'hairdresser', 'beauty', 'marketplace', 'bookstore', 'books', 'bicycle', 'sports'] },
  { id: 'kultur', label: 'Sehenswürdigkeiten und Kultur', color: '#B48CFF', icon: 'poi-kultur', classes: ['attraction', 'museum', 'art_gallery', 'gallery', 'theatre', 'cinema', 'monument', 'castle', 'zoo', 'theme_park', 'viewpoint', 'artwork', 'library', 'place_of_worship', 'information', 'town_hall', 'aquarium', 'arts_centre', 'music', 'ruins', 'memorial', 'garden'] },
  { id: 'unterkunft', label: 'Unterkunft', color: '#F472B6', icon: 'poi-unterkunft', classes: ['lodging', 'hotel', 'hostel', 'motel', 'campsite', 'guest_house', 'caravan_site'] },
  { id: 'verkehr', label: 'Verkehr', color: '#4DA3FF', icon: 'poi-verkehr', classes: ['bus', 'railway', 'airport', 'harbor', 'ferry_terminal', 'parking', 'fuel', 'charging_station', 'bicycle_rental', 'bicycle_parking', 'car_rental', 'taxi', 'subway', 'tram', 'station'] },
  { id: 'gesundheit', label: 'Gesundheit und Dienste', color: '#4ADE80', icon: 'poi-gesundheit', classes: ['hospital', 'pharmacy', 'doctors', 'dentist', 'clinic', 'veterinary', 'bank', 'atm', 'post', 'police', 'fire_station', 'school', 'college', 'university', 'kindergarten', 'toilets', 'laundry'] },
  { id: 'freizeit', label: 'Freizeit und Sport', color: '#2DD4BF', icon: 'poi-freizeit', classes: ['park', 'playground', 'stadium', 'swimming', 'pitch', 'sports_centre', 'fitness_centre', 'golf', 'nature_reserve', 'dog_park', 'swimming_pool', 'ice_rink', 'sport'] },
];
/** The places as a GeoJSON source: the tiles' places plus the height of the building each stands in (map/poi-heights.ts), which the tiles do not have. */
export const POI_GEO_SOURCE = 'poi-geo';
/** Ids of the layers that read it (the controller sets their height offset). */
export const poiLayerIds = new Set<string>();
/** Metres above the ground: the roof of the building the place is in, as high as the buildings are drawn (`share` of their height + the constant lift). */
export const heightOffset = (share: number): Ex => ['+', share > 0 ? 3 : 0, ['*', ['coalesce', ['get', 'h'], 0], share]] as unknown as Ex;
/** The basemap's own places layer. */
export const POI_LAYER_ID = 'bm-poi';
/** Places a building stands in front of seen from the camera (map/poi-heights.ts): `key` of the feature. Read by `poiFilter`, so an effect that sets the filter follows it. */
export const poiOccluded = signal<readonly string[]>([]);
/** The fade of a place that a building steps in front of or leaves (feature-state `a`, 1 = visible; map/poi-heights.ts tweens it). */
const fade: Ex = ['coalesce', ['feature-state', 'a'], 1] as unknown as Ex;
/** Opacity of a place layer: the layer's own, times the fade. */
export const poiOpacity = (o: number): Ex => ['*', o, fade] as unknown as Ex;
/** Every class a group lists: the places the map shows. */
const KNOWN = POI_GROUPS.flatMap((g) => g.classes);
/** Kinds inside those classes that are only detail (information boards, guideposts, street art): left out. */
const SMALL_PRINT = ['board', 'guidepost', 'map', 'artwork', 'office', 'plaque', 'bus_stop', 'tram_stop', 'halt'];
export const POI_OTHER = { color: '#9AA7BD', icon: 'poi-sonst' };
export const POI_ICON_NAMES = [...POI_GROUPS.map((g) => g.icon), POI_OTHER.icon];

/**
 * Importance of a kind of place: 1 = seen from far away, 5 = only when you stand in the street. The zoom each tier appears at is
 * TIER_ZOOM. Classes not listed here are tier 5.
 */
const TIERS: string[][] = [
  ['airport', 'harbor', 'ferry_terminal', 'stadium', 'theme_park', 'zoo', 'aquarium', 'university', 'hospital', 'castle', 'attraction'],
  ['museum', 'monument', 'art_gallery', 'gallery', 'theatre', 'cinema', 'library', 'college', 'town_hall', 'park', 'nature_reserve', 'place_of_worship', 'mall', 'department_store', 'lodging', 'hotel', 'subway', 'viewpoint', 'arts_centre', 'castle', 'marketplace'],
  ['restaurant', 'cafe', 'bar', 'pub', 'biergarten', 'supermarket', 'grocery', 'pharmacy', 'bank', 'post', 'police', 'fire_station', 'school', 'clinic', 'fuel', 'charging_station', 'hostel', 'campsite', 'sports_centre', 'swimming', 'golf'],
  ['fast_food', 'bakery', 'ice_cream', 'food_court', 'butcher', 'confectionery', 'shop', 'clothing_store', 'convenience', 'bookstore', 'books', 'electronics', 'furniture', 'jewelry', 'florist', 'beauty', 'hairdresser', 'bicycle', 'sports', 'doctors', 'dentist', 'veterinary', 'kindergarten', 'parking', 'bicycle_rental', 'car_rental', 'taxi', 'motel', 'guest_house', 'caravan_site', 'playground', 'pitch', 'fitness_centre', 'swimming_pool', 'ice_rink', 'dog_park', 'garden', 'music'],
];
/** The zoom at which tier 1, 2, ... 5 appears. */
const TIER_ZOOM = [12, 14, 15.5, 16.5, 17.5];

/** The tier of a feature: a station is a landmark, a tram or bus stop is not (OpenMapTiles gives both class `railway` / `bus` and tells them apart by subclass). */
const tierOf: Ex = ['case',
  ['all', ['==', ['get', 'class'], 'railway'], ['==', ['get', 'subclass'], 'station']], 1,
  ['==', ['get', 'class'], 'railway'], 4,
  ['all', ['==', ['get', 'class'], 'bus'], ['==', ['get', 'subclass'], 'bus_station']], 3,
  ['match', ['get', 'class'], ...TIERS.flatMap((cl, i) => [cl.filter((c) => !TIERS.slice(0, i).some((t) => t.includes(c))), i + 1]), 5],
] as unknown as Ex;

/** The highest tier that shows at the current zoom (0: none). */
const tierLimit: Ex = ['step', ['zoom'], 0, ...TIER_ZOOM.flatMap((z, i) => [z, i + 1])] as unknown as Ex;

const colorOf: Ex = ['match', ['get', 'class'], ...POI_GROUPS.flatMap((g) => [g.classes, g.color]), POI_OTHER.color] as unknown as Ex;
const iconOf: Ex = ['match', ['get', 'class'], ...POI_GROUPS.flatMap((g) => [g.classes, g.icon]), POI_OTHER.icon] as unknown as Ex;

export const poiGroupOf = (cls: unknown): PoiGroup | undefined => POI_GROUPS.find((g) => g.classes.includes(String(cls)));

/** Which places show: named ones of the tiers the zoom has reached, narrowed to the chosen groups (`groups`: option value of the layer, undefined = all). */
export function poiFilter(groups?: string, ahead = 0, hide: readonly (readonly [number, number, number, number])[] = []): FilterSpecification {
  // only places of a known kind, and not the small print: signs, statues and murals, flower pots, house entrances, offices
  const f: unknown[] = ['all', ['has', 'name'], ['in', ['get', 'class'], ['literal', KNOWN]], ['!', ['in', ['get', 'subclass'], ['literal', SMALL_PRINT]]], ['<=', tierOf, ahead ? ['+', tierLimit, ahead] : tierLimit]];
  // where a 3D landmark stands it has its own badge (pro/landmarks/badges.ts): the plain place of the same building steps aside
  if (hide.length) {
    const pad = 0.00012;
    f.push(['!', ['within', { type: 'MultiPolygon', coordinates: hide.map(([w, s, e, n]) => [[[w - pad, s - pad], [e + pad, s - pad], [e + pad, n + pad], [w - pad, n + pad], [w - pad, s - pad]]]) }]]);
  }
  const hidden = poiOccluded.value;
  if (hidden.length) f.push(['!', ['in', ['get', 'key'], ['literal', hidden]]]);
  const picked = multiValues(groups);
  if (picked) f.push(['in', ['get', 'class'], ['literal', POI_GROUPS.filter((g) => picked.includes(g.id)).flatMap((g) => g.classes)]]);
  return f as FilterSpecification;
}

/** The layers: an icon per group with the name beside it, and below it a tiny dot for every place. Higher tiers win a collision, then OpenMapTiles' rank inside the tile. */
export function poiLayers(id: string, visible = true): LayerSpecification[] {
  const name: Ex = ['coalesce', ['get', 'name:latin'], ['get', 'name']];
  const symbols = {
    id, type: 'symbol', source: POI_GEO_SOURCE, minzoom: TIER_ZOOM[0], filter: poiFilter(),
    layout: {
      visibility: visible ? 'visible' : 'none',
      'icon-image': iconOf,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 15, 0.64, 18, 0.8] as Ex,
      'icon-padding': 3,
      'text-field': name,
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 18, 13] as Ex,
      'text-anchor': 'left',
      'text-offset': [1, 0],
      'text-max-width': 8,
      'symbol-sort-key': ['+', ['*', tierOf, 1000], ['coalesce', ['get', 'rank'], 100]] as Ex,
      'symbol-height-offset': heightOffset(0),
    },
    paint: {
      'icon-color': colorOf,
      'icon-halo-color': 'rgba(255, 255, 255, 0.8)', // the thin light rim of the Apple badges
      'icon-halo-width': 1.2,
      'icon-opacity': fade,
      'text-opacity': fade,
      'text-color': colorOf,
      'text-halo-color': 'rgba(10, 15, 24, 0.92)',
      'text-halo-width': 1.6,
    },
  } as LayerSpecification;
  // Where the zoom has no room for icon and name (they collide, or the place is one tier ahead) there is a small plain dot: the badge sits on top of it
  const dots = {
    id: poiDotsId(id), type: 'symbol', source: POI_GEO_SOURCE, minzoom: TIER_ZOOM[0], filter: poiFilter(undefined, 1),
    layout: {
      visibility: visible ? 'visible' : 'none',
      'icon-image': 'dot',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.07, 16, 0.12, 18, 0.16] as Ex,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-height-offset': heightOffset(0),
    },
    paint: { 'icon-color': colorOf, 'icon-halo-color': 'rgba(10, 15, 24, 0.8)', 'icon-halo-width': 0.25, 'icon-opacity': fade },
  } as LayerSpecification;
  poiLayerIds.add(id);
  poiLayerIds.add(poiDotsId(id));
  return [dots, symbols];
}

/** The id of the dot layer that belongs to the symbol layer `id`. */
export const poiDotsId = (id: string) => `${id}-dots`;
