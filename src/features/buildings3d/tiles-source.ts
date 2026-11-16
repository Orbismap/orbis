// Where the real 3D buildings come from. The switch "3D-Gebäude" of the basemap popover decides: on the Orbis colours and the
// map-like basemaps the 2.5D buildings (map engine), on the aerial images the streamed 3D tiles (Orbis Pro draws them). This file is
// the base's side of the latter: it hands the extension the tilesets (the user's own Cesium ion token: photorealistic, world-wide;
// without a token the free Plateau models of Japan) and the credit line the providers ask for.
import { computed, effect, signal } from '@preact/signals';
import { loadPlateau, PLATEAU_ATTRIBUTION, type PlateauSample } from '../../data/plateau';
import { setTilesetSource, tilesetsChannel, tilesetsState } from '../../ext/channels';
import { proEnabled } from '../../ext/licence';
import { proAvailable } from '../../ext/loader';
import type { TilesetSample } from '../../ext/types';
import { keySignal } from '../../keys/store';
import { hasTiles3d } from '../../map/basemaps';
import { mapEngine } from '../../state/ui';
import { activeBasemap, buildings3d } from '../../state/view';

/** Google's photorealistic cities through the Cesium ion asset depot (the user adds the asset to "My Assets"). */
const GOOGLE = { assetId: 2275207, name: 'Google Photorealistic 3D Tiles', credit: '© Google, Maxar, Airbus, Landsat/Copernicus, Cesium', url: 'https://cesium.com/platform/cesium-ion/content/google-photorealistic-3d-tiles/' };
const SOURCE = 'gebaeude3d';
const CREDIT = 'gebaeude3d-attribution';

/** The switch is on and the basemap is an aerial image: 3D tiles instead of 2.5D buildings. */
export const tilesWanted = computed(() => buildings3d.value && hasTiles3d(activeBasemap.value));

/** One line under the switch: why nothing shows, or what is used. */
export const tilesHint = computed<string | undefined>(() => {
  if (!tilesWanted.value) return undefined;
  if (!proAvailable || !proEnabled.value) return 'Echte 3D-Gebäude auf Luftbildern gibt es mit Orbis Pro.';
  const s = tilesetsState.value;
  if (s.ionError) return s.ionError;
  if (s.error) return s.error;
  return undefined;
});

/** The key mark next to the switch: tiles are wanted and Orbis Pro runs, but there is no Cesium token (so only Japan's Plateau models). */
export const tilesNeedKey = computed(() => tilesWanted.value && proAvailable && proEnabled.value && !keySignal('cesiumion').value);
export const KEY_TIP = 'Ohne eigenen Cesium-Token nur Japan (Plateau). Mit Token fotorealistisch weltweit: Einstellungen → Boost.';

/** root requests the free Cesium plan allows per month for the Google tiles */
export const ION_FREE_ROOTS = 1000;
/** The month's use of the free plan, while it is in use (token set, tiles wanted, Orbis Pro running). */
export const tilesQuota = computed<{ used: number; limit: number } | undefined>(() => {
  if (!tilesWanted.value || !proAvailable || !proEnabled.value || !keySignal('cesiumion').value) return undefined;
  return { used: tilesetsState.value.ionRoots ?? 0, limit: ION_FREE_ROOTS };
});

const googleSample = (token: string): TilesetSample => ({
  id: `cesium-${GOOGLE.assetId}`, name: GOOGLE.name, url: '', bbox: [-180, -85, 180, 85], center: [0, 0], global: true,
  ion: { assetId: GOOGLE.assetId, token }, attribution: GOOGLE.credit, license: 'Cesium ion',
});

/** Starts the source; returns the function that stops it. */
export function startBuildingTiles(): () => void {
  const plateau = signal<readonly PlateauSample[]>([]);
  let asked = false;
  const stopSource = effect(() => {
    const token = keySignal('cesiumion').value;
    const on = tilesWanted.value && proAvailable && proEnabled.value;
    if (!on) { setTilesetSource(SOURCE, null); return; }
    if (token) { setTilesetSource(SOURCE, () => [googleSample(token)]); return; }
    if (!asked) { asked = true; void loadPlateau().then((all) => { plateau.value = all; }); }
    const all = plateau.value;
    setTilesetSource(SOURCE, () => [...all]);
  });
  // the credit line in the corner of the map, while a model is in view (a source needs a layer to show its credit)
  const stopCredit = effect(() => {
    const engine = mapEngine.value;
    if (!engine || !tilesetsChannel.presented.value) return;
    const [text, url] = keySignal('cesiumion').value ? [GOOGLE.credit, GOOGLE.url] : [PLATEAU_ATTRIBUTION, 'https://www.mlit.go.jp/plateau/'];
    engine.addSource(CREDIT, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: `<a href="${url}" target="_blank" rel="noopener">${text}</a>` });
    engine.addLayer({ id: `${CREDIT}-layer`, type: 'circle', source: CREDIT, paint: { 'circle-radius': 0 } }, 'points');
    return () => engine.remove({ layers: [`${CREDIT}-layer`], sources: [CREDIT] });
  });
  return () => { stopSource(); stopCredit(); setTilesetSource(SOURCE, null); };
}
