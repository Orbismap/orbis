// Buildings in the close view: no layer and no setting, they come with Orbis Pro. While Pro runs, Orbis' own 3D renderer (`pro/gebaeude/`)
// draws ALL buildings of the view from zoom 16 on, and the 2.5D buildings of OpenFreeMap step aside (engine.ts, `buildingsChannel.presented`).
// The samples: the buildings with a roof tag from our PMTiles `roofs` (OpenStreetMap, bucket orbis-osm; zoom 15 overzoomed) with all their
// tags, plus the other buildings of the OpenFreeMap tiles (flat roof, their height and colour). OpenFreeMap buildings that a roof sample
// covers are left out, so a building is drawn once. Below zoom 16 nothing is published and the 2.5D buildings stay. Without Pro nothing is loaded.
// Where a real city model is in view (Plateau, Google 3D tiles) this stays out: the model brings its own.
import { effect } from '@preact/signals';
import { osmPmtilesUrl } from '../../data/osmfiles';
import { coveredIds, flatRing, flatSamples, paintSamples, roofSamples, type FlatBuilding } from '../../data/parsers/roofs-tiles';
import { buildingsChannel, tilesetsChannel } from '../../ext/channels';
import { proEnabled } from '../../ext/licence';
import { proAvailable } from '../../ext/loader';
import { BASEMAPS, GENERIC_BUILDINGS_ID, isStaticBasemap } from '../../map/basemaps';
import { ensurePmtilesProtocol } from '../../map/pmtiles-protocol';
import { mapEngine } from '../../state/ui';
import { activeBasemap, buildingsColoured } from '../../state/view';

/** Below this the 2.5D houses are enough (and one view would hold too many buildings). */
export const ROOF_MIN_ZOOM = 16;
const SRC = 'buildings3d-roofs';
const SCAN_DELAY_MS = 250;
/** Buildings without a colour in OSM while the layer "3D-Gebäude" is on (the same as that layer's 2.5D buildings). */
const PLAIN = '#d6dae3';

/** Starts the source; returns the function that stops it. */
export function startBuildingRoofs(): () => void {
  return effect(() => {
    const engine = mapEngine.value;
    if (!engine || !proAvailable || !proEnabled.value || tilesetsChannel.presented.value) return;
    const ml = engine.ml;
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let published = false;

    /** The building colour of the basemap on show (what its 2.5D buildings are painted in), if it is a plain hex colour. */
    const baseColour = (): string | undefined => {
      const b = activeBasemap.value;
      const id = (isStaticBasemap(b) ? BASEMAPS[b].topLayers?.[0]?.id : undefined) ?? GENERIC_BUILDINGS_ID;
      try {
        const c = ml.getPaintProperty(id, 'fill-extrusion-color');
        return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : undefined;
      } catch { return undefined; }
    };
    const clear = () => {
      if (published) { published = false; buildingsChannel.reset(); }
    };
    const scan = () => {
      timer = undefined;
      if (dead || !ml.getSource(SRC)) return;
      if (ml.getZoom() < ROOF_MIN_ZOOM) { clear(); return; }
      // while tiles load the query sees few buildings: publishing that would make the buildings flicker
      if (!ml.isSourceLoaded(SRC) || !ml.isSourceLoaded('ofm')) return;
      const roofs = roofSamples(ml.querySourceFeatures(SRC, { sourceLayer: 'roofs' }));
      const features = ml.querySourceFeatures('ofm', { sourceLayer: 'building' });
      const flat: FlatBuilding[] = [];
      for (const f of features) {
        const ring = flatRing(f);
        if (typeof f.id === 'number' && ring) flat.push({ id: f.id, ring });
      }
      // standard design: all buildings in the colour of the basemap; coloured (OSM colours) only while the layer "3D-Gebäude" is on
      const items = paintSamples([...roofs, ...flatSamples(features, new Set(coveredIds(flat, roofs)))], buildingsColoured.peek(), baseColour(), PLAIN);
      published = true;
      buildingsChannel.publish(() => items);
    };
    const schedule = () => { if (timer === undefined) timer = setTimeout(scan, SCAN_DELAY_MS); };
    const stopLook = effect(() => { buildingsColoured.value; activeBasemap.value; schedule(); });
    const onSource = (e: { sourceId?: string }) => { if (e.sourceId === SRC || e.sourceId === 'ofm') schedule(); };

    // the fill is invisible, but a layer keeps the tiles of the source loaded
    void Promise.all([ensurePmtilesProtocol(), osmPmtilesUrl('roofs'), engine.ready]).then(([, url]) => {
      if (dead) return;
      engine.addSource(SRC, { type: 'vector', url: `pmtiles://${url}`, attribution: '© OpenStreetMap-Mitwirkende' });
      engine.addLayer({ id: SRC, type: 'fill', source: SRC, 'source-layer': 'roofs', minzoom: ROOF_MIN_ZOOM - 1, paint: { 'fill-opacity': 0 } }, 'areas');
      ml.on('sourcedata', onSource as never);
      ml.on('moveend', schedule);
      schedule();
    });
    return () => {
      dead = true;
      stopLook();
      clearTimeout(timer);
      ml.off('sourcedata', onSource as never);
      ml.off('moveend', schedule);
      engine.remove({ layers: [SRC], sources: [SRC] });
      buildingsChannel.reset();
    };
  });
}
