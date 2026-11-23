import { render } from 'preact';
import type { Map as MlMap } from 'maplibre-gl';
import { offerMap } from './map/adopt';
import 'maplibre-gl/dist/maplibre-gl.css';
import './ui/base.css';
import { App } from './app/App';
import * as karten from './karten/store';
import { initKartenStore } from './karten/store';
import { buildingsChannel, powerChannel, shipsChannel, tracksChannel, treesChannel } from './ext/channels';
import { extensionStatus, proAvailable, startExtensions } from './ext/loader';
import { allLayers, getLayer } from './layers/registry';
import { getEngine } from './map/engine';
import { buildingsTiltState } from './map/buildings-tilt';
import * as session from './state/session';
import * as selection from './state/selection';
import * as view from './state/view';
import * as time from './state/time';
import * as settings from './state/settings';
import { initSession } from './state/session';
import { startBuildingRoofs } from './features/buildings3d/roofs-source';
import { startLandmarks } from './features/landmarks/source';
import { startBuildingTiles } from './features/buildings3d/tiles-source';
import { initSettings } from './state/settings';
import { startClock, watchRange } from './state/time';
import { initUi } from './state/ui';
import { startUrlSync } from './state/url-sync';
import { startHistory } from './state/history';

/**
 * Starts the map app in `root`. One-way: the module state (settings, session, clock, URL sync …) is initialised once
 * per page. With `adopt`, the weather app hands over its running MapLibre map (`createMapEngine` option `adopt`),
 * so the map does not reload.
 */
export function bootOrbis(root: HTMLElement, opts: { adopt?: { map: MlMap; element: HTMLElement; returnTo?: string } } = {}): void {
  if (opts.adopt) offerMap(opts.adopt);
  initSettings();
  initKartenStore();
  initSession();
  initUi();
  startClock();
  watchRange();
  startUrlSync();
  startHistory();
  startExtensions();
  startBuildingTiles();
  startBuildingRoofs();
  startLandmarks();

  render(<App />, root);

  // Test hook for the headless smoke test (`?smoke` or dev server): drive the app without the UI.
  if (location.search.includes('smoke') || import.meta.env.DEV) {
    (window as unknown as { __orbis: unknown }).__orbis = {
      get engine() { return getEngine(); },
      karten, session, selection, view, time, settings,
      registry: { allLayers, getLayer },
      buildingsTilt: buildingsTiltState,
      // Extensions: what is running, the aircraft and ship channels, and what the 3D stage (custom layer 'orbis-stage') reports about itself
      ext: {
        available: proAvailable,
        status: extensionStatus,
        tracks: tracksChannel,
        ships: shipsChannel,
        power: powerChannel,
        trees: treesChannel,
        buildings: buildingsChannel,
        stage: () => (getEngine()?.ml.getLayer('orbis-stage') as unknown as { implementation?: { stats?(): unknown } } | undefined)?.implementation?.stats?.(),
      },
    };
  }
}
