import { describe, expect, it } from 'vitest';
import { apparentTemperature, deriveField, TD_LAPSE_RATIO } from './grid';
import { buildDelta, demTiles, DemMosaic, DEM_TILE, edgeFade, lapseDelta, pickDemZoom, terrainDeltaAt, terrariumHeight, terrainRect, rectCovers, type TerrainGrid } from './terrain';

describe('terrain correction', () => {
  it('decodes terrarium heights', () => {
    expect(terrariumHeight(128, 0, 0)).toBe(0);
    expect(terrariumHeight(137, 200, 128)).toBeCloseTo(9 * 256 + 200 + 0.5 - 0, 5);
  });
  it('lapse: valley warmer, peak colder, clamped', () => {
    expect(lapseDelta(1500, 500)).toBeCloseTo(6.5, 6); // model surface above the valley floor
    expect(lapseDelta(1500, 3000)).toBeCloseTo(-9.75, 6);
    expect(lapseDelta(0, 8000)).toBe(-15);
    expect(lapseDelta(5000, 0)).toBe(15);
  });
  it('picks tiles and a zoom within the budget', () => {
    const alps: [number, number, number, number] = [6, 44, 14, 48];
    const z = pickDemZoom(alps, 30);
    expect(demTiles(alps, z).length).toBeLessThanOrEqual(30);
    expect(z).toBeGreaterThanOrEqual(6);
    const one = demTiles([6, 44, 6.5, 44.5], 7);
    expect(one).toHaveLength(1);
    expect(one[0]!.x).toBe(66);
  });
  it('mosaic samples bilinear and treats the sea as 0', () => {
    const m = new DemMosaic(0);
    const h = new Float32Array(DEM_TILE * DEM_TILE).fill(100);
    m.set(0, 0, h);
    expect(m.sample(0, 0)).toBeCloseTo(100, 6);
    h.fill(-50);
    expect(m.sample(10, 10)).toBe(0);
    expect(m.sample(10, 10)).toBe(0);
  });
  it('fades at the edge and looks up bilinear', () => {
    const rect: [number, number, number, number] = [0, 0, 10, 10];
    expect(edgeFade(rect, 0, 5, 1)).toBe(0);
    expect(edgeFade(rect, 5, 5, 1)).toBe(1);
    const data = buildDelta(rect, 20, 20, () => 1000, () => 0);
    const g: TerrainGrid = { rect, nx: 20, ny: 20, data, zoom: 7 };
    expect(terrainDeltaAt(g, 5, 5)).toBeCloseTo(6.5, 3);
    expect(terrainDeltaAt(g, 0.01, 5)).toBeLessThan(1);
    expect(terrainDeltaAt(g, 50, 5)).toBe(0);
    expect(terrainDeltaAt(undefined, 5, 5)).toBe(0);
  });
  it('builds a rectangle around the viewport and knows when it still covers', () => {
    const r = terrainRect([5, 45, 15, 49], { lng: 10, lat: 47 });
    expect(rectCovers(r, [5, 45, 15, 49])).toBe(true);
    expect(rectCovers(r, [30, 45, 40, 49])).toBe(false);
  });
});

describe('derived fields with terrain', () => {
  it('apparent temperature (old Orbis formula)', () => {
    // 20 °C, 50 % rh, 5 m/s
    const e = 0.5 * 6.105 * Math.exp((17.27 * 20) / (237.7 + 20));
    expect(apparentTemperature(20, 50, 5)).toBeCloseTo(20 + 0.33 * e - 3.5 - 4, 8);
    expect(apparentTemperature(-5, 80, 10)).toBeLessThan(-5);
  });
  it('terrain: T gets dT, Td its own factor and never exceeds T', () => {
    expect(deriveField('value', [10], 5, 'T')).toBe(15);
    expect(deriveField('value', [4], 5, 'Td')).toBeCloseTo(4 + 5 * TD_LAPSE_RATIO, 8);
    expect(deriveField('value', [4], 5)).toBe(4);
    const rhSame = deriveField('humidity', [10, 10], 0);
    expect(rhSame).toBeCloseTo(100, 5);
    expect(deriveField('humidity', [10, 10], 5)).toBeLessThanOrEqual(100);
    // warmer valley with the same moisture feels drier
    expect(deriveField('humidity', [10, 5], 6)).toBeLessThan(deriveField('humidity', [10, 5], 0));
    const f = deriveField('feels', [10, 5, 3, 4], 0);
    expect(f).toBeCloseTo(apparentTemperature(10, 100 * Math.exp((17.62 * 5) / (243.12 + 5) - (17.62 * 10) / (243.12 + 10)), 5), 8);
  });
});
