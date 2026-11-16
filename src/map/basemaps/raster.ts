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
    attribution: 'Bilder: <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics, GIS User Community',
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
    attribution: `Bilder: ${link('https://www.esri.com/', 'Esri')} Clarity, Maxar, Earthstar Geographics, GIS User Community`,
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
