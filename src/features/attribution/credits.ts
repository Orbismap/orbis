import { allLayers, getLayer } from '../../layers/registry';
import type { SourceRef } from '../../layers/types';
import type { BasemapId } from '../../map/types';

export interface Credit { name: string; url: string; license?: string; layers?: string[] }

const OSM: Credit = { name: '© OpenStreetMap-Mitwirkende', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL' };
const OFM: Credit = { name: 'OpenFreeMap', url: 'https://openfreemap.org/', license: 'Kartenkacheln' };
const OMT: Credit = { name: 'OpenMapTiles', url: 'https://openmaptiles.org/', license: 'CC-BY 4.0' };

export const BASEMAP_CREDITS: Record<BasemapId, Credit[]> = {
  'orbis-dark': [OFM, OMT, OSM],
  'orbis-light': [OFM, OMT, OSM],
  satellite: [{ name: 'Esri World Imagery (Maxar, Earthstar Geographics)', url: 'https://www.esri.com/', license: 'Esri Nutzungsbedingungen' }, OFM, OSM],
  terrain: [{ name: 'OpenTopoMap', url: 'https://opentopomap.org/', license: 'CC-BY-SA' }, OSM],
  bluemarble: [{ name: 'NASA Blue Marble, GIBS', url: 'https://earthdata.nasa.gov/gibs', license: 'gemeinfrei' }],
};

/** Unique sources of the given layers, with the layers that use them. */
export function sourcesOf(ids: string[]): Credit[] {
  const by = new Map<string, Credit>();
  for (const id of ids) {
    const def = getLayer(id);
    if (!def) continue;
    for (const s of def.sources as SourceRef[]) {
      const c = by.get(s.name) ?? { name: s.name, url: s.url, license: s.license, layers: [] };
      c.layers!.push(def.title);
      by.set(s.name, c);
    }
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export const allSources = () => sourcesOf(allLayers().map((d) => d.id));
