// Points of interest (shops, food, sights, transport, services) from the OpenFreeMap vector tiles (OpenMapTiles layer `poi`,
// source `ofm` shared with the basemap, so no extra download). Round markers coloured by group with the name beside them,
// the most important places first as you zoom in; a click opens the card with type, address data and a link to OSM.
import { effect } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification, LayerSpecification } from 'maplibre-gl';
import type { InspectCard } from '../types';
import { defineLayer } from '../define';

interface Group { id: string; label: string; color: string; classes: string[] }

const GROUPS: Group[] = [
  { id: 'essen', label: 'Essen und Trinken', color: '#FF9A3D', classes: ['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'ice_cream', 'bakery', 'food_court', 'biergarten', 'butcher', 'confectionery'] },
  { id: 'einkaufen', label: 'Einkaufen', color: '#FFC83D', classes: ['shop', 'grocery', 'supermarket', 'clothing_store', 'department_store', 'mall', 'convenience', 'furniture', 'electronics', 'jewelry', 'florist', 'hairdresser', 'beauty', 'marketplace', 'bookstore', 'books', 'bicycle', 'sports'] },
  { id: 'kultur', label: 'Sehenswürdigkeiten und Kultur', color: '#B48CFF', classes: ['attraction', 'museum', 'art_gallery', 'gallery', 'theatre', 'cinema', 'monument', 'castle', 'zoo', 'theme_park', 'viewpoint', 'artwork', 'library', 'place_of_worship', 'information', 'town_hall', 'aquarium', 'arts_centre', 'music', 'ruins', 'memorial', 'garden'] },
  { id: 'unterkunft', label: 'Unterkunft', color: '#F472B6', classes: ['lodging', 'hotel', 'hostel', 'motel', 'campsite', 'guest_house', 'caravan_site'] },
  { id: 'verkehr', label: 'Verkehr', color: '#4DA3FF', classes: ['bus', 'railway', 'airport', 'harbor', 'ferry_terminal', 'parking', 'fuel', 'charging_station', 'bicycle_rental', 'bicycle_parking', 'car_rental', 'taxi', 'subway', 'tram', 'station'] },
  { id: 'gesundheit', label: 'Gesundheit und Dienste', color: '#4ADE80', classes: ['hospital', 'pharmacy', 'doctors', 'dentist', 'clinic', 'veterinary', 'bank', 'atm', 'post', 'police', 'fire_station', 'school', 'college', 'university', 'kindergarten', 'toilets', 'laundry'] },
  { id: 'freizeit', label: 'Freizeit und Sport', color: '#2DD4BF', classes: ['park', 'playground', 'stadium', 'swimming', 'pitch', 'sports_centre', 'fitness_centre', 'golf', 'nature_reserve', 'dog_park', 'swimming_pool', 'ice_rink', 'sport'] },
];
const OTHER = '#9AA7BD';

const colorOf: ExpressionSpecification = ['match', ['get', 'class'],
  ...GROUPS.flatMap((g) => [g.classes, g.color]), OTHER] as unknown as ExpressionSpecification;

// OpenMapTiles `rank` is the importance inside a tile (1 = most important): few places at city level, all of them close up.
const rankLimit: ExpressionSpecification = ['step', ['zoom'], 6, 13, 14, 14, 30, 15, 1000] as unknown as ExpressionSpecification;

const filterFor = (group: string): FilterSpecification => {
  const base: unknown[] = ['all', ['has', 'name'], ['<=', ['coalesce', ['get', 'rank'], 1], rankLimit]];
  const g = GROUPS.find((x) => x.id === group);
  if (g) base.push(['in', ['get', 'class'], ['literal', g.classes]]);
  return base as FilterSpecification;
};

const labelOf = (v: unknown): string => String(v ?? '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default defineLayer({
  id: 'orte',
  category: 'gesellschaft',
  title: 'Orte und Läden',
  summary: 'Restaurants, Geschäfte, Sehenswürdigkeiten, Haltestellen und Einrichtungen mit Namen',
  icon: 'pin',
  color: '#FF9A3D',
  form: 'points',
  cadence: 'static',
  coverage: 'Welt',
  minZoom: 12,
  sources: [{ name: 'OpenFreeMap / OpenStreetMap-Mitwirkende', url: 'https://openfreemap.org/', license: 'ODbL 1.0' }],
  options: [
    { id: 'gruppe', label: 'Art', type: 'select', default: 'alle', choices: [{ value: 'alle', label: 'Alle' }, ...GROUPS.map((g) => ({ value: g.id, label: g.label }))] },
  ],
  legend: { type: 'classes', items: GROUPS.map((g) => ({ color: g.color, label: g.label, shape: 'dot' as const })) },
  keywords: ['poi', 'points of interest', 'orte', 'läden', 'geschäfte', 'shops', 'restaurant', 'café', 'cafe', 'bar', 'hotel', 'sehenswürdigkeit', 'museum', 'supermarkt', 'apotheke', 'tankstelle', 'google maps', 'apple maps'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const dots = `${ctx.id}.dots`, names = `${ctx.id}.names`;
    ctx.map.addLayer({
      id: dots, type: 'circle', source: 'ofm', 'source-layer': 'poi', minzoom: 12, filter: filterFor('alle'),
      layout: { 'circle-sort-key': ['coalesce', ['get', 'rank'], 100] } as never,
      paint: {
        'circle-color': colorOf,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 15, 5, 18, 8] as ExpressionSpecification,
        'circle-stroke-color': 'rgba(10, 15, 24, 0.9)',
        'circle-stroke-width': 1.5,
      },
    } as LayerSpecification, 'points');
    ctx.map.addLayer({
      id: names, type: 'symbol', source: 'ofm', 'source-layer': 'poi', minzoom: 13.5, filter: filterFor('alle'),
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13.5, 10, 18, 13] as ExpressionSpecification,
        'text-anchor': 'left',
        'text-offset': [0.9, 0],
        'text-max-width': 8,
        'text-optional': true,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 100] as ExpressionSpecification,
      },
      paint: { 'text-color': colorOf, 'text-halo-color': 'rgba(10, 15, 24, 0.92)', 'text-halo-width': 1.6 },
    } as LayerSpecification, 'points');

    const off = ctx.map.onPick([dots, names], {
      click(f) {
        const p = (f.properties ?? {}) as Record<string, unknown>;
        const group = GROUPS.find((g) => g.classes.includes(String(p.class)));
        const kind = labelOf(p.subclass && p.subclass !== p.class ? p.subclass : p.class);
        const card: InspectCard = {
          title: String(p['name:latin'] ?? p.name ?? kind),
          subtitle: kind,
          color: group?.color ?? OTHER,
          asPlace: true,
          facts: [{ label: 'Art', value: kind, emphasis: true }, ...(p['name'] && p['name:latin'] && p.name !== p['name:latin'] ? [{ label: 'Name vor Ort', value: String(p.name) }] : [])],
          links: [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/#map=19/${(f.geometry as GeoJSON.Point).coordinates[1]}/${(f.geometry as GeoJSON.Point).coordinates[0]}` }],
        };
        if (f.geometry.type === 'Point') card.location = f.geometry.coordinates.slice(0, 2) as [number, number];
        ctx.select(card);
      },
    });

    const stop = effect(() => {
      const o = ctx.opacity.value;
      const filter = filterFor(String(ctx.options.value.gruppe ?? 'alle'));
      if (ml.getLayer(dots)) {
        ml.setFilter(dots, filter);
        ml.setPaintProperty(dots, 'circle-opacity', o);
        ml.setPaintProperty(dots, 'circle-stroke-opacity', o);
      }
      if (ml.getLayer(names)) {
        ml.setFilter(names, filter);
        ml.setPaintProperty(names, 'text-opacity', o);
      }
    });
    ctx.status({ state: 'ready', note: 'Ab Zoom 12 sichtbar, Namen ab 13,5' });
    return { destroy: () => { off(); stop(); ctx.map.remove({ layers: [names, dots] }); } };
  },
});
