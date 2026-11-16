// 3D city models (Project PLATEAU, Tokyo's 23 wards). Without Orbis Pro: the outlines of the available models. With Pro: the
// extension streams the tilesets (`tilesetsChannel`) and draws the real 3D buildings; the outlines then disappear.
import { computed, effect } from '@preact/signals';
import type { GeoJSONSourceSpecification, LayerSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { PLATEAU_ATTRIBUTION, PLATEAU_LICENSE, PLATEAU_TOKYO } from '../../data/plateau-tokyo';
import { hasOwnBuildings } from '../../map/basemaps';
import { tilesetsChannel, tilesetsState } from '../../ext/channels';
import { areaLayer } from '../../render/areas';
import { defineLayer } from '../define';

const COLOR = '#7FB6FF';
/** from this zoom on the outlines are gone (roads and places are what one looks for up close, and the models start here) */
const OUTLINE_MAX_ZOOM = 10;

const DATA: FeatureCollection = {
  type: 'FeatureCollection',
  features: PLATEAU_TOKYO.map((t): Feature => {
    const [w, s, e, n] = t.bbox;
    return {
      type: 'Feature',
      id: t.id,
      properties: { id: t.id, name: t.name, sizeMb: t.sizeMb },
      geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
    };
  }),
};

export default defineLayer({
  id: 'stadtmodelle3d',
  category: 'infrastruktur',
  title: '3D-Gebäude',
  summary: 'Offizielle 3D-Stadtmodelle mit echten Gebäuden und Texturen, bisher Tokio (Project PLATEAU); Darstellung in 3D mit Orbis Pro',
  icon: 'map',
  color: COLOR,
  form: 'areas',
  cadence: 'static',
  coverage: 'Tokio',
  sources: [{ name: PLATEAU_ATTRIBUTION, url: 'https://www.mlit.go.jp/plateau/', license: PLATEAU_LICENSE }],
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Verfügbares Stadtmodell (3D mit Orbis Pro, auf Luftbild-Karten)', shape: 'square' }] },
  keywords: ['3d', 'stadtmodell', 'stadt', 'tokio', 'tokyo', 'plateau', 'gebäude', 'photomesh', 'city model', 'lod', '3d tiles', 'japan'],

  mount(ctx) {
    const ml = ctx.map.ml;
    // The real models belong on the basemaps without buildings of their own (aerial images, OSM, terrain): the Orbis dark and light
    // ones draw their 2.5D buildings, which would stand in the models' way. So only there the tilesets go to the extension.
    const ownBuildings = () => hasOwnBuildings(ctx.map.getBasemap());
    let own = ownBuildings();
    const publish = () => tilesetsChannel.publish(() => (own ? [] : [...PLATEAU_TOKYO]));
    const stopWatching = tilesetsChannel.onListener(publish);
    const sync = () => {
      const now = ownBuildings();
      if (now === own) return;
      own = now;
      publish();
      status();
    };
    ml.on('styledata', sync);
    ml.on('idle', sync);
    publish();
    const outlineOpacity = computed(() => (tilesetsChannel.presented.value ? 0 : 0.8));
    const fillOpacity = computed(() => (tilesetsChannel.presented.value ? 0 : 0.12));
    const status = () => {
      const s = tilesetsState.value;
      if (s.error) ctx.status({ state: 'error', note: s.error });
      else if (s.loading) ctx.status({ state: 'loading' });
      else ctx.status({ state: 'ready', count: PLATEAU_TOKYO.length, note: own ? 'Die 3D-Modelle erscheinen auf Luftbild- und Karten-Grundkarten, nicht auf Orbis dunkel/hell (die zeigen eigene 2.5D-Gebäude).' : undefined });
    };
    const stopStatus = effect(status);
    // the credit line in the corner of the map, as long as the layer is on (a source needs a layer to show its credit)
    const attrSource = `${ctx.id}-attribution`;
    ctx.map.addSource(attrSource, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: `<a href="https://www.mlit.go.jp/plateau/" target="_blank" rel="noopener">${PLATEAU_ATTRIBUTION}</a>` } as GeoJSONSourceSpecification);
    ctx.map.addLayer({ id: `${attrSource}-layer`, type: 'circle', source: attrSource, paint: { 'circle-radius': 0 } } as LayerSpecification, 'points');
    const handle = areaLayer(ctx, {
      status: false,
      data: computed(() => DATA),
      fill: COLOR,
      fillOpacity,
      outline: { color: COLOR, width: 1.5, opacity: outlineOpacity },
      describe(f) {
        const p = f.properties as { name: string; sizeMb: number };
        return {
          title: p.name,
          subtitle: '3D-Stadtmodell (LOD2, texturiert)',
          icon: 'map',
          color: COLOR,
          facts: [
            { label: 'Datenmenge', value: `${p.sizeMb} MB (wird beim Heranzoomen gestreamt)` },
            { label: 'Darstellung', value: 'In 3D mit Orbis Pro', emphasis: true },
            { label: 'Quelle', value: PLATEAU_ATTRIBUTION },
          ],
          links: [{ label: 'Project PLATEAU', url: 'https://www.mlit.go.jp/plateau/' }],
        };
      },
    });
    for (const part of ['fill', 'outline', 'selected']) ctx.map.ml.setLayerZoomRange(`${ctx.id}-${part}`, 0, OUTLINE_MAX_ZOOM);
    return {
      destroy() {
        stopWatching();
        stopStatus();
        ml.off('styledata', sync);
        ml.off('idle', sync);
        ctx.map.remove({ layers: [`${attrSource}-layer`], sources: [attrSource] });
        tilesetsChannel.reset();
        handle.destroy();
      },
    };
  },
});
