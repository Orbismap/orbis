import { describe, expect, it } from 'vitest';
import { validateStyleMin, type StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { composeStyle, BASEMAP_IDS } from '../map/basemaps';
import { MARKERS, markerLayerId } from '../map/slots';
import { clusterSpecs, pointSpecs } from './pointstyle';
import { mapOutputs } from './common';
import { sdfFromAlpha, SHAPES } from './icons';
import { wmsTileUrl, gibsTileUrl } from './raster';
import { extrapolate } from './tracks';

const zoomRadius = ['interpolate', ['linear'], ['zoom'], 1, ['interpolate', ['linear'], ['get', 'mag'], 1.5, 2, 8, 12], 8, ['interpolate', ['linear'], ['get', 'mag'], 1.5, 5, 8, 32]] as never;

function withLayers(layers: StyleSpecification['layers'], extraSources: StyleSpecification['sources'] = {}): StyleSpecification {
  const style = composeStyle({ basemap: 'orbis-dark', labels: true, terminator: true, projection: 'globe' });
  return { ...style, sources: { ...style.sources, t: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' }, ...extraSources }, layers: [...style.layers, ...layers] };
}

describe('style', () => {
  it('composed styles validate for every basemap, labels on/off', () => {
    for (const basemap of BASEMAP_IDS) for (const labels of [true, false]) {
      const errs = validateStyleMin(composeStyle({ basemap, labels, terminator: true, projection: 'mercator' }));
      expect(errs.map((e) => e.message)).toEqual([]);
    }
  });
  it('slot markers are in the specified order, basemap labels between lines and points', () => {
    const ids = composeStyle({ basemap: 'satellite', labels: true, terminator: true, projection: 'globe' }).layers.map((l) => l.id);
    const pos = MARKERS.map((m) => ids.indexOf(markerLayerId(m)));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    const label = ids.indexOf('lbl-imagery-city');
    expect(label).toBeGreaterThan(ids.indexOf(markerLayerId('lines')));
    expect(label).toBeLessThan(ids.indexOf(markerLayerId('points')));
    // the night shade is a custom layer inserted before the `terminator` marker (map/terminator.ts)
  });
});

describe('point specs', () => {
  it('circle layers with zoom curve and hover scaling validate', () => {
    const s = pointSpecs('x', 't', undefined, { radius: zoomRadius, color: ['interpolate', ['linear'], ['-', 1000, ['get', 'time']], 0, '#fff', 100, '#000'] as never }, ['>=', ['get', 'mag'], 2], 'id');
    expect(validateStyleMin(withLayers([...clusterSpecs('x', 't'), s.main, s.ring])).map((e) => e.message)).toEqual([]);
  });
  it('symbol layers validate', () => {
    const s = pointSpecs('y', 't', undefined, { radius: 8, color: '#f00', symbol: { icon: 'plane', size: 0.6, rotate: ['get', 'heading'] as never } }, undefined, 'id');
    expect(validateStyleMin(withLayers([s.main, s.ring])).map((e) => e.message)).toEqual([]);
  });
  it('mapOutputs wraps the outputs of zoom curves only', () => {
    const out = mapOutputs(zoomRadius, (e) => ['*', e, 2] as never) as unknown as unknown[];
    expect(out[2]).toEqual(['zoom']);
    expect((out[4] as unknown[])[0]).toBe('*');
    expect(out[3]).toBe(1);
    expect(mapOutputs(5, (e) => ['*', e, 2] as never)).toEqual(['*', 5, 2]);
  });
});

describe('helpers', () => {
  it('builds WMS and GIBS urls', () => {
    const u = wmsTileUrl({ url: 'https://maps.dwd.de/geoserver/dwd/wms', layers: 'dwd:Niederschlagsradar' });
    expect(u).toContain('CRS=EPSG%3A3857');
    expect(u).toContain('BBOX={bbox-epsg-3857}');
    expect(wmsTileUrl({ url: 'https://x/wms', layers: 'a', version: '1.1.1' })).toContain('SRS=');
    expect(gibsTileUrl({ layer: 'VIIRS_Black_Marble', format: 'png', matrixSet: 'GoogleMapsCompatible_Level8' }, '2016-01-01')).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
    );
    expect(gibsTileUrl({ layer: 'BlueMarble', format: 'jpg', matrixSet: 'GoogleMapsCompatible_Level8' })).not.toContain('undefined');
  });
  it('extrapolates tracks', () => {
    const t = { id: 'a', lng: 10, lat: 50, heading: 90, speed: 250, t: 0 };
    expect(extrapolate(t, 0, 120_000)).toEqual([10, 50]);
    const [lng, lat] = extrapolate(t, 60_000, 120_000);
    expect(lng).toBeGreaterThan(10.2);
    expect(Math.abs(lat - 50)).toBeLessThan(0.01);
    expect(extrapolate(t, 1e9, 120_000)[0]).toBeCloseTo(extrapolate(t, 120_000, 120_000)[0], 9);
    expect(extrapolate({ ...t, speed: undefined }, 60_000, 1e5)).toEqual([10, 50]);
  });
  it('sdf: inside > edge > outside', () => {
    const w = 16;
    const alpha = new Uint8Array(w * w);
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) alpha[y * w + x] = 255;
    const sdf = sdfFromAlpha(alpha, w, w, 4, 0.25);
    expect(sdf[8 * w + 8]!).toBeGreaterThan(200);
    expect(sdf[0]!).toBe(0);
    expect(sdf[8 * w + 11]!).toBeGreaterThan(150); // just inside the edge
    expect(sdf[8 * w + 12]!).toBeLessThan(150); // just outside
    expect(Object.keys(SHAPES)).toEqual(expect.arrayContaining(['dot', 'triangle', 'plane', 'ship', 'camera', 'volcano']));
  });
});
