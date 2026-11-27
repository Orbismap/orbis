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
import { boxInside, reachBox, type Box } from '../../map/view-reach';
import { mapEngine } from '../../state/ui';
import { buildingColour, buildingsColoured, buildingsDetailed } from '../../state/view';

/** The same zoom the 2.5D buildings start at (`minzoom` 13.5 of their layers). The roof tiles hold data from zoom 15, below that only the OpenFreeMap buildings count; the sample caps keep a wide view small. */
export const ROOF_MIN_ZOOM = 13.5;
const SRC = 'buildings3d-roofs';
const SCAN_DELAY_MS = 250;
/** While tiles load, a pass waits for them to be in; at most this long (ms): a steep view loads for a long time, and the buildings of the nearby tiles are no reason to stay without. */
const MAX_WAIT_MS = 1500;
/** buildings outside the view by this share of its reach are left out */
const MARGIN = 0.25;

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const centre = (ring: readonly (readonly [number, number])[]): [number, number] => {
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
};

/**
 * Is this building one that a landmark model stands in for? The middle of its outline lies in the landmark's replaced outline. Where the
 * dataset has no outline (bridges, sculptures) nothing is left out: the model's box would take unrelated houses with it.
 * (The buildings of the OpenFreeMap tiles are already cut; this is for the roof tiles.)
 */
export function replacedByLandmark(b: { rings: [number, number][][] }, mask: LandmarkMask): boolean {
  const ring = b.rings[0];
  if (!mask.boxes.length || !ring?.length) return false;
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  const [lng, lat] = [x / ring.length, y / ring.length];
  // the box first: it is cheap, and most buildings of a view are near no landmark
  return mask.boxes.some(([w, s, e, n], i) => lng >= w && lng <= e && lat >= s && lat <= n && inFootprint(lng, lat, mask.footprints[i]?.geometry ?? []));
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
    return { ...b, tags };
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
    let waitingSince = 0;
    let lastSig = '';
    /** what the last publish covered: a view inside it, with nothing new, needs no new list */
    let covered: Box | undefined;

    const clear = () => {
      if (published) { published = false; lastSig = ''; covered = undefined; buildingsChannel.reset(); }
    };
    const scan = () => {
      timer = undefined;
      if (dead || !ml.getSource(SRC)) return;
      if (ml.getZoom() < ROOF_MIN_ZOOM) { clear(); return; }
      // while tiles load the query sees few buildings: publishing that would make the buildings flicker (but not for ever, see MAX_WAIT_MS)
      const now = performance.now();
      if (!ml.isSourceLoaded(SRC) || !ml.isSourceLoaded(buildingSource.peek())) {
        waitingSince ||= now;
        if (now - waitingSince < MAX_WAIT_MS) { schedule(); return; }
      }
      waitingSince = 0;
      // only the ground that counts (map/view-reach.ts): at a steep tilt the loaded tiles reach the horizon, and a mesh of far houses costs frames for a few pixels
      const view = reachBox(ml);
      const padW = (view[2] - view[0]) * MARGIN, padH = (view[3] - view[1]) * MARGIN;
      const box: Box = [view[0] - padW, view[1] - padH, view[2] + padW, view[3] + padH];
      const near = (c: readonly [number, number]) => c[0] >= box[0] && c[0] <= box[2] && c[1] >= box[1] && c[1] <= box[3];
      const roofs = roofSamples(ml.querySourceFeatures(SRC, { sourceLayer: 'roofs' })).filter((b) => b.rings[0] && near(centre(b.rings[0])));
      const features = ml.querySourceFeatures(buildingSource.peek(), { sourceLayer: 'building' });
      const flat: FlatBuilding[] = [];
      const flatNear: typeof features = [];
      for (const f of features) {
        const ring = flatRing(f);
        if (!ring || !near(centre(ring))) continue;
        flatNear.push(f);
        if (typeof f.id === 'number') flat.push({ id: f.id, ring, base: Number(f.properties?.render_min_height) || 0 });
      }
      // a 3D landmark model has priority: the buildings it stands in for are not drawn
      const mask = landmarkMask.peek();
      const items = paintSamples([...roofs, ...flatSamples(flatNear, new Set(coveredIds(flat, roofs)))], buildingColour.peek()).filter((b) => !replacedByLandmark(b, mask));
      // the id carries what the colours depend on, so a model made with other colours is not reused
      const coloured = buildingsColoured.peek();
      const base = buildingColour.peek();
      const shown = (coloured ? items : uncoloured(items, base)).map((b) => ({ ...b, id: `${b.id}~${base}${coloured ? 'c' : 'p'}` }));
      // the same buildings as the last time (a pan inside what was covered, a tile that brought nothing): the model keeps what it has
      let sum = 0;
      for (const b of shown) sum = (sum + hash(b.id)) >>> 0;
      const sig = `${shown.length}:${sum}`;
      if (published && sig === lastSig) return;
      lastSig = sig;
      covered = box;
      published = true;
      buildingsChannel.publish(() => shown);
    };
    const schedule = () => { if (timer === undefined) timer = setTimeout(scan, SCAN_DELAY_MS); };
    // a move inside the ground the last list covered asks for nothing; one that leaves it, or a tile that arrives, does
    const onMoveEnd = () => { if (!covered || !boxInside(covered, reachBox(ml))) schedule(); };
    const stopMask = landmarkMask.subscribe(schedule);
    const stopSource = buildingSource.subscribe(schedule);
    const stopColour = buildingsColoured.subscribe(schedule);
    const stopBase = buildingColour.subscribe(schedule);
    const onSource = (e: { sourceId?: string }) => { if (e.sourceId === SRC || e.sourceId === buildingSource.peek()) schedule(); };

    // the fill is invisible, but a layer keeps the tiles of the source loaded
    void Promise.all([ensurePmtilesProtocol(), osmPmtilesUrl('roofs'), engine.ready]).then(([, url]) => {
      if (dead) return;
      engine.addSource(SRC, { type: 'vector', url: `pmtiles://${url}`, attribution: '© OpenStreetMap-Mitwirkende' });
      engine.addLayer({ id: SRC, type: 'fill', source: SRC, 'source-layer': 'roofs', minzoom: ROOF_MIN_ZOOM - 1, paint: { 'fill-opacity': 0 } }, 'areas');
      ml.on('sourcedata', onSource as never);
      ml.on('moveend', onMoveEnd);
      schedule();
    });
    return () => {
      dead = true;
      stopMask();
      stopSource();
      stopColour();
      stopBase();
      clearTimeout(timer);
      ml.off('sourcedata', onSource as never);
      ml.off('moveend', onMoveEnd);
      engine.remove({ layers: [SRC], sources: [SRC] });
      buildingsChannel.reset();
    };
  });
}
