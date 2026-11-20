// Roofs and building parts: no layer and no setting, they come with Orbis Pro. While Pro runs, the footprints and tags of the view come
// from our own PMTiles `roofs` (OpenStreetMap, bucket orbis-osm; only buildings and parts with a roof tag, zoom 15 overzoomed) through the
// buildings channel to Pro, which models walls and roofs (`pro/gebaeude/`). From zoom 16 on the 2.5D buildings of OpenFreeMap that lie
// under a modelled roof give way (`buildingsCovered`); all other buildings keep their flat extrusion. Without Pro nothing is loaded.
// Where a real city model is in view (Plateau, Google 3D tiles) the roofs stay out: the model brings its own.
import { effect } from '@preact/signals';
import { osmPmtilesUrl } from '../../data/osmfiles';
import { coveredIds, roofSamples, type FlatBuilding } from '../../data/parsers/roofs-tiles';
import { buildingsChannel, tilesetsChannel } from '../../ext/channels';
import { proEnabled } from '../../ext/licence';
import { proAvailable } from '../../ext/loader';
import { ensurePmtilesProtocol } from '../../map/pmtiles-protocol';
import { mapEngine } from '../../state/ui';
import { buildingsCovered } from '../../state/view';

/** Below this the 2.5D houses are enough. */
export const ROOF_MIN_ZOOM = 16;
const SRC = 'buildings3d-roofs';
const SCAN_DELAY_MS = 250;

/** Starts the source; returns the function that stops it. */
export function startBuildingRoofs(): () => void {
  return effect(() => {
    const engine = mapEngine.value;
    if (!engine || !proAvailable || !proEnabled.value || tilesetsChannel.presented.value) return;
    const ml = engine.ml;
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let published = false;

    const clear = () => {
      if (published) { published = false; buildingsChannel.reset(); }
      if (buildingsCovered.peek().length) buildingsCovered.value = [];
    };
    const scan = () => {
      timer = undefined;
      if (dead || !ml.getSource(SRC)) return;
      if (ml.getZoom() < ROOF_MIN_ZOOM) { clear(); return; }
      // while tiles load the query sees few buildings: publishing that would make the roofs flicker
      if (!ml.isSourceLoaded(SRC)) return;
      const items = roofSamples(ml.querySourceFeatures(SRC, { sourceLayer: 'roofs' }));
      published = true;
      buildingsChannel.publish(() => items);
      const flat: FlatBuilding[] = [];
      for (const f of ml.querySourceFeatures('ofm', { sourceLayer: 'building' })) {
        const g = f.geometry;
        const ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0]?.[0] : undefined;
        if (typeof f.id === 'number' && ring) flat.push({ id: f.id, ring: ring.map((c) => [c[0]!, c[1]!] as [number, number]) });
      }
      const ids = coveredIds(flat, items);
      const old = buildingsCovered.peek();
      if (ids.length !== old.length || ids.some((id, i) => id !== old[i])) buildingsCovered.value = ids;
    };
    const schedule = () => { if (timer === undefined) timer = setTimeout(scan, SCAN_DELAY_MS); };
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
      clearTimeout(timer);
      ml.off('sourcedata', onSource as never);
      ml.off('moveend', schedule);
      engine.remove({ layers: [SRC], sources: [SRC] });
      buildingsChannel.reset();
      buildingsCovered.value = [];
    };
  });
}
