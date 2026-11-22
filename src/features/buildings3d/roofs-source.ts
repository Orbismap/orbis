// Buildings of the layer "3D-Gebäude" (type OSM) in the close view: no setting of their own, they come with Orbis Pro. While the layer is on and Pro
// runs, Orbis' own 3D renderer (`pro/gebaeude/`) draws ALL buildings of the view from zoom 13.5 on (where the 2.5D buildings start), and the 2.5D buildings step aside
// (engine.ts, `buildingsChannel.presented`). Without the layer the basemap shows only its 2.5D buildings.
// The samples: the buildings with a roof tag from our PMTiles `roofs` (OpenStreetMap, bucket orbis-osm; zoom 15 overzoomed) with all their
// tags, plus the other buildings of the OpenFreeMap tiles (flat roof, their height and colour). OpenFreeMap buildings that a roof sample
// is the same building as are left out, so a building is drawn once. Below zoom 13.5 nothing is published and the 2.5D buildings stay.
// Where a real city model is in view (Plateau, Google 3D tiles) this stays out: the model brings its own.
import { effect } from '@preact/signals';
import { osmPmtilesUrl } from '../../data/osmfiles';
import { coveredIds, flatRing, flatSamples, paintSamples, roofSamples, type FlatBuilding } from '../../data/parsers/roofs-tiles';
import { inFootprint, landmarkMask, type LandmarkMask } from '../../data/landmarks';
import { buildingSource } from '../../map/landmark-buildings';
import { buildingsChannel, tilesetsChannel } from '../../ext/channels';
import { proEnabled } from '../../ext/licence';
import { proAvailable } from '../../ext/loader';
import { ensurePmtilesProtocol } from '../../map/pmtiles-protocol';
import { mapEngine } from '../../state/ui';
import { buildingsColoured, buildingsDetailed } from '../../state/view';

/** The same zoom the 2.5D buildings start at (`minzoom` 13.5 of their layers). The roof tiles hold data from zoom 15, below that only the OpenFreeMap buildings count; the sample caps keep a wide view small. */
export const ROOF_MIN_ZOOM = 13.5;
const SRC = 'buildings3d-roofs';
const SCAN_DELAY_MS = 250;
/** Buildings without a colour in OSM (the same as in that layer's 2.5D buildings). */
const PLAIN = '#d6dae3';

/**
 * Is this building one that a landmark model stands in for? The middle of its outline lies in the landmark's replaced outline, or,
 * where the dataset has none, in its footprint box. (The buildings of the OpenFreeMap tiles are already cut; this is for the roof tiles.)
 */
export function replacedByLandmark(b: { rings: [number, number][][] }, mask: LandmarkMask): boolean {
  if (!mask.boxes.length) return false;
  const ring = b.rings[0];
  if (!ring?.length) return false;
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  const [lng, lat] = [x / ring.length, y / ring.length];
  return mask.boxes.some((box, i) => {
    const [w, s, e, n] = box;
    if (lng < w || lng > e || lat < s || lat > n) return false;
    const shape = mask.footprints[i]?.geometry;
    return shape && shape.length ? inFootprint(lng, lat, shape) : true;
  });
}

/** Colour and material tags OSM gives a building: dropped when the layer is set to "not coloured". */
const LOOK_TAGS = ['building:colour', 'colour', 'roof:colour', 'building:material', 'material', 'roof:material'];

/** All buildings in the one plain colour, walls and roofs: no OSM colour, no material. The id changes, so a model made before is not reused. */
export function uncoloured<T extends { id: string; tags: Record<string, string> }>(items: readonly T[], plain: string): T[] {
  return items.map((b) => {
    const tags = { ...b.tags };
    for (const k of LOOK_TAGS) delete tags[k];
    tags['building:colour'] = plain;
    tags['roof:colour'] = plain;
    return { ...b, id: `${b.id}~`, tags };
  });
}

/** Starts the source; returns the function that stops it. */
export function startBuildingRoofs(): () => void {
  return effect(() => {
    const engine = mapEngine.value;
    if (!engine || !proAvailable || !proEnabled.value || !buildingsDetailed.value || tilesetsChannel.presented.value) return;
    const ml = engine.ml;
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let published = false;

    const clear = () => {
      if (published) { published = false; buildingsChannel.reset(); }
    };
    const scan = () => {
      timer = undefined;
      if (dead || !ml.getSource(SRC)) return;
      if (ml.getZoom() < ROOF_MIN_ZOOM) { clear(); return; }
      // while tiles load the query sees few buildings: publishing that would make the buildings flicker
      if (!ml.isSourceLoaded(SRC) || !ml.isSourceLoaded(buildingSource.peek())) return;
      const roofs = roofSamples(ml.querySourceFeatures(SRC, { sourceLayer: 'roofs' }));
      const features = ml.querySourceFeatures(buildingSource.peek(), { sourceLayer: 'building' });
      const flat: FlatBuilding[] = [];
      for (const f of features) {
        const ring = flatRing(f);
        if (typeof f.id === 'number' && ring) flat.push({ id: f.id, ring, base: Number(f.properties?.render_min_height) || 0 });
      }
      // a 3D landmark model has priority: the buildings it stands in for are not drawn
      const mask = landmarkMask.peek();
      const items = paintSamples([...roofs, ...flatSamples(features, new Set(coveredIds(flat, roofs)))], PLAIN).filter((b) => !replacedByLandmark(b, mask));
      const shown = buildingsColoured.peek() ? items : uncoloured(items, PLAIN);
      published = true;
      buildingsChannel.publish(() => shown);
    };
    const schedule = () => { if (timer === undefined) timer = setTimeout(scan, SCAN_DELAY_MS); };
    const stopMask = landmarkMask.subscribe(schedule);
    const stopSource = buildingSource.subscribe(schedule);
    const stopColour = buildingsColoured.subscribe(schedule);
    const onSource = (e: { sourceId?: string }) => { if (e.sourceId === SRC || e.sourceId === 'ofm' || e.sourceId === buildingSource.peek()) schedule(); };

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
      stopMask();
      stopSource();
      stopColour();
      clearTimeout(timer);
      ml.off('sourcedata', onSource as never);
      ml.off('moveend', schedule);
      engine.remove({ layers: [SRC], sources: [SRC] });
      buildingsChannel.reset();
    };
  });
}
