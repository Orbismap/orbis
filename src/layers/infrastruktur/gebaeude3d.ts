// 3D buildings from the OpenFreeMap vector tiles (source `ofm`, shared with the basemap, so no extra download).
// The Orbis dark/light basemaps already draw the same buildings by default; this layer adds them to the other basemaps
// (satellite, terrain, Blue Marble) and stays out of the way on the Orbis ones so nothing is drawn twice.
import { effect } from '@preact/signals';
import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import { BUILDING_BASE, BUILDING_HEIGHT } from '../../map/buildings-tilt';
import { defineLayer } from '../define';

const COLOR = '#d6dae3';
const MAX_OPACITY = 0.85;

export default defineLayer({
  id: 'gebaeude3d',
  category: 'infrastruktur',
  title: '3D-Gebäude',
  summary: 'Gebäude in ihrer Höhe, auch auf Satelliten- und Geländekarte; Neigung der Karte zeigt sie auf',
  icon: 'map',
  color: COLOR,
  form: 'areas',
  cadence: 'static',
  coverage: 'Welt',
  minZoom: 14,
  sources: [{ name: 'OpenFreeMap / OpenStreetMap-Mitwirkende', url: 'https://openfreemap.org/', license: 'ODbL 1.0' }],
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Gebäude (Höhe aus OpenStreetMap, sonst geschätzt)', shape: 'square' }] },
  keywords: ['gebäude', 'häuser', '3d', 'haus', 'bauwerke', 'stadt', 'buildings', 'extrusion', 'satellit'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const id = `${ctx.id}.building`;
    ctx.map.addLayer({
      id, type: 'fill-extrusion', source: 'ofm', 'source-layer': 'building', minzoom: 13.5,
      layout: { 'fill-extrusion-rounded-corner-distance': 1.5 },
      paint: {
        'fill-extrusion-color': COLOR,
        'fill-extrusion-height': BUILDING_HEIGHT,
        'fill-extrusion-base': BUILDING_BASE,
        'fill-extrusion-opacity': MAX_OPACITY,
        'fill-extrusion-vertical-gradient': true,
      },
    } as LayerSpecification, 'lines');

    // the Orbis basemaps bring their own buildings
    const sync = () => {
      if (!ml.getLayer(id)) return;
      const own = ctx.map.getBasemap().startsWith('orbis-');
      const want = own ? 'none' : 'visible';
      if (ml.getLayoutProperty(id, 'visibility') !== want) ml.setLayoutProperty(id, 'visibility', want);
    };
    ml.on('styledata', sync);
    ml.on('idle', sync);
    sync();
    const stop = effect(() => {
      const o = ctx.opacity.value;
      if (ml.getLayer(id)) ml.setPaintProperty(id, 'fill-extrusion-opacity', MAX_OPACITY * o as unknown as ExpressionSpecification);
    });
    ctx.status({ state: 'ready' });
    return { destroy: () => { stop(); ml.off('styledata', sync); ml.off('idle', sync); ctx.map.remove({ layers: [id] }); } };
  },
});
