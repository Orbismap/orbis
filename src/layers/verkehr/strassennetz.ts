// Road network with road numbers from the OpenFreeMap vector tiles (source `ofm`, shared with the basemap, so no
// extra download): motorways to secondary roads coloured by class, road numbers as labels along the lines.
import { effect } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification, LayerSpecification } from 'maplibre-gl';
import { defineLayer } from '../define';

const CLASSES = [
  { id: 'motorway', label: 'Autobahn', color: '#ff4d4d', halo: '#b02a2a', minzoom: 3, width: [3, 0.7, 14, 7] },
  { id: 'trunk', label: 'Schnellstraße', color: '#ff8a5c', halo: '#c4501f', minzoom: 4, width: [4, 0.6, 14, 6] },
  { id: 'primary', label: 'Bundesstraße', color: '#ffb84d', halo: '#b87a14', minzoom: 6, width: [6, 0.6, 14, 5] },
  { id: 'secondary', label: 'Landstraße', color: '#ffe082', halo: '#a88a1e', minzoom: 8, width: [8, 0.6, 14, 4] },
] as const;

export default defineLayer({
  id: 'strassennetz',
  category: 'verkehr',
  title: 'Straßennetz',
  summary: 'Autobahnen bis Landstraßen mit Straßennummern',
  icon: 'car',
  color: '#ff8a5c',
  form: 'lines',
  cadence: 'static',
  coverage: 'Welt',
  sources: [{ name: 'OpenFreeMap / OpenStreetMap-Mitwirkende', url: 'https://openfreemap.org/', license: 'ODbL 1.0' }],
  options: [
    { id: 'detail', label: 'Straßen bis', type: 'select', default: 'secondary', choices: [{ value: 'primary', label: 'Bundesstraße' }, { value: 'secondary', label: 'Landstraße' }] },
  ],
  legend: { type: 'classes', items: CLASSES.map((c) => ({ color: c.color, label: c.label, shape: 'line' as const })) },
  keywords: ['straße', 'straßennetz', 'autobahn', 'bundesstraße', 'landstraße', 'straßennummer', 'roads', 'highway', 'motorway', 'a7', 'b1'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const ids: string[] = [];
    for (const c of CLASSES) {
      const id = `${ctx.id}.${c.id}`;
      ids.push(id);
      const spec = {
        id, type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: c.minzoom,
        filter: ['all', ['==', ['get', 'class'], c.id], ['!=', ['get', 'ramp'], 1]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': c.color,
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], c.width[0], c.width[1], c.width[2], c.width[3]] as ExpressionSpecification,
          'line-opacity': ['case', ['==', ['get', 'brunnel'], 'tunnel'], 0.45, 0.9] as ExpressionSpecification,
        },
      } as LayerSpecification;
      ctx.map.addLayer(spec, 'lines');
    }
    const labels = `${ctx.id}.ref`;
    ctx.map.addLayer({
      id: labels, type: 'symbol', source: 'ofm', 'source-layer': 'transportation_name', minzoom: 6,
      filter: ['all', ['has', 'ref'], ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]]],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 400, 'text-field': ['get', 'ref'], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-rotation-alignment': 'viewport' },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': ['match', ['get', 'class'], 'motorway', '#1565c0', 'trunk', '#c62828', 'primary', '#ef6c00', '#8a6d1a'] as ExpressionSpecification,
        'text-halo-width': 3,
      },
    } as LayerSpecification, 'lines');
    ids.push(labels);

    const stop = effect(() => {
      const o = ctx.opacity.value;
      const upTo = ctx.options.value.detail === 'primary' ? 3 : 4;
      CLASSES.forEach((c, i) => {
        const id = `${ctx.id}.${c.id}`;
        if (!ml.getLayer(id)) return;
        ml.setLayoutProperty(id, 'visibility', i < upTo ? 'visible' : 'none');
        ml.setPaintProperty(id, 'line-opacity', ['*', ['case', ['==', ['get', 'brunnel'], 'tunnel'], 0.45, 0.9], o] as ExpressionSpecification);
      });
      if (ml.getLayer(labels)) {
        ml.setPaintProperty(labels, 'text-opacity', o);
        ml.setFilter(labels, ['all', ['has', 'ref'], ['in', ['get', 'class'], ['literal', CLASSES.slice(0, upTo).map((c) => c.id)]]] as FilterSpecification);
      }
    });
    ctx.status({ state: 'ready' });
    return { destroy: () => { stop(); ctx.map.remove({ layers: [...ids].reverse() }); } };
  },
});
