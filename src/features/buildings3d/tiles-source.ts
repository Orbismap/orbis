// The 3D tiles of the basemap switch "3D-Gebäude": on aerial images Orbis Pro streams Google's photorealistic cities through the
// user's own Cesium ion token (world-wide); without a token there are none. The Plateau models of Japan and the coloured OSM
// buildings belong to the layer "3D-Gebäude" (`layers/infrastruktur/gebaeude3d.ts`), not to the switch. This file is the base's
// side: it hands the extension the tileset and the credit line the provider asks for.
import { computed, effect } from '@preact/signals';
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
  if (!keySignal('cesiumion').value) return 'Fotorealistische 3D-Tiles brauchen deinen Cesium-Token.';
  return undefined;
});

/** The key mark next to the switch: tiles are wanted and Orbis Pro runs, but there is no Cesium token. */
export const tilesNeedKey = computed(() => tilesWanted.value && proAvailable && proEnabled.value && !keySignal('cesiumion').value);
export const KEY_TIP = 'Fotorealistische 3D-Tiles weltweit brauchen deinen eigenen Cesium-Token: Einstellungen → Boost.';

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
  const stopSource = effect(() => {
    const token = keySignal('cesiumion').value;
    const on = tilesWanted.value && proAvailable && proEnabled.value && !!token;
    setTilesetSource(SOURCE, on ? () => [googleSample(token!)] : null);
  });
  // the credit line in the corner of the map, while a model is in view (a source needs a layer to show its credit)
  const stopCredit = effect(() => {
    const engine = mapEngine.value;
    if (!engine || !tilesWanted.value || !keySignal('cesiumion').value || !tilesetsChannel.presented.value) return;
    engine.addSource(CREDIT, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: `<a href="${GOOGLE.url}" target="_blank" rel="noopener">${GOOGLE.credit}</a>` });
    engine.addLayer({ id: `${CREDIT}-layer`, type: 'circle', source: CREDIT, paint: { 'circle-radius': 0 } }, 'points');
    return () => engine.remove({ layers: [`${CREDIT}-layer`], sources: [CREDIT] });
  });
  return () => { stopSource(); stopCredit(); setTilesetSource(SOURCE, null); };
}
