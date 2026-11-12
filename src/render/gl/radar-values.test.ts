import { describe, expect, it } from 'vitest';
import { FLOW_G, FLOW_N, NODATA_MIN, buildRadarLut, computeFlow, pixelsToBytes, rainRate, rainviewerRate, rateByte, rateColor } from './radar-values';

describe('rain rate bytes', () => {
  it('round-trips through the sqrt coding', () => {
    for (const mmh of [0.01, 0.5, 2, 10, 50]) expect(rainRate(rateByte(mmh))).toBeCloseTo(mmh, mmh < 1 ? 1 : 0);
    expect(rateByte(0.001)).toBe(0);
    expect(rateByte(1e6)).toBe(NODATA_MIN - 1);
  });
});

describe('RainViewer colours -> rate', () => {
  it('transparent and faint haze are no rain', () => {
    expect(rainviewerRate(0, 0, 0, 0)).toBe(0);
    expect(rainviewerRate(200, 190, 150, 60)).toBe(0);
  });
  it('rises from light blue over dark blue to red', () => {
    const light = rainviewerRate(136, 163, 255, 255);
    const dark = rainviewerRate(0, 85, 255, 255);
    const red = rainviewerRate(193, 0, 0, 255);
    expect(light).toBeGreaterThan(0);
    expect(dark).toBeGreaterThan(light);
    expect(red).toBeGreaterThan(dark);
  });
  it('converts an RGBA tile to bytes', () => {
    const px = new Uint8ClampedArray([0, 0, 0, 0, 0, 85, 255, 255]);
    expect(pixelsToBytes(px.subarray(0, 4), 1).length).toBe(1);
    expect(pixelsToBytes(px.subarray(4), 1)[0]).toBeGreaterThan(0);
    const two = pixelsToBytes(new Uint8ClampedArray(2 * 2 * 4), 2);
    expect(Array.from(two)).toEqual([0, 0, 0, 0]);
  });
});

describe('colour scale', () => {
  it('is transparent for 0 and no-data, opaque-ish and increasing in alpha for rain', () => {
    const lut = buildRadarLut();
    expect(lut.length).toBe(1024);
    expect(lut[3]).toBe(0);
    expect(lut[255 * 4 + 3]).toBe(0);
    expect(lut[NODATA_MIN * 4 + 3]).toBe(0);
    const a = (mmh: number) => rateColor(mmh)[3];
    expect(a(0.001)).toBe(0);
    expect(a(0.01)).toBeGreaterThan(150);
    expect(a(80)).toBe(255);
    expect(a(10)).toBeGreaterThan(a(1));
  });
  it('clamps above the last stop', () => {
    expect(rateColor(500)).toEqual([255, 240, 95, 255]);
  });
});

describe('computeFlow', () => {
  const size = FLOW_N * 2; // like a 256 px tile
  const blob = (cx: number, cy: number) => {
    const b = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (Math.hypot(x - cx, y - cy) < 36) b[y * size + x] = 150 + ((x * 7 + y * 3) % 40);
    return b;
  };
  it('finds the shift of a moving cell (content of a at p is at p + d in b)', () => {
    const a = blob(100, 130);
    const b = blob(108, 126); // 8 px right, 4 px up in the 256 grid = 4 / -2 values at 128
    const f = computeFlow(a, size, b, size);
    expect(f.length).toBe(FLOW_G * FLOW_G * 2);
    const k = (8 * FLOW_G + 6) * 2; // cell under the blob centre (50, 65 in 128 values, 8 values per cell)
    expect(f[k]! * FLOW_N).toBeGreaterThan(2.5);
    expect(f[k]! * FLOW_N).toBeLessThan(5.5);
    expect(f[k + 1]! * FLOW_N).toBeLessThan(-0.5);
    expect(f[k + 1]! * FLOW_N).toBeGreaterThan(-3.5);
  });
  it('gives no motion for empty tiles', () => {
    const z = new Uint8Array(size * size);
    expect(Math.max(...computeFlow(z, size, z, size).map(Math.abs))).toBe(0);
  });
});
