// Registers the pmtiles:// protocol once (the pmtiles library is loaded on demand).
import * as maplibregl from 'maplibre-gl';

let registered: Promise<void> | undefined;

export function ensurePmtilesProtocol(): Promise<void> {
  registered ??= import('pmtiles').then(({ Protocol }) => {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tilev4 as unknown as Parameters<typeof maplibregl.addProtocol>[1]);
  });
  return registered;
}
