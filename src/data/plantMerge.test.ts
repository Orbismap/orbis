import { describe, expect, it } from 'vitest';
import type { PlantCollection, PlantProps } from './parsers/powerplants';
import { PlantMatcher, fuelClassOfOsm } from './plantMerge';

const plant = (id: number, lng: number, lat: number, fuel: PlantProps['fuel'], mw: number) => ({
  type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [lng, lat] },
  properties: { id, name: `p${id}`, fuel, fuelRaw: '', mw, country: '', year: 0, owner: '', url: '' },
});
const wri = (...f: ReturnType<typeof plant>[]): PlantCollection => ({ type: 'FeatureCollection', features: f });

describe('PlantMatcher', () => {
  it('hides a WRI plant that has an OSM plant of the same class nearby', () => {
    const m = new PlantMatcher(wri(plant(1, 8.0, 50.0, 'coal', 800)));
    expect(m.addPoint(8.02, 50.01, 'coal')).toBe(true);
    expect([...m.hidden]).toEqual([1]);
  });
  it('keeps it for another class or a larger distance', () => {
    const m = new PlantMatcher(wri(plant(1, 8.0, 50.0, 'coal', 800), plant(2, 9.0, 50.0, 'gas', 50)));
    expect(m.addPoint(8.01, 50.0, 'gas')).toBe(false);
    expect(m.addPoint(9.1, 50.0, 'gas')).toBe(false);
    expect(m.hidden.size).toBe(0);
  });
  it('very close counts whatever the class is', () => {
    const m = new PlantMatcher(wri(plant(1, 8.0, 50.0, 'other', 20)));
    expect(m.addPoint(8.002, 50.001, 'gas')).toBe(true);
  });
  it('the radius grows with the output of the plant', () => {
    const small = new PlantMatcher(wri(plant(1, 8.0, 50.0, 'gas', 20)));
    const big = new PlantMatcher(wri(plant(1, 8.0, 50.0, 'gas', 900)));
    // about 3 km east
    expect(small.addPoint(8.042, 50.0, 'gas')).toBe(false);
    expect(big.addPoint(8.042, 50.0, 'gas')).toBe(true);
  });
  it('an OSM area hides WRI plants of its class inside', () => {
    const m = new PlantMatcher(wri(plant(1, 8.5, 50.5, 'wind', 60), plant(2, 8.5, 50.5, 'solar', 60), plant(3, 10, 52, 'wind', 60)));
    expect(m.addArea([8.4, 50.4, 8.6, 50.6], 'wind')).toBe(true);
    expect([...m.hidden]).toEqual([1]);
  });
  it('ignores absurdly large areas', () => {
    const m = new PlantMatcher(wri(plant(1, 8.5, 50.5, 'wind', 60)));
    expect(m.addArea([-20, 30, 40, 60], 'wind')).toBe(false);
  });
  it('maps OSM sources to WRI classes', () => {
    expect(fuelClassOfOsm('biogas')).toBe('biomass');
    expect(fuelClassOfOsm('battery')).toBe('other');
    expect(fuelClassOfOsm(undefined)).toBeUndefined();
  });
});

describe('hidden-ids filter', () => {
  it('is a valid map filter', async () => {
    const { validateStyleMin } = await import('@maplibre/maplibre-gl-style-spec');
    const filter = ['all', ['>=', ['get', 'mw'], 5], ['!', ['in', ['get', 'id'], ['literal', [1, 2, 3]]]]];
    const style = {
      version: 8, sources: { s: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
      layers: [{ id: 'l', type: 'circle', source: 's', filter }],
    };
    expect(validateStyleMin(style as never).map((e) => e.message)).toEqual([]);
  });
});
