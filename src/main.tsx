import { render } from 'preact';
import 'maplibre-gl/dist/maplibre-gl.css';
import './ui/base.css';
import { App } from './app/App';
import * as karten from './karten/store';
import { initKartenStore } from './karten/store';
import { allLayers, getLayer } from './layers/registry';
import { getEngine } from './map/engine';
import * as session from './state/session';
import * as selection from './state/selection';
import * as view from './state/view';
import * as time from './state/time';
import * as settings from './state/settings';
import { initSession } from './state/session';
import { initSettings } from './state/settings';
import { startClock, watchRange } from './state/time';
import { initUi } from './state/ui';
import { startUrlSync } from './state/url-sync';

initSettings();
initKartenStore();
initSession();
initUi();
startClock();
watchRange();
startUrlSync();

render(<App />, document.getElementById('app')!);

// Test hook for the headless smoke test (`?smoke` or dev server): drive the app without the UI.
if (location.search.includes('smoke') || import.meta.env.DEV) {
  (window as unknown as { __orbis: unknown }).__orbis = {
    get engine() { return getEngine(); },
    karten, session, selection, view, time, settings,
    registry: { allLayers, getLayer },
  };
}
