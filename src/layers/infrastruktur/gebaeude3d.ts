// "3D-Gebäude": the collection point for everything 3D-building-like (OSM buildings with their colours now; photo mesh, LOD models
// and more later). The option "Typ" picks what is shown:
//   osm      OSM buildings from the OpenFreeMap tiles (source `ofm`, shared with the basemap): building parts at their own height,
//            outlines with parts hidden (`hide_3d`), the colour OSM knows (`colour`: building:colour / colour). It replaces the
//            plain 2.5D buildings of the basemap switch.
//   dach     OSM buildings with their roof shapes and building parts (Simple 3D Buildings): footprints and tags from the self-hosted PMTiles
//            `roofs` (only buildings with a roof tag) for the view (from zoom 16), Orbis Pro models walls and roofs in 3D; the 2.5D buildings
//            of OpenFreeMap stay for everything else.
//   plateau  the streamed Plateau city models of Japan (3D Tiles, Orbis Pro draws them); the 2.5D buildings go while one is in view.
// The basemap switch "3D-Gebäude" is separate: plain OSM 2.5D buildings and the Cesium 3D tiles on aerial images.
import { effect, signal } from '@preact/signals';
import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import { loadPlateau, PLATEAU_ATTRIBUTION, type PlateauSample } from '../../data/plateau';
import { osmPmtilesUrl } from '../../data/osmfiles';
import { roofSamples } from '../../data/parsers/roofs-tiles';
import { buildingsChannel, setTilesetSource, tilesetsChannel } from '../../ext/channels';
import { proEnabled } from '../../ext/licence';
import { proAvailable } from '../../ext/loader';
import { BUILDING_BASE, BUILDING_FILTER, BUILDING_HEIGHT } from '../../map/buildings-tilt';
import { ensurePmtilesProtocol } from '../../map/pmtiles-protocol';
import { buildingsReplaced } from '../../state/view';
import { defineLayer } from '../define';

const COLOR = '#B9A58C';
/** Buildings without a colour in OSM. */
const PLAIN = '#d6dae3';
const OSM_COLORED = '#c4825a';
const PLATEAU_COLOR = '#7FA6C9';
const ROOF_COLOR = '#A0624E';
/** The roofs come from the PMTiles (zoom 15, overzoomed); the model is drawn from this zoom on, below it the 2.5D buildings are enough. */
const ROOF_MIN_ZOOM = 16;
const ROOF_SRC = 'gebaeude3d-roofs';
const ROOF_SCAN_DELAY_MS = 250;
const SOURCE = 'plateau';
const CREDIT = 'gebaeude3d-plateau-attribution';

type Typ = 'osm' | 'dach' | 'plateau';
const TYPES: { value: Typ; label: string }[] = [
  { value: 'osm', label: 'OSM eingefärbt' },
  { value: 'dach', label: 'Dachformen (Orbis Pro)' },
  { value: 'plateau', label: 'Plateau (Japan)' },
];
const asTyp = (v: unknown): Typ => (v === 'plateau' || v === 'dach' ? v : 'osm');

export default defineLayer({
  id: 'gebaeude3d',
  category: 'infrastruktur',
  title: '3D-Gebäude',
  summary: 'Gebäude in 3D mit Gebäudeteilen: OSM mit ihren Farben oder mit Dachformen (Orbis Pro), Japan als Stadtmodell (Plateau)',
  icon: 'building',
  color: COLOR,
  form: 'areas',
  cadence: 'static',
  minZoom: 14,
  coverage: 'Welt (OSM), Japan (Plateau)',
  sources: [
    { name: 'OpenFreeMap / OpenStreetMap-Mitwirkende (Dachformen: Orbis-Datenbestand aus OSM)', url: 'https://openfreemap.org/', license: 'ODbL 1.0' },
    { name: PLATEAU_ATTRIBUTION, url: 'https://www.mlit.go.jp/plateau/', license: 'CC BY 4.0' },
  ],
  options: [{ id: 'typ', label: 'Typ', type: 'select', default: 'osm', choices: TYPES }],
  legend: (o) => (asTyp(o.typ) === 'plateau'
    ? { type: 'classes', items: [{ color: PLATEAU_COLOR, label: 'Stadtmodell Japan (mit Orbis Pro)', shape: 'square' }] }
    : asTyp(o.typ) === 'dach'
    ? { type: 'classes', items: [{ color: ROOF_COLOR, label: 'Dach mit Form (roof:shape) und Höhe aus OSM', shape: 'square' }, { color: OSM_COLORED, label: 'Wandfarbe wie in OSM eingetragen', shape: 'square' }, { color: PLAIN, label: 'Ohne Angabe: Flachdach, Höhe nach Etagen', shape: 'square' }] }
    : { type: 'classes', items: [{ color: OSM_COLORED, label: 'Farbe wie in OSM eingetragen', shape: 'square' }, { color: PLAIN, label: 'Keine Farbe in OSM', shape: 'square' }] }),
  keywords: ['gebäude', '3d', 'haus', 'häuser', 'gebäudeteile', 'dach', 'dachform', 'satteldach', 'walmdach', 'kuppel', 'roof', 'building:part', 'building', 'buildings', 'osm', 'farbe', 'plateau', 'japan', 'tokio', 'stadtmodell', 'fotomesh', 'lod'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const typ = () => asTyp(ctx.options.value.typ);
    const layerId = `${ctx.id}.osm`;
    ctx.map.addLayer({
      id: layerId, type: 'fill-extrusion', source: 'ofm', 'source-layer': 'building', minzoom: 13.5, filter: BUILDING_FILTER,
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
          ml.setLayoutProperty(layerId, 'visibility', on ? 'visible' : 'none');
          ml.setPaintProperty(layerId, 'fill-extrusion-opacity', ctx.opacity.value);
        }
        buildingsReplaced.value = on;
        ctx.status({ state: 'ready' });
      }),
      // the roof shapes: footprints and tags from the PMTiles go to Orbis Pro, which models them
      effect(() => {
        if (typ() !== 'dach') return;
        if (!proAvailable || !proEnabled.value) { ctx.status({ state: 'empty', note: 'Die Dachformen zeichnet Orbis Pro.' }); return; }
        ctx.status({ state: 'loading' });
        let dead = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let published = false;
        const scan = () => {
          timer = undefined;
          if (dead || !ml.getSource(ROOF_SRC)) return;
          if (ml.getZoom() < ROOF_MIN_ZOOM) {
            if (published) { published = false; buildingsChannel.reset(); }
            ctx.status({ state: 'ready', note: `Ab Zoomstufe ${ROOF_MIN_ZOOM}` });
            return;
          }
          // while tiles load the query sees few buildings: publishing that would make the roofs flicker
          if (!ml.isSourceLoaded(ROOF_SRC)) return;
          const items = roofSamples(ml.querySourceFeatures(ROOF_SRC, { sourceLayer: 'roofs' }));
          published = true;
          buildingsChannel.publish(() => items);
          const roofs = items.filter((b) => b.tags['roof:shape'] && b.tags['roof:shape'] !== 'flat').length;
          ctx.status(items.length
            ? { state: 'ready', count: items.length, note: `${roofs} mit Dachform, ${items.filter((b) => b.part).length} Gebäudeteile` }
            : { state: 'empty', note: 'Hier sind keine Dachformen in OSM eingetragen (oder noch nicht im Datenbestand).' });
        };
        const schedule = () => { if (timer === undefined) timer = setTimeout(scan, ROOF_SCAN_DELAY_MS); };
        const onSource = (e: { sourceId?: string }) => { if (e.sourceId === ROOF_SRC) schedule(); };
        // the footprints and tags come from the self-hosted PMTiles (zoom 15, overzoomed); the fill is invisible, but a layer keeps the tiles loaded
        void Promise.all([ensurePmtilesProtocol(), osmPmtilesUrl('roofs')]).then(([, url]) => {
          if (dead || ctx.signal.aborted) return;
          ctx.map.addSource(ROOF_SRC, { type: 'vector', url: `pmtiles://${url}`, attribution: '© OpenStreetMap-Mitwirkende' });
          ctx.map.addLayer({ id: ROOF_SRC, type: 'fill', source: ROOF_SRC, 'source-layer': 'roofs', minzoom: ROOF_MIN_ZOOM - 1, paint: { 'fill-opacity': 0 } } as LayerSpecification, 'areas');
          ml.on('sourcedata', onSource as never);
          ml.on('moveend', schedule);
          schedule();
        });
        // the 2.5D buildings stay (OpenFreeMap): the tiles carry only buildings with a roof tag, the rest keeps its flat extrusion
        return () => {
          dead = true;
          clearTimeout(timer);
          ml.off('sourcedata', onSource as never);
          ml.off('moveend', schedule);
          ctx.map.remove({ layers: [ROOF_SRC], sources: [ROOF_SRC] });
          buildingsChannel.reset();
        };
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
        ctx.map.remove({ layers: [layerId] });
      },
    };
  },
});
