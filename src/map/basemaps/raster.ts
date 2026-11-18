// Imagery and topography basemaps: raster tiles, vector labels are added on top by the shared label layers.
import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { BasemapId } from '../types';
import type { BasemapDef } from './types';

const hidden = { visibility: 'none' as const };

const DARK = '#0A0F18';
const LIGHT = '#F4F6F9';

/** Per-basemap look: dark imagery by default, `light` for map/relief tiles that already are bright. */
interface Look { light?: boolean; extra?: Partial<LayerSpecification> }

export function rasterDef(id: BasemapId, label: string, source: SourceSpecification, { light = false, extra = {} }: Look = {}): BasemapDef {
  const srcId = `bm-${id}`;
  const bg = light ? LIGHT : DARK;
  return {
    id,
    label,
    sources: { [srcId]: source },
    layers: [
      { id: `bm-${id}-bg`, type: 'background', layout: hidden, paint: { 'background-color': bg } },
      { id: `bm-${id}-tiles`, type: 'raster', source: srcId, layout: hidden, paint: { 'raster-fade-duration': 200 }, ...extra } as LayerSpecification,
    ],
    labelVariant: light ? 'light' : 'imagery',
    background: bg,
    theme: light ? 'light' : 'dark',
    ...('bounds' in source && source.bounds ? { bounds: source.bounds as BasemapDef['bounds'] } : {}),
  };
}

const link = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

/** Switzerland (swisstopo coverage): tiles outside are never requested. */
export const CH_BOUNDS: [number, number, number, number] = [5.95, 45.81, 10.5, 47.81];
const SWISSTOPO_ATTRIBUTION = `© ${link('https://www.swisstopo.admin.ch/', 'swisstopo')}`;
const swisstopoTiles = (layer: string, ext: 'jpeg' | 'png') => `https://wmts.geo.admin.ch/1.0.0/${layer}/default/current/3857/{z}/{x}/{y}.${ext}`;

export const satellite = (): BasemapDef =>
  rasterDef('satellite', 'Esri Weltbilder', {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    maxzoom: 19,
    attribution: `Powered by ${link('https://www.esri.com/', 'Esri')} | Bilder: Esri, Maxar, Earthstar Geographics, GIS User Community`,
  });

export const terrain = (): BasemapDef =>
  rasterDef('terrain', 'Gelände', {
    type: 'raster',
    tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 17,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende, SRTM | Darstellung: © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)',
  });

/** OpenStreetMap France "Humanitarian" style. */
export const osmHot = (): BasemapDef =>
  rasterDef('osm-hot', 'OpenStreetMap Humanitarian', {
    type: 'raster',
    tiles: ['https://tile-a.openstreetmap.fr/hot/{z}/{x}/{y}.png', 'https://tile-b.openstreetmap.fr/hot/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 19,
    attribution: `© ${link('https://www.openstreetmap.org/copyright', 'OpenStreetMap')}-Mitwirkende | Darstellung: ${link('https://www.hotosm.org/', 'HOT')}, ${link('https://www.openstreetmap.fr/', 'OSM France')}`,
  }, { light: true });

/** Esri ArcGIS Online basemaps (keyless tile services). */
/** Esri asks for "Powered by Esri" and the data providers of each service. */
const ESRI_ATTRIBUTION = (providers: string) => `Powered by ${link('https://www.esri.com/', 'Esri')} | ${providers}`;
const esriDef = (id: BasemapId, label: string, service: string, maxzoom: number, providers: string, look: Look = { light: true }): BasemapDef =>
  rasterDef(id, label, {
    type: 'raster',
    tiles: [`https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`],
    tileSize: 256,
    maxzoom,
    attribution: ESRI_ATTRIBUTION(providers),
  }, look);

export const esriStreets = (): BasemapDef => esriDef('esri-streets', 'Esri Straßenkarte', 'World_Street_Map', 19, 'Esri, HERE, Garmin, FAO, NOAA, USGS, © OpenStreetMap-Mitwirkende, GIS User Community');
export const esriTopo = (): BasemapDef => esriDef('esri-topo', 'Esri Topografie', 'World_Topo_Map', 19, 'Esri, TomTom, Garmin, FAO, NOAA, USGS, © OpenStreetMap-Mitwirkende, GIS User Community');
export const esriNatgeo = (): BasemapDef => esriDef('esri-natgeo', 'Esri National Geographic', 'NatGeo_World_Map', 16, 'National Geographic, Esri, Garmin, HERE, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, increment P');
export const esriTerrain = (): BasemapDef => esriDef('esri-terrain', 'Esri Gelände', 'World_Terrain_Base', 13, 'Esri, USGS, NOAA');
export const esriShadedRelief = (): BasemapDef => esriDef('esri-shaded-relief', 'Esri Reliefkarte', 'World_Shaded_Relief', 13, 'Esri, USGS, NOAA');
export const esriPhysical = (): BasemapDef => esriDef('esri-physical', 'Esri Physische Karte', 'World_Physical_Map', 8, 'US National Park Service');
export const esriHillshade = (): BasemapDef => esriDef('esri-hillshade', 'Esri Schummerung', 'Elevation/World_Hillshade', 16, 'Esri, NASA, NGA, USGS');
export const esriOcean = (): BasemapDef => esriDef('esri-ocean', 'Esri Ozeane', 'Ocean/World_Ocean_Base', 13, 'Esri, GEBCO, NOAA, National Geographic, DeLorme, HERE, Geonames.org und weitere');
export const esriNavigation = (): BasemapDef => esriDef('esri-navigation', 'Esri Seekarte', 'Specialty/World_Navigation_Charts', 10, 'Esri, GEBCO, NOAA, IHO-IOC und weitere');
export const esriDarkGray = (): BasemapDef => esriDef('esri-dark-gray', 'Esri Dunkelgrau', 'Canvas/World_Dark_Gray_Base', 16, 'Esri, HERE, Garmin, © OpenStreetMap-Mitwirkende, GIS User Community', {});
export const esriLightGray = (): BasemapDef => esriDef('esri-light-gray', 'Esri Hellgrau', 'Canvas/World_Light_Gray_Base', 16, 'Esri, HERE, Garmin, © OpenStreetMap-Mitwirkende, GIS User Community');

/** Further worldwide OpenStreetMap renderings (from the editor-layer-index; the dead ones of it are left out). */
const osmStyle = (id: BasemapId, label: string, tiles: string[], maxzoom: number, credit: string): BasemapDef =>
  rasterDef(id, label, { type: 'raster', tiles, tileSize: 256, maxzoom, attribution: `© ${link('https://www.openstreetmap.org/copyright', 'OpenStreetMap')}-Mitwirkende | ${credit}` }, { light: true });

export const osmFr = (): BasemapDef =>
  osmStyle('osm-fr', 'OpenStreetMap Französisch', ['a', 'b', 'c'].map((s) => `https://${s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png`), 20, `Kacheln: ${link('https://www.openstreetmap.fr/', 'OpenStreetMap France')}`);
export const osmDe = (): BasemapDef =>
  osmStyle('osm-de', 'OpenStreetMap Deutsch', ['https://tile.openstreetmap.de/{z}/{x}/{y}.png'], 18, `Kacheln: ${link('https://www.openstreetmap.de/', 'OpenStreetMap Deutschland')}`);
export const wikimedia = (): BasemapDef =>
  osmStyle('wikimedia', 'Wikimedia Karte', ['https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png'], 18, `Kacheln: ${link('https://foundation.wikimedia.org/wiki/Maps_Terms_of_Use', 'Wikimedia')}`);
export const cyclosm = (): BasemapDef =>
  osmStyle('cyclosm', 'CyclOSM', ['a', 'b', 'c'].map((s) => `https://${s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png`), 20, `Darstellung: ${link('https://www.cyclosm.org/', 'CyclOSM')}, Kacheln: OpenStreetMap France`);
export const oepnv = (): BasemapDef =>
  osmStyle('oepnv', 'ÖPNV-Karte', ['https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png'], 18, `Darstellung: ${link('https://memomaps.de/', 'MeMoMaps')}`);

/** EOX Sentinel-2 cloudless mosaics, one per year (WMTS, 3857). */
export const EOX_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017] as const;
export const eox = (year: (typeof EOX_YEARS)[number]): BasemapDef =>
  rasterDef(`eox-${year}` as BasemapId, `Sentinel-2 ${year}`, {
    type: 'raster',
    tiles: [`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${year}_3857/default/g/{z}/{y}/{x}.jpg`],
    tileSize: 256,
    maxzoom: 17,
    attribution: `Sentinel-2 cloudless ${link('https://s2maps.eu/', 's2maps.eu')} von ${link('https://eox.at/', 'EOX IT Services')}, enthält modifizierte Copernicus-Sentinel-Daten ${year}`,
  });

export const bluemarble = (): BasemapDef =>
  rasterDef('bluemarble', 'Blue Marble', {
    type: 'raster',
    tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg'],
    tileSize: 256,
    maxzoom: 8,
    attribution: 'Bilder: NASA Blue Marble, <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a>',
  });

/** Esri World Imagery "Clarity" (Beta): sharper, more recent selection of the same imagery. */
export const esriClarity = (): BasemapDef =>
  rasterDef('esri-clarity', 'Esri Weltbilder (Klarheit, Beta)', {
    type: 'raster',
    tiles: ['https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    maxzoom: 19,
    attribution: `Powered by ${link('https://www.esri.com/', 'Esri')} | Bilder: Esri Clarity, Maxar, Earthstar Geographics, GIS User Community`,
  });

/** OpenStreetMap standard tiles. Usage policy: https://operations.osmfoundation.org/policies/tiles/ (attribution, no bulk use, no cache bypass). */
export const osm = (): BasemapDef =>
  rasterDef('osm', 'OpenStreetMap', {
    type: 'raster',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 19,
    attribution: `© ${link('https://www.openstreetmap.org/copyright', 'OpenStreetMap')}-Mitwirkende, ODbL | Kacheln: ${link('https://operations.osmfoundation.org/policies/tiles/', 'OSMF Tile Usage Policy')}`,
  }, { light: true });

/** imagico.de Sentinel-2 mosaic of the Central Alps, late September 2016 (served TMS: y counts from the south). */
export const imagicoAlps = (): BasemapDef =>
  rasterDef('imagico-alps', 'imagico.de Zentralalpen, Sept. 2016', {
    type: 'raster',
    tiles: ['https://imagico.de/map/osmim_tiles.php?layer=S2A_R065_N47_20160929T102022&z={z}&x={x}&y={y}'],
    scheme: 'tms',
    tileSize: 256,
    maxzoom: 13,
    bounds: [7.474, 45.9548, 11.7525, 47.6648],
    attribution: `Bilder: ${link('https://imagico.de/maps/#osmim', 'imagico.de')}, enthält modifizierte Copernicus-Sentinel-Daten 2016`,
  });

export const swissimage = (): BasemapDef =>
  rasterDef('swissimage', 'swisstopo SWISSIMAGE', {
    type: 'raster',
    tiles: [swisstopoTiles('ch.swisstopo.swissimage', 'jpeg')],
    tileSize: 256,
    maxzoom: 19,
    bounds: CH_BOUNDS,
    attribution: `Luftbild: ${SWISSTOPO_ATTRIBUTION}`,
  });

export const swissalti3d = (): BasemapDef =>
  rasterDef('swissalti3d', 'swisstopo SWISSALTI3D', {
    type: 'raster',
    tiles: [swisstopoTiles('ch.swisstopo.swissalti3d-reliefschattierung', 'png')],
    tileSize: 256,
    maxzoom: 17,
    bounds: CH_BOUNDS,
    attribution: `Reliefschattierung (SWISSALTI3D): ${SWISSTOPO_ATTRIBUTION}`,
  }, { light: true });

export const swisssurface3d = (): BasemapDef =>
  rasterDef('swisssurface3d', 'swisstopo swissSURFACE3D', {
    type: 'raster',
    tiles: [swisstopoTiles('ch.swisstopo.swisssurface3d-reliefschattierung-multidirektional', 'png')],
    tileSize: 256,
    maxzoom: 17,
    bounds: CH_BOUNDS,
    attribution: `Reliefschattierung (swissSURFACE3D): ${SWISSTOPO_ATTRIBUTION}`,
  }, { light: true });

/** No tiles at all: just the dark ground, labels and layers on top. */
export const blank = (): BasemapDef => ({
  id: 'blank',
  label: 'Leer',
  sources: {},
  layers: [{ id: 'bm-blank-bg', type: 'background', layout: hidden, paint: { 'background-color': DARK } }],
  labelVariant: 'imagery',
  background: DARK,
  theme: 'dark',
});
