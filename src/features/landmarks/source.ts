// 3D landmarks (Empire State Building, Eiffel Tower, …): not a layer, no switch. With Orbis Pro every landmark of the dataset
// (data/landmarks.ts) in view is drawn as its model, ALWAYS, whether or not the buildings have roof data, and the model has
// priority: the OSM buildings it stands in for are left out of the 2.5D map (map/landmark-mask.ts) and of the detailed Pro
// buildings (features/buildings3d/roofs-source.ts). This file is the base's side: it finds the landmarks near the view, hands
// the extension the samples and the mask, and sets the credit line in the corner of the map.
import { computed, effect } from '@preact/signals';
import type { LayerSpecification } from 'maplibre-gl';
import { EMPTY_MASK, LANDMARKS_CREDIT, LANDMARKS_REPO, landmarkMask, landmarksShown, loadCatalogue, loadFootprints, loadTile, maskOf, tilesInView } from '../../data/landmarks';
import { landmarksChannel } from '../../ext/channels';
import { proEnabled } from '../../ext/licence';
import { proAvailable } from '../../ext/loader';
import type { LandmarkSample } from '../../ext/types';
import { watchLandmarkBuildings } from '../../map/landmark-buildings';
import { isAerial } from '../../map/basemaps';
import { mapEngine } from '../../state/ui';
import { activeBasemap, buildings3d, buildingsLayerOn, karteMode } from '../../state/view';

/** Every landmark is drawn from here on, whatever minZoom the dataset gives it: the zoom the 2.5D buildings start at (13 when the view is steep, see map/buildings-tilt.ts). */
export const LANDMARK_MIN_ZOOM = 13;
const SCAN_DELAY_MS = 200;
/** Landmarks this far outside of the view (share of the view) are kept ready. */
const MARGIN = 0.3;
const CREDIT_SRC = 'landmarks-attribution';

/**
 * Landmarks belong where the buildings are: with the layer "3D-Gebäude" (any basemap), or on the plain maps that show 2.5D buildings
 * (mode "Erkunden" with the buildings switch on). Not on "Daten" or "Fahren", and not on aerial images (their own 3D tiles): there only
 * the layer brings them.
 */
export const landmarksWanted = computed(() => buildingsLayerOn.value || (buildings3d.value && karteMode.value === 'erkunden' && !isAerial(activeBasemap.value)));

/** Starts the source; returns the function that stops it. */
export function startLandmarks(): () => void {
  return effect(() => {
    const engine = mapEngine.value;
    if (!engine || !proAvailable || !proEnabled.value || !landmarksWanted.value) return;
    const ml = engine.ml;
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let key = '';
    let run = 0;

    const set = async (items: LandmarkSample[], my: number) => {
      const next = items.map((l) => l.id).sort().join('|');
      if (next === key) return;
      // the outlines first (once, the dataset's footprint file): the model and the cut buildings appear together
      const shapes = items.length ? await loadFootprints().catch(() => ({})) : {};
      if (dead || my !== run) return;
      key = next;
      landmarkMask.value = items.length ? maskOf(items, shapes) : EMPTY_MASK;
      landmarksShown.value = items.length > 0;
      landmarksChannel.publish(() => items);
    };
    const scan = async () => {
      timer = undefined;
      const my = ++run;
      const zoom = ml.getZoom();
      if (zoom < LANDMARK_MIN_ZOOM) { await set([], my); return; }
      const b = ml.getBounds();
      const padLng = (b.getEast() - b.getWest()) * MARGIN;
      const padLat = (b.getNorth() - b.getSouth()) * MARGIN;
      const [w, s, e, n] = [b.getWest() - padLng, b.getSouth() - padLat, b.getEast() + padLng, b.getNorth() + padLat];
      try {
        const cat = await loadCatalogue();
        const lists = await Promise.all(tilesInView(cat, w, s, e, n).map((k) => loadTile(cat, k).catch(() => [] as LandmarkSample[])));
        if (dead || my !== run) return;
        const seen = new Set<string>();
        const items: LandmarkSample[] = [];
        for (const l of lists.flat()) {
          if (seen.has(l.id)) continue;
          const [bw, bs, be, bn] = l.bounds;
          if (be < w || bw > e || bn < s || bs > n) continue;
          seen.add(l.id);
          items.push(l);
        }
        await set(items, my);
      } catch {
        // offline or the dataset is down: the OSM buildings simply stay
      }
    };
    const schedule = () => { if (timer === undefined) timer = setTimeout(() => void scan(), SCAN_DELAY_MS); };

    // the credit line: the map's attribution lists a source while it is there (a layer keeps it in the style)
    const addCredit = () => {
      engine.addSource(CREDIT_SRC, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        attribution: `<a href="${LANDMARKS_REPO}" target="_blank" rel="noopener">${LANDMARKS_CREDIT}</a>`,
      });
      engine.addLayer({ id: `${CREDIT_SRC}-layer`, type: 'circle', source: CREDIT_SRC, paint: { 'circle-radius': 0 } } as LayerSpecification, 'points');
    };
    const stopCredit = effect(() => {
      if (!landmarksShown.value) return;
      addCredit();
      return () => engine.remove({ layers: [`${CREDIT_SRC}-layer`], sources: [CREDIT_SRC] });
    });

    let stopMask: (() => void) | undefined;
    void engine.ready.then(() => {
      if (dead) return;
      stopMask = watchLandmarkBuildings(ml);
      ml.on('moveend', schedule);
      ml.on('zoomend', schedule);
      schedule();
    });
    return () => {
      dead = true;
      run++;
      clearTimeout(timer);
      ml.off('moveend', schedule);
      ml.off('zoomend', schedule);
      stopCredit();
      stopMask?.();
      key = '';
      landmarkMask.value = EMPTY_MASK;
      landmarksShown.value = false;
      landmarksChannel.reset();
    };
  });
}
