// Loads and runs the Orbis Pro extension, if the build contains it.
//
// `import.meta.glob` makes the folder optional: without `src/pro` the glob is empty, the build and the app work
// unchanged and `proAvailable` is false (the settings hide the switch). With the folder, three.js and all Pro code
// end up in their own lazy chunk that only loads when Pro is switched on. This file is the ONLY place in the base
// that mentions the folder (a unit test guards that).
import { markerLayerId } from '../map/slots';
import { effect } from '@preact/signals';
import { mapEngine } from '../state/ui';
import { projection } from '../state/view';
import { reducedMotion } from '../state/settings';
import type { MapEngine } from '../map/types';
import { buildingsChannel, followCurrent, followWanted, powerChannel, shipsChannel, tilesetsChannel, tilesetsState, tracksChannel, treesChannel } from './channels';
import { proEnabled } from './licence';
import type { ExtensionHost, OrbisExtension } from './types';

const modules = import.meta.glob<{ default?: OrbisExtension; extension?: OrbisExtension }>('../pro/index.ts');

/** True when this build contains the Pro folder. */
export const proAvailable = Object.keys(modules).length > 0;

export interface ExtensionStatus { id: string; running: boolean }
let status: ExtensionStatus | undefined;
/** For the test hook: what is running. */
export const extensionStatus = () => status;

function makeHost(engine: MapEngine): ExtensionHost {
  return {
    map: engine.ml,
    addCustomLayer: (layer, slot) => engine.addCustomLayer(layer, slot),
    removeLayer: (id) => engine.remove({ layers: [id] }),
    placeLayer: (id, where) => {
      const ml = engine.ml;
      if (!ml.getLayer(id)) return;
      if (where === 'points') return ml.moveLayer(id, markerLayerId('points'));
      // the first layer above the raster marker (the data layers start there), skipping the layer itself
      const layers = ml.getStyle().layers ?? [];
      const at = layers.findIndex((l) => l.id === markerLayerId('raster'));
      const next = layers.slice(at + 1).find((l) => l.id !== id);
      if (at >= 0 && next) ml.moveLayer(id, next.id);
    },
    projection,
    tracks: tracksChannel,
    ships: shipsChannel,
    power: powerChannel,
    trees: treesChannel,
    buildings: buildingsChannel,
    tilesets: tilesetsChannel,
    reportTilesets: (state) => { tilesetsState.value = state; },
    holdCamera: () => engine.holdCamera(),
    reducedMotion,
    follow: { wanted: followWanted, report: (ref) => { followCurrent.value = ref; } },
  };
}

/**
 * Starts the extension while `proEnabled` is true and a map exists, disposes it when Pro turns off or the map goes.
 * Call once at app start-up; returns the function that stops everything.
 */
export function startExtensions(): () => void {
  if (!proAvailable) return () => {};
  const load = Object.values(modules)[0]!;
  let stop: (() => void) | undefined;
  let token = 0;
  const dispose = () => {
    token++;
    stop?.();
    followCurrent.value = null;
    tilesetsState.value = { loading: false };
    stop = undefined;
    status = status && { ...status, running: false };
  };
  const stopWatch = effect(() => {
    const on = proEnabled.value;
    const engine = mapEngine.value;
    dispose();
    if (!on || !engine) return;
    const my = token;
    void (async () => {
      await engine.ready;
      if (my !== token) return;
      try {
        const mod = await load();
        const ext = mod.extension ?? mod.default;
        if (!ext || my !== token) return;
        stop = ext.start(makeHost(engine));
        status = { id: ext.id, running: true };
      } catch (e) {
        console.error('[pro] could not start', e);
      }
    })();
  });
  return () => { stopWatch(); dispose(); };
}
