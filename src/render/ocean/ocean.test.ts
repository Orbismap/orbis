import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { floodStations, riverStatus, sparkline } from '../../data/parsers/flood';
import { marineSamples } from '../../data/parsers/oceangrid';
import { shippingLanes } from '../../data/parsers/shippinglanes';
import { bakeScalar } from './bake';
import { CH, NCH, NX, NY, OceanGrid, buildLattice, flowField, oceanPoints, regionOf, sampleLattice, sampleScalar, scalarField } from './grid';
import { isOcean, rasterizeMask } from './landmask';
import { buildPieces, pickStations, pointAt, probeCoords, riversOf } from './rivers';
import { sampleFlow } from './flow';

const square = (x0: number, y0: number, x1: number, y1: number) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });

describe('landmask', () => {
  const land = { features: [{ geometry: { type: 'MultiPolygon', coordinates: [[square(0, 0, 40, 40).coordinates[0]]] } }, { geometry: square(-100, -50, -60, -10) }] };
  const lakes = { features: [{ geometry: square(10, 10, 20, 20) }] };
  const m = rasterizeMask(land, lakes, 720, 360);
  it('marks land and lakes as not ocean and the rest as ocean', () => {
    expect(isOcean(m, 20, 30)).toBe(false);
    expect(isOcean(m, 15, 15)).toBe(false); // lake
    expect(isOcean(m, -80, -30)).toBe(false);
    expect(isOcean(m, -30, 10)).toBe(true);
    expect(isOcean(m, 41, 41)).toBe(true);
  });
  it('wraps longitude and clamps latitude', () => {
    expect(isOcean(m, 380, 30)).toBe(false);
    expect(isOcean(m, 20, 95)).toBe(true);
  });
  it('even-odd holes stay water', () => {
    const ring = square(0, 0, 40, 40).coordinates[0]!;
    const hole = square(10, 10, 20, 20).coordinates[0]!;
    const h = rasterizeMask({ features: [{ geometry: { type: 'Polygon', coordinates: [ring, hole] } }] }, undefined, 720, 360);
    expect(isOcean(h, 15, 15)).toBe(true);
    expect(isOcean(h, 30, 30)).toBe(false);
  });
});

describe('real Natural Earth mask', () => {
  const read = (f: string) => JSON.parse(readFileSync(new URL(`../../../public/data/${f}`, import.meta.url), 'utf8'));
  const m = rasterizeMask(read('ne50m_land.json'), read('ne50m_lakes.json'));
  it('knows oceans, continents and the Black Sea', () => {
    expect(isOcean(m, -30, 30)).toBe(true); // Atlantic
    expect(isOcean(m, 10, 51)).toBe(false); // Germany
    expect(isOcean(m, 2.5, 54)).toBe(true); // North Sea
    expect(isOcean(m, 34, 43)).toBe(true); // Black Sea
    expect(isOcean(m, 0, -80)).toBe(false); // Antarctica
    expect(isOcean(m, -87, 46)).toBe(false); // Lake Superior
    expect(isOcean(m, 100, 75)).toBe(false); // Siberia
  });
  it('the global 5° lattice stays within the API budget', () => {
    const pts = oceanPoints((lon, lat) => isOcean(m, lon, lat), { lat0: -75, lat1: 80, lon0: -180, lon1: 175 }, 5);
    expect(pts.length).toBeGreaterThan(1200);
    expect(pts.length).toBeLessThan(2000);
  });
});

describe('lattice sampling', () => {
  const mk = (lat: number, lon: number, cu: number) => ({ lat, lon, v: [cu, 0, ...Array(NCH - 2).fill(NaN)] });
  const l = buildLattice([mk(0, 0, 1), mk(0, 5, 3), mk(5, 0, 1), mk(5, 5, 3)], { lat0: 0, lat1: 5, lon0: 0, lon1: 5 }, 5);
  const out = new Float32Array(NCH);
  it('is exact at samples and bilinear between', () => {
    sampleLattice(l, 0, 0, out);
    expect(out[CH.cu]).toBeCloseTo(1);
    sampleLattice(l, 2.5, 2.5, out);
    expect(out[CH.cu]).toBeCloseTo(2);
    sampleLattice(l, 1, 4, out);
    expect(out[CH.cu]).toBeCloseTo(2.6);
  });
  it('fills near a missing corner with the neighbours and leaves empty channels NaN', () => {
    const c = buildLattice([mk(0, 0, 1), mk(0, 5, 3), mk(5, 0, 1)], { lat0: 0, lat1: 5, lon0: 0, lon1: 5 }, 5);
    sampleLattice(c, 4.5, 4.5, out);
    expect(out[CH.cu]).toBeGreaterThan(0.99);
    expect(out[CH.cu]).toBeLessThan(3.01);
    expect(Number.isNaN(out[CH.wh])).toBe(true);
  });
  it('returns false far away from every sample', () => {
    expect(sampleLattice(l, 60, 60, out)).toBe(false);
  });
  it('wraps the global lattice across the date line', () => {
    const w = buildLattice([mk(0, 175, 2), mk(0, -180, 4)], { lat0: 0, lat1: 0, lon0: -180, lon1: 175 }, 5, true);
    sampleLattice(w, 0, 177.5, out);
    expect(out[CH.cu]).toBeCloseTo(3, 1);
  });
});

describe('OceanGrid', () => {
  it('paints a lattice, blends a finer block over it with a feather and keeps the edge continuous', () => {
    const mk = (lat: number, lon: number, cu: number) => ({ lat, lon, v: [cu, 0, ...Array(NCH - 2).fill(NaN)] });
    const base: ReturnType<typeof mk>[] = [];
    for (let la = -10; la <= 10; la += 5) for (let lo = -10; lo <= 10; lo += 5) base.push(mk(la, lo, 1));
    const g = new OceanGrid();
    g.paint(buildLattice(base, { lat0: -10, lat1: 10, lon0: -10, lon1: 10 }, 5), regionOf({ lat0: -10, lat1: 10, lon0: -10, lon1: 10 }));
    const idx = (lat: number, lon: number) => Math.round((90 - lat) / 0.5) * NX + Math.round((lon + 180) / 0.5);
    expect(g.data[CH.cu]![idx(0, 0)]).toBeCloseTo(1);
    const fine: ReturnType<typeof mk>[] = [];
    for (let la = -3; la <= 3; la += 1) for (let lo = -3; lo <= 3; lo += 1) fine.push(mk(la, lo, 3));
    g.paint(buildLattice(fine, { lat0: -3, lat1: 3, lon0: -3, lon1: 3 }, 1), regionOf({ lat0: -2, lat1: 2, lon0: -2, lon1: 2 }), 4);
    expect(g.data[CH.cu]![idx(0, 0)]).toBeCloseTo(3);
    const edge = g.data[CH.cu]![idx(0, 2)]!;
    expect(edge).toBeGreaterThan(1);
    expect(edge).toBeLessThan(3);
    expect(g.data[CH.cu]![idx(0, 4)]).toBeCloseTo(1);
    // monotone fade from block centre to base: no jump
    let prev = 3;
    for (let lo = 0; lo <= 2.5; lo += 0.5) { const v = g.data[CH.cu]![idx(0, lo)]!; expect(v).toBeLessThanOrEqual(prev + 1e-6); prev = v; }
  });
  it('derives scalar and flow fields', () => {
    const g = new OceanGrid();
    const k = Math.round((90 - 10) / 0.5) * NX + Math.round((20 + 180) / 0.5);
    g.data[CH.cu]![k] = 1;
    g.data[CH.cv]![k] = 0;
    g.data[CH.wh]![k] = 2;
    g.data[CH.wdx]![k] = 1; // waves come from the east ...
    g.data[CH.wdy]![k] = 0;
    expect(scalarField(g, 'current')[k]).toBeCloseTo(3.6);
    expect(scalarField(g, 'wave')[k]).toBe(2);
    const f = flowField(g, 'wave', { max: 8 });
    expect(f.vx[k]!).toBeLessThan(0); // ... and travel west
    expect(f.t[k]).toBeCloseTo(0.25);
    expect(Number.isNaN(f.vx[0])).toBe(true);
    expect(sampleScalar(scalarField(g, 'current'), 20, 10)).toBeCloseTo(3.6);
    const out = new Float32Array(3);
    expect(sampleFlow(flowField(g, 'current', { max: 8 }), (20 + 180) / 360, 0.5, out)).toBe(false); // neighbours have no data
  });
  it('bakes a scalar grid into premultiplied RGBA, transparent without data', () => {
    const f = new Float32Array(NX * NY).fill(NaN);
    for (let j = 100; j < 200; j++) for (let i = 100; i < 300; i++) f[j * NX + i] = 2;
    const img = bakeScalar(f, { stops: [[0, 'rgba(0,0,255,0)'], [4, '#ff0000']] }, 360, 180);
    const px = (x: number, y: number) => Array.from(img.slice((y * 360 + x) * 4, (y * 360 + x) * 4 + 4));
    expect(px(0, 0)[3]).toBe(0);
    const c = px(100, 60); // lon -80+, lat 40-
    expect(c[3]).toBeGreaterThan(60);
    expect(c[0]).toBeGreaterThan(c[2]!);
  });
});

describe('parsers', () => {
  it('marineSamples converts currents to u/v in m/s and keeps wave bearings as vectors', () => {
    const r = marineSamples([
      { latitude: 0.04, longitude: -30.04, current: { time: '2026-11-11T12:30', ocean_current_velocity: 3.6, ocean_current_direction: 90, wave_height: 1.5, wave_direction: 180, wave_period: 8, swell_wave_height: 1, swell_wave_direction: 270, swell_wave_period: 9 } },
      { latitude: 40, longitude: 10, current: { time: '2026-11-11T12:30', ocean_current_velocity: null, wave_height: null } },
    ]);
    expect(r.samples).toHaveLength(1);
    const v = r.samples[0]!.v;
    expect(v[CH.cu]).toBeCloseTo(1);
    expect(v[CH.cv]).toBeCloseTo(0);
    expect(v[CH.wdx]).toBeCloseTo(0);
    expect(v[CH.wdy]).toBeCloseTo(-1);
    expect(v[CH.sdx]).toBeCloseTo(-1);
    expect(r.time).toBe(Date.parse('2026-11-11T12:30Z'));
  });
  it('shippingLanes keeps lines and classes and drops others', () => {
    const fc = shippingLanes({ features: [
      { geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { Type: 'Major' } },
      { geometry: { type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]]] }, properties: { Type: 'Middle' } },
      { geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} },
      { geometry: { type: 'Point', coordinates: [0, 0] }, properties: { Type: 'Major' } },
    ] });
    expect(fc.features.map((f) => f.properties.type)).toEqual(['major', 'middle', 'minor']);
  });
});

describe('flood', () => {
  const day = (n: number) => `2026-11-${String(10 + n).padStart(2, '0')}`;
  const row = (lat: number, q: number[], med: number[]) => ({ latitude: lat, longitude: 7, daily: { time: [day(0), day(1), day(2), day(3), day(4), day(5), day(6), day(7), day(8)], river_discharge: q, river_discharge_median: med } });
  const flat = Array(9).fill(100);
  it('keeps the probe with the highest discharge today per station and skips empty ones', () => {
    const rows = [row(1, [3, ...Array(8).fill(3)], flat), row(2, [500, ...Array(8).fill(500)], flat), row(3, flat, flat), { latitude: 9, longitude: 9 }, { latitude: 9, longitude: 9 }, { latitude: 9, longitude: 9 }];
    const r = floodStations(rows, { group: 3, today: day(1) });
    expect(r).toHaveLength(2);
    expect(r[0]!.lat).toBe(2);
    expect(r[0]!.q).toHaveLength(8);
    expect(r[1]).toBeNull();
  });
  it('computes status: ratio, 7-day trend, 30-day maximum', () => {
    const q = [100, 105, 120, 140, 160, 170, 180, 200, 150];
    const s = riverStatus({ q, med: [50, 50] })!;
    expect(s.ratio).toBeCloseTo(2);
    expect(s.trend).toBe('rising');
    expect(s.change7).toBeCloseTo(1);
    expect(s.max30).toBe(200);
    expect(s.max30Day).toBe(7);
    expect(s.spark).toHaveLength(8);
    expect(riverStatus({ q: [100, 100, 100, 100, 100, 100, 100, 95], med: [100] })!.trend).toBe('stable');
    expect(riverStatus({ q: [100, 90, 80, 70, 60, 50, 40, 30], med: [] })!.trend).toBe('falling');
    expect(riverStatus({ q: [null, 1], med: [] })).toBeNull();
  });
  it('sparkline scales between min and max', () => {
    expect(sparkline([0, 5, 10])).toBe('▁▅█');
    expect(sparkline([4, 4])).toHaveLength(2);
  });
});

describe('rivers', () => {
  const line = (n: string, rank: number, c: [number, number][]) => ({ geometry: { type: 'LineString', coordinates: c }, properties: { n, r: rank } });
  const rivers = riversOf({ features: [line('Long', 1, Array.from({ length: 21 }, (_, i) => [i, 50] as [number, number])), line('Tiny', 6, [[0, 0], [0.5, 0]]), line('Mid', 3, [[0, 10], [8, 10]])] });
  it('walks along a line by arc length', () => {
    const p = pointAt([[0, 0], [10, 0], [10, 10]], 0.5);
    expect(p[0]).toBeCloseTo(10, 0);
    expect(Math.abs(p[1])).toBeLessThan(0.5);
  });
  it('picks stations by rank and length within the cap, never from tiny rivers', () => {
    const st = pickStations(rivers, 100);
    expect(st.every((s) => s.name !== 'Tiny')).toBe(true);
    expect(st.filter((s) => s.name === 'Long').length).toBeGreaterThanOrEqual(2);
    expect(pickStations(rivers, 3).length).toBeLessThanOrEqual(3);
    const probes = probeCoords(st.slice(0, 2));
    expect(probes.lat).toHaveLength(10);
  });
  it('builds pieces whose discharge interpolates between stations and ignores probe misses', () => {
    const st = pickStations(rivers, 100).filter((s) => s.name === 'Long');
    const mkData = (q: number) => ({ lat: 50, lon: 0, t0: 0, q: Array(30).fill(q), med: Array(30).fill(100) });
    const results = st.map((station, i) => ({ station, data: mkData(i === 1 ? 2 : 100 * (i + 1)) })); // station 1 missed the channel
    const fc = buildPieces(rivers, results, 100);
    expect(fc.features.length).toBeGreaterThan(2);
    const qs = fc.features.map((f) => f.properties.q);
    expect(Math.min(...qs)).toBeGreaterThan(50); // the missed probe (2 m³/s) is not drawn
    expect(Math.max(...qs)).toBeGreaterThanOrEqual(qs[0]!);
    expect(fc.features.every((f) => f.properties.name === 'Long')).toBe(true);
  });
});
