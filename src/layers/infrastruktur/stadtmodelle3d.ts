// 3D city models (Project PLATEAU, hundreds of Japanese cities and wards). Without Orbis Pro: the outlines of the available models. With Pro: the
// extension streams the tilesets (`tilesetsChannel`) and draws the real 3D buildings; the outlines then disappear.
import { computed, effect, signal } from '@preact/signals';
import type { GeoJSONSourceSpecification, LayerSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { PLATEAU_ATTRIBUTION, PLATEAU_LICENSE, loadPlateau, type PlateauSample } from '../../data/plateau';
import { hasOwnBuildings } from '../../map/basemaps';
import { setTilesetSource, tilesetsChannel, tilesetsState } from '../../ext/channels';
import { areaLayer } from '../../render/areas';
import { defineLayer } from '../define';

const COLOR = '#7FB6FF';
/** from this zoom on the outlines are gone (roads and places are what one looks for up close, and the models start here) */
const OUTLINE_MAX_ZOOM = 10;

/** the camera when flying to a model: the buildings are readable and the view is tilted */
const FLY_ZOOM = 16;
const FLY_PITCH = 50;

const outlines = (models: readonly PlateauSample[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features: models.map((t): Feature => {
    const [w, s, e, n] = t.bbox;
    return {
      type: 'Feature',
      id: t.id,
      properties: { id: t.id, name: t.name, pref: t.pref, lod: t.lod, year: t.year, sizeMb: t.sizeMb, lng: t.center[0], lat: t.center[1] },
      geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
    };
  }),
});

export default defineLayer({
  id: 'stadtmodelle3d',
  category: 'infrastruktur',
  title: '3D-Gebäude',
  summary: 'Offizielle 3D-Stadtmodelle mit echten Gebäuden und Texturen, mehrere hundert Städte und Bezirke in Japan (Project PLATEAU); Darstellung in 3D mit Orbis Pro',
  icon: 'map',
  color: COLOR,
  form: 'areas',
  cadence: 'static',
  coverage: 'Japan',
  sources: [{ name: PLATEAU_ATTRIBUTION, url: 'https://www.mlit.go.jp/plateau/', license: PLATEAU_LICENSE }],
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Verfügbares Stadtmodell (3D mit Orbis Pro, auf Luftbild-Karten)', shape: 'square' }] },
  keywords: ['3d', 'stadtmodell', 'stadt', 'tokio', 'tokyo', 'osaka', 'nagoya', 'yokohama', 'kyoto', 'sapporo', 'fukuoka', 'plateau', 'gebäude', 'photomesh', 'city model', 'lod', '3d tiles', 'japan'],

  mount(ctx) {
    const ml = ctx.map.ml;
    // The real models belong on the basemaps without buildings of their own (aerial images, OSM, terrain): the Orbis dark and light
    // ones draw their 2.5D buildings, which would stand in the models' way. So only there the tilesets go to the extension.
    const ownBuildings = () => hasOwnBuildings(ctx.map.getBasemap());
    let own = ownBuildings();
    const models = signal<readonly PlateauSample[]>([]);
    const publish = () => setTilesetSource(ctx.id, () => (own ? [] : [...models.peek()]));
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
    void loadPlateau().then((all) => {
      if (ctx.signal.aborted) return;
      models.value = all;
      publish();
    });
    const outlineOpacity = computed(() => (tilesetsChannel.presented.value ? 0 : 0.8));
    const fillOpacity = computed(() => (tilesetsChannel.presented.value ? 0 : 0.12));
    const status = () => {
      const s = tilesetsState.value;
      if (s.error) ctx.status({ state: 'error', note: s.error });
      else if (s.loading) ctx.status({ state: 'loading' });
      else ctx.status({ state: 'ready', count: models.value.length, note: own ? 'Die 3D-Modelle erscheinen auf Luftbild- und Karten-Grundkarten, nicht auf Orbis dunkel/hell (die zeigen eigene 2.5D-Gebäude).' : undefined });
    };
    const stopStatus = effect(status);
    // the credit line in the corner of the map, as long as the layer is on (a source needs a layer to show its credit)
    const attrSource = `${ctx.id}-attribution`;
    ctx.map.addSource(attrSource, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: `<a href="https://www.mlit.go.jp/plateau/" target="_blank" rel="noopener">${PLATEAU_ATTRIBUTION}</a>` } as GeoJSONSourceSpecification);
    ctx.map.addLayer({ id: `${attrSource}-layer`, type: 'circle', source: attrSource, paint: { 'circle-radius': 0 } } as LayerSpecification, 'points');
    const handle = areaLayer(ctx, {
      status: false,
      data: computed(() => outlines(models.value)),
      fill: COLOR,
      fillOpacity,
      outline: { color: COLOR, width: 1.5, opacity: outlineOpacity },
      describe(f) {
        const p = f.properties as { name: string; pref: string; lod: number; year: number; sizeMb: number; lng: number; lat: number };
        return {
          title: p.name,
          subtitle: `3D-Stadtmodell (LOD${p.lod}, texturiert, ${p.year})`,
          icon: 'map',
          color: COLOR,
          location: [p.lng, p.lat],
          facts: [
            { label: 'Präfektur', value: p.pref },
            { label: 'Datenmenge', value: `${p.sizeMb} MB (wird beim Heranzoomen gestreamt)` },
            { label: 'Darstellung', value: 'In 3D mit Orbis Pro', emphasis: true },
            { label: 'Quelle', value: PLATEAU_ATTRIBUTION },
          ],
          links: [{ label: 'Project PLATEAU', url: 'https://www.mlit.go.jp/plateau/' }],
          actions: [{ id: 'fly', label: 'Hinfliegen', icon: 'locate', run: () => ctx.map.flyTo({ center: [p.lng, p.lat], zoom: FLY_ZOOM, pitch: FLY_PITCH }) }],
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
        setTilesetSource(ctx.id, null);
        handle.destroy();
      },
    };
  },
});
