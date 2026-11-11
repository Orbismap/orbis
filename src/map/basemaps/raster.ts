// Imagery and topography basemaps: raster tiles, vector labels are added on top by the shared label layers.
import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { BasemapId } from '../types';
import type { BasemapDef } from './types';

const hidden = { visibility: 'none' as const };

function def(id: BasemapId, label: string, source: SourceSpecification, extra: Partial<LayerSpecification> = {}): BasemapDef {
  const srcId = `bm-${id}`;
  return {
    id,
    label,
    sources: { [srcId]: source },
    layers: [
      { id: `bm-${id}-bg`, type: 'background', layout: hidden, paint: { 'background-color': '#0A0F18' } },
      { id: `bm-${id}-tiles`, type: 'raster', source: srcId, layout: hidden, paint: { 'raster-fade-duration': 200 }, ...extra } as LayerSpecification,
    ],
    labelVariant: 'imagery',
    background: '#0A0F18',
    theme: 'dark',
  };
}

export const satellite = (): BasemapDef =>
  def('satellite', 'Satellit', {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    maxzoom: 19,
    attribution: 'Bilder: <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics, GIS User Community',
  });

export const terrain = (): BasemapDef =>
  def('terrain', 'Gelände', {
    type: 'raster',
    tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 17,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende, SRTM | Darstellung: © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)',
  });

export const bluemarble = (): BasemapDef =>
  def('bluemarble', 'Blue Marble', {
    type: 'raster',
    tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg'],
    tileSize: 256,
    maxzoom: 8,
    attribution: 'Bilder: NASA Blue Marble, <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a>',
  });
