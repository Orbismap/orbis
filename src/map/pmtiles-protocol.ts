// Registers the pmtiles:// protocol once. It is registered synchronously (static import) because the Orbis Karte overlay is a
// source of the basemap style itself: a style only finishes loading when all its sources have their metadata, so the protocol
// must exist before the map is created.
import * as maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

let registered = false;

export function registerPmtilesProtocol(): void {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol('pmtiles', new Protocol().tilev4 as unknown as Parameters<typeof maplibregl.addProtocol>[1]);
}

export function ensurePmtilesProtocol(): Promise<void> {
  registerPmtilesProtocol();
  return Promise.resolve();
}
