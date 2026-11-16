// Labels of the Orbis Karte in the style of Apple Maps (dark): spaced capitals for continents, countries and regions,
// italic blue water names, white city names with a dot, capitals first, peaks with their height.
// Data: OpenFreeMap (OpenMapTiles `place`, `water_name`, `mountain_peak`, `transportation_name`). Layer ids start with
// `lbl-karte-<kind>` (the kind is what map/engine.ts uses to describe a clicked label).
// OpenMapTiles has no mountain ranges and no cities below zoom 2, see the notes at the end.
import type { ExpressionSpecification as Ex, LayerSpecification } from 'maplibre-gl';

/** Natural Earth overlay (tools/vector-basemap/build-labels.sh): capitals and big cities for zoom < 2, names of mountain ranges, deserts, basins ... */
export const KARTE_LABELS_SOURCE = 'karte-labels';

const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const FONT_ITALIC = ['Noto Sans Italic'];
const NAME: Ex = ['coalesce', ['get', 'name:de'], ['get', 'name_de'], ['get', 'name:latin'], ['get', 'name']];
const RANK: Ex = ['coalesce', ['to-number', ['get', 'rank']], 99];
const NAME_PLAIN: Ex = ['get', 'name'];
const REGION_CLASSES = ['Range/mtn', 'Desert', 'Plateau', 'Basin', 'Plain', 'Peninsula', 'Pen/cape', 'Island group', 'Lowland', 'Tundra', 'Depression', 'Valley', 'Delta', 'Wetlands', 'Isthmus', 'Foothills'];
const hidden = { visibility: 'none' as const };

const C = {
  text: '#e8edf8', halo: 'rgba(10, 18, 45, 0.85)',
  region: '#cdb2a6', continent: '#a79cba', country: '#bb9db8', state: '#a98fa6', water: '#5b86d8', peak: '#d2aa86', road: '#a5afc8',
};

const z = (...stops: (number | string)[]): Ex => ['interpolate', ['linear'], ['zoom'], ...stops] as Ex;
const cls = (...v: string[]): Ex => ['in', ['get', 'class'], ['literal', v]] as Ex;
const base = (halo = 1.3) => ({ 'text-halo-color': C.halo, 'text-halo-width': halo });
const place = { source: 'ofm', 'source-layer': 'place' } as const;

// the "dot" in front of a city name: the label is anchored left and shifted so that the dot sits on the place itself
const dotted: Ex = ['format', '• ', { 'font-scale': 1.1 }, NAME, {}] as unknown as Ex;
const dotLayout = { 'text-anchor': 'left' as const, 'text-offset': [-0.45, 0] as [number, number], 'text-justify': 'left' as const };

/** Order matters: MapLibre resolves label collisions in favour of LATER layers, so the most important ones come last (cities < countries < continents). */
export function karteLabelLayers(): LayerSpecification[] {
  const id = (s: string) => `lbl-karte-${s}`;
  const caps = { 'text-transform': 'uppercase' as const };
  const layers: LayerSpecification[] = [
    // names of mountain ranges, deserts, plateaus, basins ...: spaced capitals in a warm tint, by the importance Natural Earth gives them
    ...([[2, 0, 3.6], [3.2, 3.6, 4.7], [4.2, 4.7, 5.5], [5.2, 5.5, 99]] as [number, number, number][]).map(([minzoom, lo, hi], i): LayerSpecification => ({
      id: id(`region-${i + 1}`), type: 'symbol', source: KARTE_LABELS_SOURCE, 'source-layer': 'regions', minzoom, maxzoom: 9,
      filter: ['all', ['in', ['get', 'cls'], ['literal', REGION_CLASSES]], ['>=', ['to-number', ['get', 'minz'], 9], lo], ['<', ['to-number', ['get', 'minz'], 9], hi]] as Ex,
      layout: { ...hidden, 'text-field': NAME_PLAIN, 'text-font': FONT, 'text-size': z(2, 9.5, 6, 12, 9, 14), 'text-letter-spacing': 0.3, 'text-max-width': 9, 'symbol-sort-key': ['coalesce', ['to-number', ['get', 'rank']], 99] as Ex, ...caps },
      paint: { 'text-color': C.region, 'text-opacity': 0.9, ...base(1) },
    })),
    {
      // capitals and big cities below zoom 2, where OpenFreeMap has no cities yet (from zoom 2 on its own city layers take over)
      id: id('city-world'), type: 'symbol', source: KARTE_LABELS_SOURCE, 'source-layer': 'places', minzoom: 0, maxzoom: 2,
      layout: { ...hidden, 'text-field': ['format', '• ', { 'font-scale': 1.1 }, NAME_PLAIN, {}] as unknown as Ex, 'text-font': FONT_BOLD, 'text-size': z(0, 9.5, 2, 11), 'text-max-width': 8, 'symbol-sort-key': ['-', 0, ['to-number', ['get', 'pop']]] as Ex, ...dotLayout },
      paint: { 'text-color': C.text, ...base(1.3) },
    },
    {
      id: id('water-ocean'), type: 'symbol', source: 'ofm', 'source-layer': 'water_name', minzoom: 0, maxzoom: 9,
      filter: cls('ocean', 'sea'),
      layout: { ...hidden, 'text-field': NAME, 'text-font': FONT_ITALIC, 'text-size': z(0, 11, 6, 15), 'text-letter-spacing': 0.16, 'text-max-width': 8, 'symbol-sort-key': RANK },
      paint: { 'text-color': C.water, ...base(0.8) },
    },
    {
      id: id('water-lake'), type: 'symbol', source: 'ofm', 'source-layer': 'water_name', minzoom: 9,
      filter: cls('lake', 'bay', 'river'),
      layout: { ...hidden, 'text-field': NAME, 'text-font': FONT_ITALIC, 'text-size': z(9, 10, 16, 13), 'text-letter-spacing': 0.1, 'text-max-width': 6 },
      paint: { 'text-color': C.water, ...base(0.8) },
    },
    {
      id: id('state'), type: 'symbol', ...place, minzoom: 5, maxzoom: 10,
      filter: cls('state'),
      layout: { ...hidden, 'text-field': NAME, 'text-font': FONT, 'text-size': z(5, 9.5, 9, 12), 'text-letter-spacing': 0.14, 'text-max-width': 7, 'symbol-sort-key': RANK, ...caps },
      paint: { 'text-color': C.state, 'text-opacity': z(9, 1, 10, 0), ...base(1) },
    },
    {
      id: id('island'), type: 'symbol', ...place, minzoom: 6,
      filter: cls('island'),
      layout: { ...hidden, 'text-field': NAME, 'text-font': FONT_ITALIC, 'text-size': z(6, 10, 12, 13), 'text-max-width': 6, 'symbol-sort-key': RANK },
      paint: { 'text-color': C.text, 'text-opacity': 0.8, ...base() },
    },
    {
      // suburbs and quarters: small spaced capitals
      id: id('suburb'), type: 'symbol', ...place, minzoom: 12, maxzoom: 17,
      filter: cls('suburb', 'neighbourhood', 'quarter'),
      layout: { ...hidden, 'text-field': NAME, 'text-font': FONT_BOLD, 'text-size': z(12, 9.5, 16, 12), 'text-letter-spacing': 0.1, 'text-max-width': 7, ...caps },
      paint: { 'text-color': C.road, 'text-opacity': z(12, 0.75, 16, 0.9), ...base(1) },
    },
    {
      id: id('road'), type: 'symbol', source: 'ofm', 'source-layer': 'transportation_name', minzoom: 12.5,
      filter: ['all', cls('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'), ['>=', RANK, 0]] as Ex,
      layout: { ...hidden, 'symbol-placement': 'line', 'text-field': NAME, 'text-font': FONT_BOLD, 'text-size': z(12.5, 9, 17, 11.5), 'text-letter-spacing': 0.08, 'symbol-spacing': 280, ...caps },
      paint: { 'text-color': C.road, 'text-opacity': 0.9, ...base(1.1) },
    },
    {
      // peaks with their height; the highest ones first
      id: id('peak'), type: 'symbol', source: 'ofm', 'source-layer': 'mountain_peak', minzoom: 8.5,
      filter: cls('peak', 'volcano'),
      layout: {
        ...hidden,
        'text-field': ['case', ['has', 'ele'], ['format', NAME, { 'font-scale': 1 }, '\n', {}, ['concat', ['to-string', ['get', 'ele']], ' m'], { 'font-scale': 0.82 }], NAME] as Ex,
        'text-font': FONT, 'text-size': z(8.5, 10, 14, 12), 'text-max-width': 8, 'symbol-sort-key': RANK, 'text-anchor': 'top', 'text-offset': [0, 0.3],
      },
      paint: { 'text-color': C.peak, ...base() },
    },
    // towns and villages: white with a dot, Apple shows them from about zoom 8
    {
      id: id('village'), type: 'symbol', ...place, minzoom: 10.5,
      filter: cls('village', 'hamlet', 'isolated_dwelling'),
      layout: { ...hidden, 'text-field': NAME, 'text-font': FONT, 'text-size': z(10.5, 10, 15, 12.5), 'text-max-width': 7, 'symbol-sort-key': RANK },
      paint: { 'text-color': C.text, 'text-opacity': 0.9, ...base() },
    },
    {
      id: id('town'), type: 'symbol', ...place, minzoom: 8.5,
      filter: cls('town'),
      layout: { ...hidden, 'text-field': dotted, 'text-font': FONT, 'text-size': z(8.5, 10.5, 14, 14), 'text-max-width': 8, 'symbol-sort-key': RANK, ...dotLayout },
      paint: { 'text-color': C.text, ...base() },
    },
    {
      // cities: all appear from zoom 2 on (that is where OpenMapTiles has them), collision and rank decide what stays
      id: id('city'), type: 'symbol', ...place, minzoom: 2,
      filter: ['all', ['==', ['get', 'class'], 'city'], ['!=', ['get', 'capital'], 2]] as Ex,
      layout: { ...hidden, 'text-field': dotted, 'text-font': FONT, 'text-size': z(2, 10, 6, 13, 10, 16, 14, 18), 'text-max-width': 8, 'symbol-sort-key': ['+', RANK, 1] as Ex, ...dotLayout },
      paint: { 'text-color': C.text, ...base(1.4) },
    },
    {
      // national capitals: bold and always first
      id: id('city-capital'), type: 'symbol', ...place, minzoom: 2,
      filter: ['all', ['==', ['get', 'class'], 'city'], ['==', ['get', 'capital'], 2]] as Ex,
      layout: { ...hidden, 'text-field': dotted, 'text-font': FONT_BOLD, 'text-size': z(2, 10.5, 6, 14, 10, 17, 14, 19), 'text-max-width': 8, 'symbol-sort-key': -1, ...dotLayout },
      paint: { 'text-color': C.text, ...base(1.5) },
    },
    // countries: spaced capitals, bigger ones first (OpenMapTiles rank 1 = large). Placed after the cities = they win against city names
    ...([['country-1', 3, 1], ['country-2', 3.6, 2], ['country-3', 4.4, 3], ['country-4', 5.5, 99]] as [string, number, number][]).map(([n, minzoom, rank]): LayerSpecification => ({
      id: id(n), type: 'symbol', ...place, minzoom, maxzoom: 8.6,
      filter: ['all', ['==', ['get', 'class'], 'country'], rank === 99 ? ['>=', RANK, 4] : ['==', RANK, rank]] as Ex,
      layout: { ...hidden, 'text-field': NAME, 'text-font': FONT_BOLD, 'text-size': z(3, 10, 6, 13, 8, 15), 'text-letter-spacing': 0.14, 'text-max-width': 8, 'symbol-sort-key': RANK, ...caps },
      paint: { 'text-color': C.country, 'text-opacity': z(7.6, 1, 8.6, 0), ...base(1.1) },
    })),
    {
      // continents: spaced capitals, only on the world view. Last in the list = highest placement priority (MapLibre places later symbol layers first), so they win against capitals
      id: id('continent'), type: 'symbol', ...place, minzoom: 0, maxzoom: 3.8,
      filter: ['all', ['==', ['get', 'class'], 'continent'], ['!', ['in', ['get', 'name'], ['literal', ['Eurasia', 'Afro-Eurasia']]]]] as Ex,
      layout: { ...hidden, 'text-field': NAME, 'text-font': FONT, 'text-size': z(0, 12, 3, 20), 'text-letter-spacing': 0.32, 'text-max-width': 14, ...caps },
      paint: { 'text-color': C.continent, 'text-opacity': z(3, 1, 3.8, 0), ...base(1) },
    },
  ];
  return layers;
}

// Not covered by OpenFreeMap: (1) names of mountain ranges, plateaus, deserts and basins (Apple: spaced capitals along the range), and
// (2) capitals and big cities below zoom 2. Both would come from a small own overlay (Natural Earth populated places and
// geography regions), like the landfill overlay.
