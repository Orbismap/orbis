// World-wide 3D buildings and photorealistic cities through Cesium ion, with the user's own token (Boost). Nothing is drawn in the
// base: the layer hands the tileset to the extension (Orbis Pro), which streams it. Spike: see docs/PLAN-3D-TILES.md, phase 4.
import { effect } from '@preact/signals';
import type { GeoJSONSourceSpecification, LayerSpecification } from 'maplibre-gl';
import { hasOwnBuildings } from '../../map/basemaps';
import { setTilesetSource, tilesetsState } from '../../ext/channels';
import { keySignal } from '../../keys/store';
import { defineLayer } from '../define';

const COLOR = '#FFB454';
/** assets of the Cesium ion asset depot: the user adds them to "My Assets" */
const ASSETS = {
  google: { id: 2275207, name: 'Google Photorealistic 3D Tiles', credit: '© Google, Maxar, Airbus, Landsat/Copernicus, Cesium', url: 'https://cesium.com/platform/cesium-ion/content/google-photorealistic-3d-tiles/' },
  osm: { id: 96188, name: 'Cesium OSM Buildings', credit: '© Cesium, © OpenStreetMap contributors', url: 'https://cesium.com/platform/cesium-ion/content/cesium-osm-buildings/' },
} as const;
type AssetKey = keyof typeof ASSETS;

export default defineLayer({
  id: 'cesium3d',
  category: 'infrastruktur',
  title: '3D-Welt',
  summary: 'Fotorealistische Städte oder Gebäude weltweit in 3D (Cesium ion, eigener Token); Darstellung mit Orbis Pro',
  icon: 'map',
  color: COLOR,
  form: 'areas',
  cadence: 'static',
  keys: [{ id: 'cesiumion', required: true }],
  options: [{ id: 'asset', label: 'Datensatz', type: 'select', default: 'google', choices: [{ value: 'google', label: 'Fotorealistisch (Google)' }, { value: 'osm', label: 'Gebäude (OpenStreetMap)' }] }],
  sources: [
    { name: 'Cesium ion', url: 'https://cesium.com/platform/cesium-ion/', license: 'Nutzungsbedingungen von Cesium; der Community-Plan nur nicht-kommerziell' },
    { name: 'Google Photorealistic 3D Tiles', url: 'https://developers.google.com/maps/documentation/tile/3d-tiles', license: 'Nutzungsbedingungen von Google Maps Platform' },
  ],
  keywords: ['3d', 'cesium', 'google', 'photorealistic', 'fotorealistisch', 'osm buildings', 'stadt', 'gebäude', 'weltweit', '3d tiles'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const token = keySignal('cesiumion');
    const ownBuildings = () => hasOwnBuildings(ctx.map.getBasemap());
    let own = ownBuildings();
    const publish = () => {
      const t = token.peek();
      const a = ASSETS[(ctx.options.peek().asset as AssetKey) in ASSETS ? (ctx.options.peek().asset as AssetKey) : 'google'];
      setTilesetSource(ctx.id, () => (!t || own ? [] : [{
        id: `cesium-${a.id}`, name: a.name, url: '', bbox: [-180, -85, 180, 85], center: [0, 0], global: true,
        ion: { assetId: a.id, token: t }, attribution: a.credit, license: 'Cesium ion',
      }]));
    };
    const sync = () => {
      const now = ownBuildings();
      if (now === own) return;
      own = now;
      publish();
    };
    ml.on('styledata', sync);
    ml.on('idle', sync);
    const stopPublish = effect(() => { token.value; ctx.options.value; publish(); });
    const stopStatus = effect(() => {
      const s = tilesetsState.value;
      if (s.ionError) ctx.status({ state: 'error', note: s.ionError });
      else if (s.loading) ctx.status({ state: 'loading' });
      else ctx.status({ state: 'ready', note: own ? 'Die 3D-Modelle erscheinen auf Luftbild- und Karten-Grundkarten, nicht auf Orbis dunkel/hell (die zeigen eigene 2.5D-Gebäude).' : `Ab Zoom 12 mit Orbis Pro.${s.ionRoots ? ` Abrufe bei Cesium diesen Monat: ${s.ionRoots} von 1.000 (kostenloser Plan).` : ''}` });
    });
    // credit line in the corner of the map, as the providers' terms ask
    const credit = `${ctx.id}-attribution`;
    const html = () => { const a = ASSETS[(ctx.options.peek().asset as AssetKey) in ASSETS ? (ctx.options.peek().asset as AssetKey) : 'google']; return `<a href="${a.url}" target="_blank" rel="noopener">${a.credit}</a>`; };
    ctx.map.addSource(credit, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: html() } as GeoJSONSourceSpecification);
    ctx.map.addLayer({ id: `${credit}-layer`, type: 'circle', source: credit, paint: { 'circle-radius': 0 } } as LayerSpecification, 'points');
    return {
      destroy() {
        stopPublish();
        stopStatus();
        ml.off('styledata', sync);
        ml.off('idle', sync);
        ctx.map.remove({ layers: [`${credit}-layer`], sources: [credit] });
        setTilesetSource(ctx.id, null);
      },
    };
  },
});
