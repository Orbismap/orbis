// Bathymetry worldwide from Terrarium elevation tiles (Mapzen/AWS Open Data, CORS open, GEBCO/ETOPO1 based in the
// oceans): MapLibre colours them with a depth ramp that is fully transparent above sea level (a `color-relief` layer on
// a `raster-dem` source), plus an optional hillshade (which also shades land, hence off by default). GEBCO's own WMS currently answers every GetMap with
// a server-side XML error, so it is not used. EMODnet (115 m, Europe) is an option for close-up views.
import type { LayerSpecification } from 'maplibre-gl';
import { formatInt } from '../../core/format';
import { bindOpacity, Cleanup, idBase } from '../../render/common';
import { defineLayer } from '../define';

/** depth in m -> colour; stops equally spaced in the legend, labels name the depths */
const DEPTHS = [0, 10, 50, 200, 1000, 2000, 4000, 6000, 8000];
const RAMP: [number, string][] = [
  [0, 'rgba(150, 226, 232, 0.78)'], [10, 'rgba(112, 208, 226, 0.82)'], [50, 'rgba(70, 178, 220, 0.86)'], [200, 'rgba(44, 134, 205, 0.9)'],
  [1000, 'rgba(36, 92, 178, 0.92)'], [2000, 'rgba(34, 64, 150, 0.94)'], [4000, 'rgba(30, 40, 118, 0.95)'], [6000, 'rgba(22, 24, 84, 0.96)'], [8000, 'rgba(12, 10, 52, 0.97)'],
];
const TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];
const ATTRIBUTION = 'Meerestiefe: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Mapzen Terrain Tiles</a> (GEBCO, ETOPO1 u. a., nicht zur Navigation)';

export default defineLayer({
  id: 'meerestiefe',
  category: 'meer',
  title: 'Meerestiefe',
  summary: 'Tiefe des Meeresbodens weltweit, Farbstufen und Schummerung, nur Meer, nicht zur Navigation',
  icon: 'anchor',
  color: '#24CECC',
  form: 'raster',
  cadence: 'static',
  coverage: 'Meere',
  sources: [
    { name: 'Terrarium Terrain Tiles (Mapzen, AWS Open Data; Meeresboden aus GEBCO und ETOPO1)', url: 'https://registry.opendata.aws/terrain-tiles/', license: 'frei nutzbar, Quellen u. a. GEBCO, NOAA' },
    { name: 'EMODnet Bathymetry (optional, Europa)', url: 'https://emodnet.ec.europa.eu/en/bathymetry', license: 'CC BY 4.0, EMODnet Bathymetry Consortium' },
  ],
  options: [
    { id: 'shade', label: 'Schummerung (auch an Land)', type: 'toggle', default: false },
    { id: 'emodnet', label: 'EMODnet Europa (genauer, eigene Farben)', type: 'toggle', default: false },
  ],
  legend: {
    type: 'scale', unit: 'Wassertiefe in m',
    stops: RAMP.map(([, c], i) => [i, c.replace(/rgba\((\d+), (\d+), (\d+), [\d.]+\)/, 'rgb($1, $2, $3)')] as [number, string]),
    ticks: DEPTHS.map((_, i) => i), format: (v) => formatInt(DEPTHS[Math.round(v)] ?? 0),
  },
  keywords: ['tiefe', 'bathymetrie', 'gebco', 'emodnet', 'meeresboden', 'tiefsee', 'seekarte', 'graben', 'ozean'],

  mount(ctx) {
    const engine = ctx.map;
    const ml = engine.ml;
    const base = idBase(ctx);
    const clean = new Cleanup();
    const dem = `${base}-dem`;
    const relief = `${base}-relief`;
    const shade = `${base}-shade`;
    const emo = `${base}-emodnet`;
    const emoSrc = `${base}-emodnet-src`;

    engine.addSource(dem, { type: 'raster-dem', tiles: TILES, tileSize: 256, maxzoom: 12, encoding: 'terrarium', attribution: ATTRIBUTION });
    // elevation >= 0 is fully transparent: only the water is coloured
    engine.addLayer({
      id: relief, type: 'color-relief', source: dem,
      paint: {
        'color-relief-opacity': 1,
        'color-relief-color': ['interpolate', ['linear'], ['elevation'],
          -8000, RAMP[8]![1], -6000, RAMP[7]![1], -4000, RAMP[6]![1], -2000, RAMP[5]![1], -1000, RAMP[4]![1], -200, RAMP[3]![1], -50, RAMP[2]![1], -10, RAMP[1]![1], -0.5, RAMP[0]![1], 0, 'rgba(150, 226, 232, 0)'],
      },
    } as unknown as LayerSpecification, 'raster');
    engine.addLayer({
      id: shade, type: 'hillshade', source: dem,
      paint: {
        'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': 'rgba(4, 12, 40, 0.55)', 'hillshade-highlight-color': 'rgba(210, 240, 255, 0.35)', 'hillshade-accent-color': 'rgba(4, 12, 40, 0.2)',
        'hillshade-illumination-direction': 315,
      },
      layout: { visibility: 'none' },
    } as unknown as LayerSpecification, 'raster');

    // a hillshade cannot be clipped at 0 m, so it is an option that shades the land as well
    const targets = [{ layer: relief, prop: 'color-relief-opacity', base: 1 }, { layer: shade, prop: 'hillshade-exaggeration', base: 0.35 }];
    clean.add(bindOpacity(ctx, ml, targets));

    let emoOn = false;
    const setEmodnet = (on: boolean) => {
      if (on === emoOn) return;
      emoOn = on;
      if (on) {
        engine.addSource(emoSrc, {
          type: 'raster', tileSize: 256, maxzoom: 11, bounds: [-73.125, 5.625, 45, 90],
          tiles: ['https://ows.emodnet-bathymetry.eu/wms?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=emodnet%3Amean_multicolour&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=true&CRS=EPSG%3A3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}'],
          attribution: 'Europa: <a href="https://emodnet.ec.europa.eu/en/bathymetry" target="_blank" rel="noopener">EMODnet Bathymetry</a> (CC BY 4.0, nicht zur Navigation)',
        });
        engine.addLayer({ id: emo, type: 'raster', source: emoSrc, paint: { 'raster-opacity': ctx.opacity.peek(), 'raster-fade-duration': 200 } } as LayerSpecification, 'raster');
      } else engine.remove({ layers: [emo], sources: [emoSrc] });
    };
    // options and opacity: effect-free subscription through the signals
    const apply = () => {
      const o = ctx.options.value;
      if (ml.getLayer(shade)) ml.setLayoutProperty(shade, 'visibility', o.shade === true ? 'visible' : 'none');
      setEmodnet(o.emodnet === true);
      if (emoOn && ml.getLayer(emo)) ml.setPaintProperty(emo, 'raster-opacity', ctx.opacity.peek());
    };
    apply();
    const unsubO = ctx.options.subscribe(apply);
    const unsubP = ctx.opacity.subscribe(apply);
    clean.add(unsubO);
    clean.add(unsubP);
    ctx.status({ state: 'ready', note: 'Höhenmodell, Tiefen unter dem Meeresspiegel' });
    return {
      destroy() {
        clean.run();
        engine.remove({ layers: [relief, shade, emo], sources: [dem, emoSrc] });
      },
    };
  },
});
