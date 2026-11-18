import { allLayers, getLayer } from '../../layers/registry';
import type { SourceRef } from '../../layers/types';
import { isStaticBasemap } from '../../map/basemaps';
import { KEYED_ENTRIES, KEYED_PROVIDERS, type KeyedBasemapId } from '../../map/basemaps/keyed';
import { activeMembers, membersOf, regionalEntry, type Bounds, type Member } from '../../map/basemaps/regional';
import type { BasemapId, StaticBasemapId } from '../../map/types';

export interface Credit { name: string; url: string; license?: string; licenseUrl?: string; layers?: string[] }

const OSM: Credit = { name: '© OpenStreetMap-Mitwirkende', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL' };
const OFM: Credit = { name: 'OpenFreeMap', url: 'https://openfreemap.org/', license: 'Kartenkacheln' };
const OMT: Credit = { name: 'OpenMapTiles', url: 'https://openmaptiles.org/', license: 'CC-BY 4.0' };

const ESRI = (name: string, providers: string): Credit => ({ name: `Esri ${name} (${providers})`, url: 'https://www.esri.com/', license: 'Esri Nutzungsbedingungen, Powered by Esri' });
const EOX_CREDIT = (year: number): Credit => ({ name: `Sentinel-2 cloudless ${year}, EOX IT Services (enthält modifizierte Copernicus-Sentinel-Daten)`, url: 'https://s2maps.eu/', license: 'CC BY-NC-SA 4.0 laut EOX (nicht kommerziell)' });
const SWISSTOPO: Credit = { name: '© swisstopo', url: 'https://www.swisstopo.admin.ch/de/geodaten-kostenlos', license: 'Open Government Data (OGD), Quellenangabe' };

/** Keyed basemaps (the user's own key): one credit per provider, the same for each of its basemaps. */
const KEYED_CREDITS = Object.fromEntries(KEYED_ENTRIES.map((e) => [e.id, [{ name: KEYED_PROVIDERS[e.provider].title, url: KEYED_PROVIDERS[e.provider].home, license: 'Nutzungsbedingungen des Anbieters, mit eigenem Schlüssel' }, ...(e.provider === 'tomtom' || e.provider === 'here' ? [] : [OSM])]])) as Record<KeyedBasemapId, Credit[]>;

export const BASEMAP_CREDITS: Record<StaticBasemapId, Credit[]> = {
  'orbis-dark': [OFM, OMT, OSM],
  'orbis-light': [OFM, OMT, OSM],
  'orbis-karte': [OFM, OMT, OSM, { name: 'Mapterhorn (Reliefschattierung)', url: 'https://mapterhorn.com/attribution/', license: 'Höhendaten' }, { name: 'Mapzen Terrain Tiles (Meerestiefe: GEBCO, ETOPO1)', url: 'https://registry.opendata.aws/terrain-tiles/', license: 'frei nutzbar, Quellenangabe' }],
  satellite: [{ name: 'Esri World Imagery (Maxar, Earthstar Geographics)', url: 'https://www.esri.com/', license: 'Esri Nutzungsbedingungen' }, OFM, OSM],
  terrain: [{ name: 'OpenTopoMap', url: 'https://opentopomap.org/', license: 'CC-BY-SA' }, OSM],
  'esri-clarity': [{ name: 'Esri World Imagery Clarity (Maxar, Earthstar Geographics)', url: 'https://www.esri.com/', license: 'Esri Nutzungsbedingungen' }, OFM, OSM],
  swissimage: [SWISSTOPO, OFM, OSM],
  'imagico-alps': [{ name: 'imagico.de, Copernicus Sentinel-2 (2016, modifiziert)', url: 'https://imagico.de/maps/#osmim', license: 'CC-BY-SA 4.0' }, OFM, OSM],
  osm: [OSM, { name: 'OSMF Tile Usage Policy', url: 'https://operations.osmfoundation.org/policies/tiles/', license: 'Kachelserver der OSMF, faire Nutzung' }],
  swissalti3d: [{ ...SWISSTOPO, name: 'swisstopo SWISSALTI3D (Reliefschattierung)' }],
  swisssurface3d: [{ ...SWISSTOPO, name: 'swisstopo swissSURFACE3D (Reliefschattierung)' }],
  'osm-hot': [OSM, { name: 'Humanitarian OpenStreetMap Team, OSM France', url: 'https://www.hotosm.org/', license: 'Darstellung, ODbL' }],
  'esri-streets': [ESRI('Straßenkarte', 'Esri, HERE, Garmin, FAO, NOAA, USGS, OpenStreetMap')],
  'esri-topo': [ESRI('Topografie', 'Esri, TomTom, Garmin, FAO, NOAA, USGS, OpenStreetMap')],
  'esri-natgeo': [ESRI('National Geographic', 'National Geographic, Esri, Garmin, HERE, USGS, NASA, ESA, GEBCO, NOAA')],
  'esri-terrain': [ESRI('Gelände', 'Esri, USGS, NOAA')],
  'esri-shaded-relief': [ESRI('Reliefkarte', 'Esri, USGS, NOAA')],
  'esri-physical': [ESRI('Physische Karte', 'US National Park Service')],
  'esri-hillshade': [ESRI('Schummerung', 'Esri, NASA, NGA, USGS')],
  'esri-ocean': [ESRI('Ozeane', 'Esri, GEBCO, NOAA, National Geographic, DeLorme, HERE')],
  'esri-navigation': [ESRI('Seekarte', 'Esri, GEBCO, NOAA, IHO-IOC')],
  'esri-dark-gray': [ESRI('Dunkelgrau', 'Esri, HERE, Garmin, OpenStreetMap')],
  'esri-light-gray': [ESRI('Hellgrau', 'Esri, HERE, Garmin, OpenStreetMap')],
  'osm-fr': [OSM, { name: 'OpenStreetMap France', url: 'https://www.openstreetmap.fr/', license: 'Kacheln' }],
  'osm-de': [OSM, { name: 'OpenStreetMap Deutschland', url: 'https://www.openstreetmap.de/', license: 'Kacheln' }],
  wikimedia: [OSM, { name: 'Wikimedia Maps', url: 'https://foundation.wikimedia.org/wiki/Maps_Terms_of_Use', license: 'Nutzungsbedingungen von Wikimedia' }],
  cyclosm: [OSM, { name: 'CyclOSM (Kacheln: OpenStreetMap France)', url: 'https://www.cyclosm.org/', license: 'Darstellung, Quellenangabe' }],
  oepnv: [OSM, { name: 'ÖPNV-Karte (MeMoMaps)', url: 'https://memomaps.de/', license: 'Darstellung, Quellenangabe' }],
  'eox-2025': [EOX_CREDIT(2025)],
  'eox-2024': [EOX_CREDIT(2024)],
  'eox-2023': [EOX_CREDIT(2023)],
  'eox-2022': [EOX_CREDIT(2022)],
  'eox-2021': [EOX_CREDIT(2021)],
  'eox-2020': [EOX_CREDIT(2020)],
  'eox-2019': [EOX_CREDIT(2019)],
  'eox-2018': [EOX_CREDIT(2018)],
  'eox-2017': [EOX_CREDIT(2017)],
  blank: [OFM, OSM],
  ...KEYED_CREDITS,
  bluemarble: [{ name: 'NASA Blue Marble, GIBS', url: 'https://earthdata.nasa.gov/gibs', license: 'gemeinfrei' }],
};

/**
 * Credits of any basemap. Regional ones come from the (lazy) generated data and are empty until it has loaded.
 * Of a series, only the editions drawn for `view` (see activeMembers) are credited, with their years.
 */
export function basemapCredits(id: BasemapId, view?: Bounds): Credit[] {
  if (isStaticBasemap(id)) return BASEMAP_CREDITS[id];
  const e = regionalEntry(id);
  if (!e) return [];
  const all = membersOf(e);
  const by = new Map<string, { m: Member; years: number[] }>();
  for (const i of activeMembers(e, view)) {
    const m = all[i]!;
    const key = `${m.a ?? ''}|${m.r ?? ''}|${m.l ?? ''}`;
    const g = by.get(key) ?? by.set(key, { m, years: [] }).get(key)!;
    if (m.y !== undefined) g.years.push(m.y);
  }
  const credits = [...by.values()].map(({ m, years }): Credit => ({
    name: m.a ?? e.n,
    url: m.r ?? m.l ?? 'https://github.com/osmlab/editor-layer-index',
    license: [e.n, years.length ? [...new Set(years)].sort((a, b) => b - a).join(', ') : ''].filter(Boolean).join(' ').trim(),
    licenseUrl: m.l,
  }));
  return [...credits, OFM, OSM];
}

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
