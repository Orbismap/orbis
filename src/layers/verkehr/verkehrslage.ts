// Live traffic flow from TomTom (vector tiles, own key required): roads green (free), yellow (slow), red (jam),
// purple (closed). The key lives only in the tile URL requested by the browser; it is never logged or shown.
import { effect } from '@preact/signals';
import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import { defineLayer } from '../define';

const COLORS = { free: '#2ecc71', slow: '#f0b23e', jam: '#e05252', closed: '#a15cff' };

/** The key; if a whole tile URL was pasted, `key=…` is read from it. */
const cleanKey = (raw: string | undefined): string => {
  const v = (raw ?? '').trim();
  return /^https?:/i.test(v) ? (/[?&]key=([^&\s]+)/i.exec(v)?.[1] ?? '') : v;
};

export default defineLayer({
  id: 'verkehrslage',
  category: 'verkehr',
  title: 'Verkehrslage',
  summary: 'Straßen live nach Verkehrsfluss: grün frei, gelb zäh, rot Stau (mit Schlüssel)',
  icon: 'car',
  color: '#e05252',
  form: 'lines',
  cadence: 'minutes',
  coverage: 'Welt',
  minZoom: 8,
  sources: [{ name: 'TomTom Traffic Flow (mit eigenem Schlüssel)', url: 'https://developer.tomtom.com/traffic-api/documentation/traffic-flow/vector-flow-tiles', license: 'Verkehrslage © TomTom, nur im Browser' }],
  legend: { type: 'classes', items: [
    { color: COLORS.free, label: 'Freie Fahrt', shape: 'line' }, { color: COLORS.slow, label: 'Zäher Verkehr', shape: 'line' },
    { color: COLORS.jam, label: 'Stau', shape: 'line' }, { color: COLORS.closed, label: 'Gesperrt', shape: 'line' },
  ] },
  keys: [{ id: 'tomtom', required: true }],
  keywords: ['verkehrslage', 'stau', 'verkehr', 'traffic', 'tomtom', 'flow', 'live-verkehr'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const key = ctx.key('tomtom');
    const src = `${ctx.id}-src`;
    const layerId = `${ctx.id}-flow`;
    let failure = '';
    const onError = (e: { sourceId?: string; error?: { status?: number } }) => {
      if (e.sourceId !== src) return;
      const st = e.error?.status;
      failure = st === 401 || st === 403 ? 'TomTom lehnt den Schlüssel ab (ungültig oder ohne Traffic-API)' : st === 429 ? 'TomTom-Kontingent erschöpft' : 'TomTom-Kacheln nicht ladbar';
      ctx.status({ state: 'error', note: failure });
    };
    ml.on('error', onError as never);
    const drop = () => ctx.map.remove({ layers: [layerId], sources: [src] });

    const stop = effect(() => {
      const k = cleanKey(key.value);
      drop();
      failure = '';
      if (!k) { ctx.status({ state: 'error', note: 'Im Schlüsselfeld steht ein Link ohne Schlüssel' }); return; }
      ctx.map.addSource(src, {
        type: 'vector', tiles: [`https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.pbf?key=${encodeURIComponent(k)}`],
        minzoom: 8, maxzoom: 16, attribution: 'Verkehrslage © <a href="https://www.tomtom.com/" target="_blank" rel="noopener">TomTom</a>',
      });
      ctx.map.addLayer({
        id: layerId, type: 'line', source: src, 'source-layer': 'Traffic flow', minzoom: 8,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 12, 2.5, 16, 6] as ExpressionSpecification,
          'line-opacity': 0.8,
          'line-color': ['case', ['==', ['get', 'road_closure'], true], COLORS.closed, ['step', ['coalesce', ['get', 'traffic_level'], 1], COLORS.jam, 0.55, COLORS.slow, 0.85, COLORS.free]] as ExpressionSpecification,
        },
      } as LayerSpecification, 'lines');
      ctx.status({ state: 'ready', updatedAt: Date.now(), note: 'Kacheln live von TomTom' });
    });
    const stopOpacity = effect(() => {
      const o = ctx.opacity.value;
      if (ml.getLayer(layerId)) ml.setPaintProperty(layerId, 'line-opacity', 0.8 * o);
    });
    // TomTom tiles are fresh for about a minute: reload them while the layer is visible
    const timer = setInterval(() => {
      if (document.hidden) return;
      const s = ml.getSource(src) as { reload?: () => void } | undefined;
      s?.reload?.();
    }, 120_000);
    return { destroy: () => { clearInterval(timer); stop(); stopOpacity(); ml.off('error', onError as never); drop(); } };
  },
});
