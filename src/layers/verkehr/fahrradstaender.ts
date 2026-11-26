// Bicycle parking from OpenStreetMap (fahrradparken.pmtiles, zoom 0-14): counted clusters below zoom 10, then a point per parking,
// from close up also the outlines of those mapped as areas. Colours, filters, counters and card texts are in data/bikeparking.ts.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { PARKING_COLORS, PARKING_STEPS, parkingCard, parkingColor, parkingCountKey, parkingFilter, type BikeParkingProps } from '../../data/bikeparking';
import { osmPmtilesUrl } from '../../data/osmfiles';
import { ensurePmtilesProtocol } from '../../map/pmtiles-protocol';
import { vectorTileLayer } from '../../render/vectortiles';
import { routeMode, routeTo } from '../../state/routes';
import { defineLayer } from '../define';

/** single parkings from here on, clusters below */
const POINT_ZOOM = 10;
const MAX_ZOOM = 14;
const OUTLINE_ZOOM = 15;
const ATTRIBUTION = '© OpenStreetMap-Mitwirkende (ODbL)';

export default defineLayer({
  id: 'fahrradstaender',
  category: 'verkehr',
  title: 'Fahrradständer',
  summary: 'Fahrradparkplätze mit Bauart, Stellplätzen und Überdachung aus OpenStreetMap, einzeln ab Zoomstufe 10',
  icon: 'bike',
  color: PARKING_COLORS.covered,
  form: 'points',
  cadence: 'static',
  sources: [{ name: 'OpenStreetMap-Mitwirkende (Monatsauszug)', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0' }],
  options: [
    { id: 'covered', label: 'Nur überdachte', type: 'toggle', default: false },
    { id: 'public', label: 'Nur öffentlich zugängliche', type: 'toggle', default: false },
    { id: 'capacity', label: 'Stellplätze', type: 'select', default: '0', choices: [{ value: '0', label: 'Alle' }, ...PARKING_STEPS.map((n) => ({ value: String(n), label: `Mindestens ${n}` }))] },
  ],
  legend: { type: 'classes', items: [
    { color: PARKING_COLORS.covered, label: 'überdacht' },
    { color: PARKING_COLORS.open, label: 'nicht überdacht' },
    { color: PARKING_COLORS.unknown, label: 'teilweise oder unbekannt' },
    { color: '#243044', label: 'Zahl: Anlagen im Gebiet (weiter herausgezoomt)' },
  ] },
  keywords: ['fahrradständer', 'fahrradparkplatz', 'fahrrad abstellen', 'radständer', 'fahrradbügel', 'abstellanlage', 'fahrradbox', 'bike rack', 'bicycle parking', 'fahrrad'],

  async mount(ctx) {
    const [url] = await Promise.all([osmPmtilesUrl('fahrradparken'), ensurePmtilesProtocol()]);
    // switched off while the file name was looked up: add nothing
    if (ctx.signal.aborted) return { destroy() {} };
    const filter = computed(() => parkingFilter(ctx.options.value));
    return vectorTileLayer(ctx, {
      tiles: `pmtiles://${url}/{z}/{x}/{y}`, minzoom: 0, maxzoom: MAX_ZOOM,
      attribution: ATTRIBUTION, idKey: 'id', errorNote: 'Fahrradständer-Kacheln nicht ladbar',
      clusters: { sourceLayer: 'fahrradparken_cluster', count: computed(() => parkingCountKey(ctx.options.value)), maxZoom: POINT_ZOOM },
      parts: [
        { id: 'flaechen', sourceLayer: 'fahrradparken_flaechen', kind: 'fill', color: parkingColor, minZoom: OUTLINE_ZOOM, filter },
        {
          id: 'punkte', sourceLayer: 'fahrradparken', kind: 'circle', color: parkingColor, minZoom: POINT_ZOOM, filter,
          size: ['interpolate', ['linear'], ['zoom'], POINT_ZOOM, 1.4, 13, 3, 15, 5, 18, 9] as ExpressionSpecification,
        },
      ],
      describe(f) {
        const card = parkingCard(f.properties as BikeParkingProps);
        card.actions = [{
          id: 'route', label: 'Route hierhin', icon: 'navigate',
          run() {
            // the location is set by the tile layer after this card was made
            if (!card.location) return;
            const [lng, lat] = card.location;
            routeMode.value = 'bike';
            routeTo({ title: card.title, subtitle: card.subtitle, lng, lat });
          },
        }];
        return card;
      },
    });
  },
});
