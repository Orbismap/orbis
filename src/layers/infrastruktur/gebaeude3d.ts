// "3D-Gebäude": the collection point for everything 3D-building-like (OSM buildings with their colours now; photo mesh, LOD models
// and more later). The option "Typ" picks what is shown:
//   osm      OSM buildings from the OpenFreeMap tiles (source `ofm`, shared with the basemap): building parts at their own height,
//            outlines with parts hidden (`hide_3d`), the colour OSM knows (`colour`: building:colour / colour). It replaces the
//            plain 2.5D buildings of the basemap switch.
//   plateau  the streamed Plateau city models of Japan (3D Tiles, Orbis Pro draws them); the 2.5D buildings go while one is in view.
// Roofs and building parts are no type: with Orbis Pro the layer (type OSM) draws its buildings with them in the close view (features/buildings3d/roofs-source.ts).
// The basemap switch "3D-Gebäude" is separate: plain OSM 2.5D buildings and the Cesium 3D tiles on aerial images.
import { effect, signal } from '@preact/signals';
import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import { loadPlateau, PLATEAU_ATTRIBUTION, type PlateauSample } from '../../data/plateau';
import { buildingsChannel, setTilesetSource, tilesetsChannel } from '../../ext/channels';
import { proEnabled } from '../../ext/licence';
import { proAvailable } from '../../ext/loader';
import { BUILDING_BASE, BUILDING_FILTER, BUILDING_HEIGHT, OFM_BUILDINGS_SOURCE_ID } from '../../map/buildings-tilt';
import { buildingColour, buildingsColoured, buildingsDetailed, buildingsLayerOn, buildingsReplaced } from '../../state/view';
import { defineLayer } from '../define';

const COLOR = '#B9A58C';
/** Buildings without a colour in OSM. */
const PLAIN = '#d6dae3';
const OSM_COLORED = '#c4825a';
const PLATEAU_COLOR = '#7FA6C9';
const SOURCE = 'plateau';
const CREDIT = 'gebaeude3d-plateau-attribution';

type Typ = 'osm' | 'plateau';
const TYPES: { value: Typ; label: string }[] = [
  { value: 'osm', label: 'OSM Dächer' },
  { value: 'plateau', label: 'Plateau (Japan)' },
];
const asTyp = (v: unknown): Typ => (v === 'plateau' ? v : 'osm');

export default defineLayer({
  id: 'gebaeude3d',
  category: 'infrastruktur',
  title: '3D-Gebäude',
  summary: 'Gebäude in 3D mit Gebäudeteilen: OSM mit ihren Farben, Japan als Stadtmodell (Plateau)',
  icon: 'building',
  color: COLOR,
  form: 'areas',
  cadence: 'static',
  minZoom: 14,
  coverage: 'Welt (OSM), Japan (Plateau)',
  sources: [
    { name: 'OpenFreeMap / OpenStreetMap-Mitwirkende ', url: 'https://openfreemap.org/', license: 'ODbL 1.0' },
    { name: PLATEAU_ATTRIBUTION, url: 'https://www.mlit.go.jp/plateau/', license: 'CC BY 4.0' },
  ],
  options: [
    { id: 'typ', label: 'Typ', type: 'select', default: 'osm', choices: TYPES },
    // for the OSM buildings, 2.5D and with Orbis Pro alike: the colour OSM knows, or all in one plain colour
    { id: 'farben', label: 'Eingefärbt (Farben aus OSM)', type: 'toggle', default: true },
  ],
  legend: (o) => (asTyp(o.typ) === 'plateau'
    ? { type: 'classes', items: [{ color: PLATEAU_COLOR, label: 'Stadtmodell Japan (mit Orbis Pro)', shape: 'square' }] }
    : o.farben === false
      ? { type: 'classes', items: [{ color: PLAIN, label: 'Alle Gebäude einfarbig', shape: 'square' }] }
      : { type: 'classes', items: [{ color: OSM_COLORED, label: 'Farbe wie in OSM eingetragen', shape: 'square' }, { color: PLAIN, label: 'Keine Farbe in OSM', shape: 'square' }] }),
  keywords: ['gebäude', '3d', 'haus', 'häuser', 'gebäudeteile', 'dach', 'dachform', 'satteldach', 'walmdach', 'kuppel', 'roof', 'building:part', 'building', 'buildings', 'osm', 'farbe', 'plateau', 'japan', 'tokio', 'stadtmodell', 'fotomesh', 'lod'],

  mount(ctx) {
    const ml = ctx.map.ml;
    buildingsLayerOn.value = true;
    const typ = () => asTyp(ctx.options.value.typ);
    const coloured = () => ctx.options.value.farben !== false;
    const layerId = `${ctx.id}.osm`;
    ctx.map.addLayer({
      id: layerId, type: 'fill-extrusion', source: OFM_BUILDINGS_SOURCE_ID, 'source-layer': 'building', minzoom: 13.5, filter: BUILDING_FILTER,
      layout: { visibility: 'none', 'fill-extrusion-rounded-corner-distance': 1.5 },
      paint: {
        // `colour` is a hex value or a CSS colour name; the missing ones get the plain building colour
        'fill-extrusion-color': ['coalesce', ['get', 'colour'], PLAIN] as ExpressionSpecification,
        'fill-extrusion-height': BUILDING_HEIGHT,
        'fill-extrusion-base': BUILDING_BASE,
        'fill-extrusion-opacity': 1,
        'fill-extrusion-vertical-gradient': true,
      },
    } as LayerSpecification, 'lines');

    const plateau = signal<readonly PlateauSample[]>([]);
    let asked = false;
    const stop = [
      // the OSM buildings
      effect(() => {
        const on = typ() === 'osm';
        if (ml.getLayer(layerId)) {
          // with Orbis Pro the detailed buildings (roofs-source.ts) take over from zoom 13.5: then this layer steps aside too
          ml.setLayoutProperty(layerId, 'visibility', on && !buildingsChannel.presented.value ? 'visible' : 'none');
          ml.setPaintProperty(layerId, 'fill-extrusion-opacity', ctx.opacity.value);
          // `colour` is a hex value or a CSS colour name; the others (and all, without the option) get the colour of the basemap's 2.5D buildings
          ml.setPaintProperty(layerId, 'fill-extrusion-color', (coloured() ? ['coalesce', ['get', 'colour'], buildingColour.value] : buildingColour.value) as ExpressionSpecification);
        }
        buildingsReplaced.value = on;
        buildingsDetailed.value = on;
        buildingsColoured.value = coloured();
        ctx.status({ state: 'ready' });
      }),
      // the Plateau models (Orbis Pro streams them)
      effect(() => {
        const on = typ() === 'plateau';
        if (!on) { setTilesetSource(SOURCE, null); return; }
        if (!proAvailable || !proEnabled.value) {
          ctx.status({ state: 'empty', note: 'Die Plateau-Stadtmodelle zeichnet Orbis Pro.' });
          setTilesetSource(SOURCE, null);
          return;
        }
        ctx.status({ state: 'ready' });
        if (!asked) { asked = true; void loadPlateau().then((all) => { plateau.value = all; }); }
        const all = plateau.value;
        setTilesetSource(SOURCE, () => [...all]);
      }),
      // while a model is in view the 2.5D buildings of the basemap give way; the credit line sits in the corner of the map
      effect(() => {
        const shown = typ() === 'plateau' && tilesetsChannel.presented.value;
        if (typ() === 'plateau') buildingsReplaced.value = shown;
        if (!shown) return;
        ctx.map.addSource(CREDIT, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: `<a href="https://www.mlit.go.jp/plateau/" target="_blank" rel="noopener">${PLATEAU_ATTRIBUTION}</a>` });
        ctx.map.addLayer({ id: `${CREDIT}-layer`, type: 'circle', source: CREDIT, paint: { 'circle-radius': 0 } } as LayerSpecification, 'points');
        return () => ctx.map.remove({ layers: [`${CREDIT}-layer`], sources: [CREDIT] });
      }),
    ];
    return {
      destroy: () => {
        for (const s of stop) s();
        setTilesetSource(SOURCE, null);
        buildingsReplaced.value = false;
        buildingsDetailed.value = false;
        buildingsColoured.value = true;
        buildingsLayerOn.value = false;
        ctx.map.remove({ layers: [layerId] });
      },
    };
  },
});
