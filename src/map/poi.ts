// Points of interest from the OpenFreeMap tiles (OpenMapTiles layer `poi`, source `ofm`): one symbol layer with a
// coloured badge per kind of place, in the visual language of Apple Maps (white glyph on a saturated disc, transport
// on a rounded square). map/poi.ts is the single place that knows groups, categories, colours, icons and importance.
// Like Apple Maps, what shows depends on the zoom: stations, airports, hospitals and big sights first, restaurants
// and shops later, benches and bus stops last. Whatever is left competes for room by importance (symbol-sort-key),
// so a station always wins against the café next to it.
import type { ExpressionSpecification as Ex, FilterSpecification, LayerSpecification } from 'maplibre-gl';
import { signal } from '@preact/signals';
import { multiValues } from '../layers/multi';

export type PoiGroupId = 'essen' | 'einkaufen' | 'kultur' | 'unterkunft' | 'verkehr' | 'gesundheit' | 'freizeit';
export type PoiBadgeShape = 'circle' | 'rounded';

export interface PoiGroup { id: PoiGroupId; label: string; color: string; shape: PoiBadgeShape }
/** `tier` is how early a kind appears: 1 is seen far out (airport, station, hospital), 5 only in the street (bench, laundry). */
export interface PoiCategory { id: string; label: string; group: PoiGroupId; glyph: string; keys: string[]; tier: 1 | 2 | 3 | 4 | 5; color?: string }

/** Apple's category colours, sampled from the Maps icon set: one broad hue per group keeps the filter legend honest,
 *  while the glyph tells the exact kind (restaurant, café, bakery, museum, station, pharmacy …). */
export const POI_GROUPS: PoiGroup[] = [
  { id: 'essen', label: 'Essen und Trinken', color: '#FF9500', shape: 'circle' },
  { id: 'einkaufen', label: 'Einkaufen', color: '#FFCC00', shape: 'circle' },
  { id: 'kultur', label: 'Sehenswürdigkeiten und Kultur', color: '#A191FF', shape: 'circle' },
  { id: 'unterkunft', label: 'Unterkunft', color: '#5E6DB3', shape: 'circle' },
  { id: 'verkehr', label: 'Verkehr', color: '#007AFF', shape: 'rounded' },
  { id: 'gesundheit', label: 'Gesundheit und Dienste', color: '#FF3B30', shape: 'circle' },
  { id: 'freizeit', label: 'Freizeit und Sport', color: '#34C759', shape: 'circle' },
];

/**
 * The kinds of place the map shows, in the order of the filter. `keys` are OpenMapTiles class and subclass values;
 * the subclass wins where it is more precise (shop=bakery, railway=station, tourism=hotel).
 */
export const POI_CATEGORIES: PoiCategory[] = [
  // Essen und Trinken
  { id: 'restaurant', label: 'Restaurant', group: 'essen', glyph: 'restaurant', tier: 3, color: '#FF9500', keys: ['restaurant'] },
  { id: 'fastfood', label: 'Fast Food', group: 'essen', glyph: 'fastfood', tier: 4, color: '#FF9500', keys: ['fast_food', 'food_court'] },
  { id: 'cafe', label: 'Café', group: 'essen', glyph: 'local_cafe', tier: 3, color: '#A2845E', keys: ['cafe'] },
  { id: 'bar', label: 'Bar und Pub', group: 'essen', glyph: 'local_bar', tier: 3, color: '#C36AD8', keys: ['bar', 'pub', 'biergarten', 'nightclub'] },
  { id: 'bakery', label: 'Bäckerei', group: 'essen', glyph: 'bakery_dining', tier: 4, color: '#E58B2A', keys: ['bakery'] },
  { id: 'icecream', label: 'Eiscreme', group: 'essen', glyph: 'icecream', tier: 4, color: '#FF9EC4', keys: ['ice_cream'] },
  { id: 'winery', label: 'Wein und Brauerei', group: 'essen', glyph: 'wine_bar', tier: 4, color: '#AF52DE', keys: ['alcohol_shop', 'beer', 'beverages', 'wine', 'brewery', 'winery', 'distillery'] },

  // Einkaufen
  { id: 'supermarket', label: 'Supermarkt', group: 'einkaufen', glyph: 'shopping_cart', tier: 3, color: '#FFCC00', keys: ['supermarket', 'grocery', 'greengrocer', 'convenience', 'general', 'marketplace', 'market', 'food_market'] },
  { id: 'mall', label: 'Einkaufszentrum', group: 'einkaufen', glyph: 'storefront', tier: 2, color: '#FFCC00', keys: ['department_store', 'mall'] },
  { id: 'store', label: 'Geschäft', group: 'einkaufen', glyph: 'shopping_bag', tier: 4, color: '#FFB300', keys: ['shop', 'boutique', 'gift', 'kiosk', 'stationery', 'newsagent', 'second_hand', 'charity', 'antiques', 'bag', 'accessories', 'toys', 'video_games', 'confectionery', 'chocolate', 'butcher', 'deli'] },
  { id: 'clothing', label: 'Bekleidung', group: 'einkaufen', glyph: 'checkroom', tier: 4, color: '#FF9F0A', keys: ['clothing_store', 'clothes', 'fashion', 'shoes', 'shoe_shop', 'tailor'] },
  { id: 'furniture', label: 'Möbel und Wohnen', group: 'einkaufen', glyph: 'chair', tier: 4, color: '#C47A2C', keys: ['furniture', 'interior_decoration', 'home_decor', 'carpet', 'garden_centre', 'florist', 'flower'] },
  { id: 'electronics', label: 'Elektronik', group: 'einkaufen', glyph: 'devices', tier: 4, color: '#8E8E93', keys: ['electronics', 'computer', 'mobile_phone', 'hifi', 'camera', 'photo'] },
  { id: 'beauty', label: 'Beauty und Friseur', group: 'einkaufen', glyph: 'content_cut', tier: 4, color: '#FF2D55', keys: ['hairdresser', 'beauty', 'cosmetics', 'perfumery', 'massage', 'tattoo', 'spa'] },
  { id: 'books', label: 'Bücher', group: 'einkaufen', glyph: 'menu_book', tier: 4, color: '#BF8B5E', keys: ['bookstore', 'books', 'library_books'] },
  { id: 'bicycle_shop', label: 'Fahrrad und Sport', group: 'einkaufen', glyph: 'pedal_bike', tier: 4, color: '#34C759', keys: ['bicycle', 'sports', 'outdoor'] },
  { id: 'jewelry', label: 'Schmuck und Optik', group: 'einkaufen', glyph: 'diamond', tier: 4, color: '#FFD60A', keys: ['jewelry', 'watch', 'optician', 'eyeglasses'] },

  // Kultur und Sehenswürdigkeiten
  { id: 'attraction', label: 'Sehenswürdigkeit', group: 'kultur', glyph: 'attractions', tier: 1, color: '#A191FF', keys: ['attraction', 'theme_park', 'amusement_park'] },
  { id: 'monument', label: 'Denkmal', group: 'kultur', glyph: 'account_balance', tier: 1, color: '#8E8CE6', keys: ['monument', 'memorial', 'landmark', 'national_monument', 'historic'] },
  { id: 'castle', label: 'Schloss und Burg', group: 'kultur', glyph: 'castle', tier: 1, color: '#8E8CE6', keys: ['castle', 'fortress', 'ruins'] },
  { id: 'museum', label: 'Museum', group: 'kultur', glyph: 'museum', tier: 1, color: '#A2845E', keys: ['museum'] },
  { id: 'gallery', label: 'Kunst und Galerie', group: 'kultur', glyph: 'palette', tier: 2, color: '#BF5AF2', keys: ['art_gallery', 'gallery', 'artwork', 'arts_centre'] },
  { id: 'theater', label: 'Theater', group: 'kultur', glyph: 'theater_comedy', tier: 2, color: '#AF52DE', keys: ['theatre', 'theater'] },
  { id: 'cinema', label: 'Kino', group: 'kultur', glyph: 'movie', tier: 2, color: '#AF52DE', keys: ['cinema'] },
  { id: 'music', label: 'Musik', group: 'kultur', glyph: 'music_note', tier: 3, color: '#BF5AF2', keys: ['music', 'music_venue', 'concert_hall'] },
  { id: 'library', label: 'Bibliothek', group: 'kultur', glyph: 'local_library', tier: 2, color: '#A2845E', keys: ['library'] },
  { id: 'worship', label: 'Gotteshaus', group: 'kultur', glyph: 'church', tier: 2, color: '#8E8CE6', keys: ['place_of_worship', 'religion'] },
  { id: 'townhall', label: 'Rathaus und Amt', group: 'kultur', glyph: 'account_balance', tier: 2, color: '#8E8E93', keys: ['town_hall', 'townhall', 'public_building', 'courthouse', 'embassy', 'community_centre'] },
  { id: 'viewpoint', label: 'Aussichtspunkt', group: 'kultur', glyph: 'visibility', tier: 2, color: '#64D2FF', keys: ['viewpoint'] },
  { id: 'zoo', label: 'Zoo und Aquarium', group: 'kultur', glyph: 'pets', tier: 1, color: '#34C759', keys: ['zoo', 'aquarium'] },
  { id: 'information', label: 'Information', group: 'kultur', glyph: 'info', tier: 4, color: '#8E8E93', keys: ['information', 'visitor_centre'] },

  // Unterkunft
  { id: 'hotel', label: 'Hotel', group: 'unterkunft', glyph: 'hotel', tier: 2, color: '#5E6DB3', keys: ['lodging', 'hotel', 'hostel', 'motel', 'guest_house', 'bed_and_breakfast', 'chalet', 'alpine_hut', 'dormitory'] },
  { id: 'camping', label: 'Camping', group: 'unterkunft', glyph: 'camping', tier: 3, color: '#34C759', keys: ['campsite', 'camp_site', 'caravan_site', 'rv_park'] },

  // Verkehr
  { id: 'airport', label: 'Flughafen', group: 'verkehr', glyph: 'flight', tier: 1, color: '#5AC8FA', keys: ['airport', 'aerodrome', 'helipad'] },
  { id: 'station', label: 'Bahnhof', group: 'verkehr', glyph: 'train', tier: 2, color: '#007AFF', keys: ['railway', 'station', 'train_station', 'halt'] },
  { id: 'subway', label: 'U-Bahn', group: 'verkehr', glyph: 'subway', tier: 2, color: '#007AFF', keys: ['subway', 'subway_entrance'] },
  { id: 'tram', label: 'Straßenbahn', group: 'verkehr', glyph: 'tram', tier: 3, color: '#007AFF', keys: ['tram', 'tram_stop'] },
  { id: 'bus', label: 'Bus', group: 'verkehr', glyph: 'directions_bus', tier: 3, color: '#007AFF', keys: ['bus', 'bus_station', 'bus_stop'] },
  { id: 'ferry', label: 'Hafen und Fähre', group: 'verkehr', glyph: 'directions_boat', tier: 2, color: '#32ADE6', keys: ['harbor', 'ferry_terminal', 'marina', 'dock'] },
  { id: 'parking', label: 'Parken', group: 'verkehr', glyph: 'local_parking', tier: 4, color: '#007AFF', keys: ['parking', 'motorcycle_parking', 'garage'] },
  { id: 'fuel', label: 'Tankstelle', group: 'verkehr', glyph: 'local_gas_station', tier: 3, color: '#007AFF', keys: ['fuel'] },
  { id: 'charging', label: 'Ladesäule', group: 'verkehr', glyph: 'ev_station', tier: 3, color: '#34C759', keys: ['charging_station', 'ev_charger'] },
  { id: 'bicycle_rental', label: 'Fahrradverleih', group: 'verkehr', glyph: 'pedal_bike', tier: 4, color: '#34C759', keys: ['bicycle_rental', 'bicycle_parking', 'bicycle_share'] },
  { id: 'car_rental', label: 'Auto und Mietwagen', group: 'verkehr', glyph: 'car_rental', tier: 4, color: '#007AFF', keys: ['car_rental', 'car', 'car_repair', 'car_wash', 'car_sharing'] },
  { id: 'taxi', label: 'Taxi', group: 'verkehr', glyph: 'local_taxi', tier: 4, color: '#FFD60A', keys: ['taxi'] },
  { id: 'aerialway', label: 'Seilbahn', group: 'verkehr', glyph: 'cable_car', tier: 3, color: '#007AFF', keys: ['aerialway'] },

  // Gesundheit und Dienste
  { id: 'hospital', label: 'Krankenhaus', group: 'gesundheit', glyph: 'local_hospital', tier: 1, color: '#FF3B30', keys: ['hospital', 'clinic', 'nursing_home', 'urgent_care'] },
  { id: 'pharmacy', label: 'Apotheke', group: 'gesundheit', glyph: 'medication', tier: 3, color: '#34C759', keys: ['pharmacy', 'chemist'] },
  { id: 'doctors', label: 'Arzt', group: 'gesundheit', glyph: 'stethoscope', tier: 4, color: '#FF3B30', keys: ['doctors', 'physician', 'medical'] },
  { id: 'dentist', label: 'Zahnarzt', group: 'gesundheit', glyph: 'dentistry', tier: 4, color: '#5AC8FA', keys: ['dentist'] },
  { id: 'veterinary', label: 'Tierarzt', group: 'gesundheit', glyph: 'pets', tier: 4, color: '#FF9500', keys: ['veterinary', 'animal_service'] },
  { id: 'bank', label: 'Bank und Geldautomat', group: 'gesundheit', glyph: 'account_balance', tier: 3, color: '#34C759', keys: ['bank', 'atm'] },
  { id: 'post', label: 'Post', group: 'gesundheit', glyph: 'local_post_office', tier: 3, color: '#8E8E93', keys: ['post', 'post_office', 'post_box', 'parcel_locker', 'mailbox'] },
  { id: 'police', label: 'Polizei', group: 'gesundheit', glyph: 'local_police', tier: 2, color: '#007AFF', keys: ['police'] },
  { id: 'fire', label: 'Feuerwehr', group: 'gesundheit', glyph: 'local_fire_department', tier: 2, color: '#FF3B30', keys: ['fire_station'] },
  { id: 'school', label: 'Schule', group: 'gesundheit', glyph: 'school', tier: 3, color: '#A2845E', keys: ['school', 'kindergarten', 'preschool'] },
  { id: 'university', label: 'Universität', group: 'gesundheit', glyph: 'school', tier: 1, color: '#A2845E', keys: ['college', 'university'] },
  { id: 'toilets', label: 'Toiletten', group: 'gesundheit', glyph: 'wc', tier: 5, color: '#8E8E93', keys: ['toilets', 'restroom'] },
  { id: 'laundry', label: 'Wäscherei', group: 'gesundheit', glyph: 'local_laundry_service', tier: 5, color: '#5AC8FA', keys: ['laundry', 'dry_cleaning'] },

  // Freizeit und Sport
  { id: 'park', label: 'Park', group: 'freizeit', glyph: 'park', tier: 2, color: '#34C759', keys: ['park', 'garden', 'national_park', 'nature_reserve', 'protected_area'] },
  { id: 'beach', label: 'Strand', group: 'freizeit', glyph: 'beach_access', tier: 2, color: '#5AC8FA', keys: ['beach'] },
  { id: 'playground', label: 'Spielplatz', group: 'freizeit', glyph: 'child_care', tier: 4, color: '#34C759', keys: ['playground'] },
  { id: 'stadium', label: 'Stadion', group: 'freizeit', glyph: 'stadium', tier: 1, color: '#34C759', keys: ['stadium'] },
  { id: 'sports_centre', label: 'Sport und Fitness', group: 'freizeit', glyph: 'fitness_center', tier: 3, color: '#34C759', keys: ['sports_centre', 'fitness_centre', 'fitness', 'gym'] },
  { id: 'swimming', label: 'Schwimmen', group: 'freizeit', glyph: 'pool', tier: 3, color: '#5AC8FA', keys: ['swimming', 'swimming_pool', 'swimming_area', 'water_park'] },
  { id: 'pitch', label: 'Sportplatz', group: 'freizeit', glyph: 'sports_soccer', tier: 4, color: '#34C759', keys: ['pitch', 'sport', 'track'] },
  { id: 'golf', label: 'Golf', group: 'freizeit', glyph: 'golf_course', tier: 3, color: '#34C759', keys: ['golf', 'golf_course', 'miniature_golf'] },
  { id: 'ice_rink', label: 'Eislauf', group: 'freizeit', glyph: 'ice_skating', tier: 4, color: '#5AC8FA', keys: ['ice_rink', 'skating', 'skate_park'] },
  { id: 'dog_park', label: 'Hundepark', group: 'freizeit', glyph: 'pets', tier: 4, color: '#34C759', keys: ['dog_park'] },
];

export const POI_OTHER = { id: 'other', label: 'Sonstiges', color: '#969696', shape: 'circle' as PoiBadgeShape, glyph: 'more_horiz', icon: 'poi-other' };

const GROUPS = new Map(POI_GROUPS.map((g) => [g.id, g]));
export const poiGroup = (id: PoiGroupId): PoiGroup => GROUPS.get(id)!;
export const poiGroupColor = (id: PoiGroupId): string => poiGroup(id).color;

const CATEGORIES = new Map<string, PoiCategory>();
for (const c of POI_CATEGORIES) for (const k of c.keys) CATEGORIES.set(k, c);
/** Every category id, in filter order (what the layer shows at all). */
export const POI_CATEGORY_IDS = POI_CATEGORIES.map((c) => c.id);

/** The category of a feature: the subclass if it is more precise, else the class. */
export function poiCategoryOf(p: { class?: unknown; subclass?: unknown }): PoiCategory | undefined {
  const sub = String(p.subclass ?? '');
  const cls = String(p.class ?? '');
  return CATEGORIES.get(sub) ?? CATEGORIES.get(cls);
}

/** The image name for a category: one badge per category so colour and glyph stay exact. */
export const poiIconId = (c: PoiCategory): string => `poi-${c.id}`;
/** The image name of a feature, or the grey fallback. */
export const poiIconOf = (p: { class?: unknown; subclass?: unknown }): string => {
  const c = poiCategoryOf(p);
  return c ? poiIconId(c) : POI_OTHER.icon;
};
/** The category members of one filter group: what the group option shows. */
export const poiCategoryIdsOf = (group: string): string[] =>
  POI_CATEGORIES.filter((c) => c.group === group).map((c) => c.id);

/** Unique badge images: group + glyph (colour and holding shape come from the group), plus the neutral fallback. */
export const POI_ICON_SPECS = [...new Map([
  ...POI_CATEGORIES.map((c) => [poiIconId(c), { id: poiIconId(c), glyph: c.glyph, color: c.color ?? poiGroupColor(c.group), shape: poiGroup(c.group).shape }] as const),
  [POI_OTHER.icon, { id: POI_OTHER.icon, glyph: POI_OTHER.glyph, color: POI_OTHER.color, shape: POI_OTHER.shape }] as const,
]).values()];

/** The places as a GeoJSON source: the tiles' places plus the height of the building each stands in (map/poi-heights.ts), which the tiles do not have. */
export const POI_GEO_SOURCE = 'poi-geo';
/** Ids of the layers that read it (the controller sets their height offset). */
export const poiLayerIds = new Set<string>();
/** Metres above the ground: the roof of the building the place is in, as high as the buildings are drawn (`share` of their height + the constant lift). */
export const heightOffset = (share: number): Ex => ['+', share > 0 ? 3 : 0, ['*', ['coalesce', ['get', 'h'], 0], share]] as unknown as Ex;
/** The basemap's own places layer. */
export const POI_LAYER_ID = 'bm-poi';
/** Places a building stands in front of seen from the camera (map/poi-heights.ts): `key` of the feature. Read by `poiFilter`, so an effect that sets the filter follows it. */
/** The zoom a tilted view adds to what the tiers count (map/buildings-tilt.ts, `pitchZoomBonus`). Read by `poiFilter`, so an effect that sets the filter follows it. */
export const poiZoomBonus = signal(0);
export const poiOccluded = signal<readonly string[]>([]);
/** The fade of a place that a building steps in front of or leaves (feature-state `a`, 1 = visible; map/poi-heights.ts tweens it). */
const fade: Ex = ['coalesce', ['feature-state', 'a'], 1] as unknown as Ex;
/** Opacity of a place layer: the layer's own, times the fade. */
export const poiOpacity = (o: number): Ex => ['*', o, fade] as unknown as Ex;
/** Kinds inside those classes that are only detail (information boards, guideposts, street art): left out. */
const SMALL_PRINT = ['board', 'guidepost', 'map', 'artwork', 'office', 'plaque', 'bus_stop', 'tram_stop', 'halt'];
const iconOf: Ex = ['coalesce', ['get', 'icon'], POI_OTHER.icon] as unknown as Ex;
const colorOf: Ex = ['coalesce', ['get', 'color'], POI_OTHER.color] as unknown as Ex;

/** Importance of a kind of place: 1 = seen from far away, 5 = only when you stand in the street. Each category carries its tier;
 *  the zoom it appears at is TIER_ZOOM. OpenMapTiles' `rank` can lift a well-known place (a landmark, a big station) higher. */
/** The zoom at which tier 1, 2, ... 5 appears: landmarks first, the full mix of shops and restaurants at street level.
 *  Plain dots start later still (see poiLayers). */
const TIER_ZOOM = [12, 13.5, 14.8, 16.2, 17.6];
/** Plain dots (places without room for a badge) appear only this deep, like Apple/Google: before it they would be hundreds of sprites. */
const DOT_ZOOM = 17.6;

const SMALL_PRINT_SET = new Set(SMALL_PRINT);

/** The tier of a place: category tier, lifted by prominence (low rank = famous landmark). Transport never gets the boost:
 *  stations must not be the only kind left at the first badge zoom. */
export function poiTier(cat: PoiCategory, rank: unknown): number {
  if (cat.group === 'verkehr') return cat.tier;
  const r = Number(rank);
  if (Number.isFinite(r) && r <= 1) return Math.min(cat.tier, 2);
  return cat.tier;
}

/** What the layers read from a place: decided once when the place enters the GeoJSON source, not per feature in expressions. */
export interface PoiProps { tier: number; grp: string; cat: string; icon: string; color: string }
/** The resolved properties of a tile place, or undefined where the map leaves it out. */
export function poiResolve(p: { name?: unknown; class?: unknown; subclass?: unknown; rank?: unknown }): PoiProps | undefined {
  if (!p.name || SMALL_PRINT_SET.has(String(p.subclass))) return undefined;
  const cat = poiCategoryOf(p);
  if (!cat) return undefined;
  return { tier: poiTier(cat, p.rank), grp: cat.group, cat: cat.id, icon: poiIconId(cat), color: cat.color ?? poiGroupColor(cat.group) };
}

/** The highest tier that shows at a zoom (0: none), `ahead` tiers more for the plain dots. */
export function poiTierLimit(zoom: number, ahead = 0): number {
  let t = 0;
  for (let i = 0; i < TIER_ZOOM.length; i++) if (zoom >= TIER_ZOOM[i]!) t = i + 1;
  return t + ahead;
}

/** The highest tier that shows at the current zoom (0: none), including tilt bonus. */
export const tierLimitAt = (bonus: number): Ex => ['step', bonus ? ['+', ['zoom'], bonus] : ['zoom'], 0, ...TIER_ZOOM.flatMap((z, i) => [z, i + 1])] as unknown as Ex;
const tierOf: Ex = ['get', 'tier'] as unknown as Ex;

/** The kind of a place for people: its subclass (or class), "ice_cream" -> "Ice cream". */
export const poiKind = (p: { class?: unknown; subclass?: unknown }): string =>
  String(p.subclass && p.subclass !== p.class ? p.subclass : p.class ?? '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** The group of a feature, for the select card's colour. */
export const poiGroupOf = (p: { class?: unknown; subclass?: unknown }): PoiGroup | undefined => {
  const c = poiCategoryOf(p);
  return c ? GROUPS.get(c.group) : undefined;
};

/** The badge colour of a feature: the category's own colour when set, else its group. */
export const poiColorOf = (p: { class?: unknown; subclass?: unknown }): string => {
  const c = poiCategoryOf(p);
  return c?.color ?? (c ? poiGroupColor(c.group) : POI_OTHER.color);
};

/** Which places show: the tiers the zoom has reached, narrowed to the chosen groups. Names/kinds/small print are settled in poiResolve. */
export function poiFilter(groups?: string, ahead = 0, hide: readonly (readonly [number, number, number, number])[] = []): FilterSpecification {
  const limit = tierLimitAt(poiZoomBonus.value);
  const f: unknown[] = ['all', ['<=', tierOf, ahead ? ['+', limit, ahead] : limit]];
  // where a 3D landmark stands it has its own badge (pro/landmarks/badges.ts): the plain place of the same building steps aside
  if (hide.length) {
    const pad = 0.00012;
    f.push(['!', ['within', { type: 'MultiPolygon', coordinates: hide.map(([w, s, e, n]) => [[[w - pad, s - pad], [e + pad, s - pad], [e + pad, n + pad], [w - pad, n + pad], [w - pad, s - pad]]]) }]]);
  }
  // `match` is a hash lookup per place; `in` on a long literal list would be a linear search
  const hidden = poiOccluded.value;
  if (hidden.length) f.push(['match', ['get', 'key'], hidden as string[], false, true]);
  const picked = multiValues(groups);
  if (picked) f.push(['match', ['get', 'grp'], picked, true, false]);
  return f as FilterSpecification;
}

/** The layers: a badge per kind with the name beside it, and below it a tiny dot for every place. Higher tiers win a collision, then OpenMapTiles' rank inside the tile. */
export function poiLayers(id: string, visible = true): LayerSpecification[] {
  const name: Ex = ['coalesce', ['get', 'name:latin'], ['get', 'name']];
  const symbols = {
    id, type: 'symbol', source: POI_GEO_SOURCE, minzoom: TIER_ZOOM[0], filter: poiFilter(),
    layout: {
      visibility: visible ? 'visible' : 'none',
      'icon-image': iconOf,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.48, 15, 0.62, 18, 0.78] as Ex,
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
      'icon-opacity': fade,
      'text-opacity': fade,
      'text-color': colorOf,
      'text-halo-color': 'rgba(10, 15, 24, 0.92)',
      'text-halo-width': 1.6,
    },
  } as LayerSpecification;
  // Where a badge does not fit (collision), a small plain dot still marks the place. Apple shows those only at street
  // level and only where a badge found no room (collision), so the city does not fill up with tiny points.
  const dots = {
    id: poiDotsId(id), type: 'symbol', source: POI_GEO_SOURCE, minzoom: DOT_ZOOM, filter: poiFilter(undefined, 0),
    layout: {
      visibility: visible ? 'visible' : 'none',
      'icon-image': 'dot',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 17, 0.1, 19, 0.16] as Ex,
      // placed after the badges (they sit in the layer above): a dot shows only where badge and label left room, and never blocks another
      'icon-allow-overlap': false,
      'icon-padding': 2,
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
