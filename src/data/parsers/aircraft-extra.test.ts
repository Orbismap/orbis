import { describe, expect, it } from 'vitest';
import { GnssStore, cellsGeoJson } from './gnss';
import { openskyStates, snapshotStale } from './opensky';
import { aircraftReadsb, navQuality, type AircraftProps } from './readsb';

describe('opensky', () => {
  const raw = { time: 1794401077, states: [
    ['e8027d', 'LPE2125 ', 'Chile', 1794401075, 1794401075, -79.76, -7.56, 11582.4, false, 226.39, 333.26, 0.33, null, 12390.12, null, false, 0, 6],
    ['801638', 'AXB31Z  ', 'India', 1794400891, 1794400891, 77.11, 28.56, null, true, 4.89, 98.44, null, null, null, null, false, 0, 0],
    ['abcdef', null, 'X', null, null, null, null, null, false, null, null, null, null, null, null, false, 0, 0],
  ] };
  it('maps state vectors and skips those without position', () => {
    const t = openskyStates(raw);
    expect(t).toHaveLength(2);
    const p = t[0]!.props as unknown as AircraftProps;
    expect(p.call).toBe('LPE2125');
    expect(p.alt).toBe(11582);
    expect(p.cat).toBe('A5');
    expect((t[1]!.props as unknown as AircraftProps).gnd).toBe(true);
  });
  it('tolerates garbage', () => { expect(openskyStates(null)).toEqual([]); expect(openskyStates({ states: null })).toEqual([]); });
  it('treats a snapshot without a recent position as stale', () => {
    const t = openskyStates(raw);
    const newest = 1794401075 * 1000;
    expect(snapshotStale(t, newest + 5 * 60_000)).toBe(false);
    expect(snapshotStale(t, newest + 11 * 60_000)).toBe(true);
    expect(snapshotStale([], newest)).toBe(true);
  });
});

describe('navigation quality', () => {
  const base = { alt_baro: 35000, type: 'adsb_icao', version: 2 };
  it('rates NACp/NIC and GPS loss', () => {
    expect(navQuality({ ...base, nic: 8, nac_p: 9 }, false).nav).toBe(0);
    expect(navQuality({ ...base, nic: 8, nac_p: 5 }, false).nav).toBe(1);
    expect(navQuality({ ...base, nic: 0, nac_p: 10 }, false).nav).toBe(0);
    const lost = navQuality({ ...base, gpsOkBefore: 30, gpsOkLat: 50, gpsOkLon: 8 }, false);
    expect(lost).toEqual({ nav: 1, navLng: 8, navLat: 50 });
    expect(navQuality({ ...base, nic: 8, nac_p: 5 }, true).nav).toBe(-1);
    expect(navQuality({ alt_baro: 100, type: 'adsb_icao', version: 0, nic: 1 }, false).nav).toBe(-1);
  });
  it('is part of the parsed aircraft, obstacles are dropped', () => {
    const t = aircraftReadsb({ now: 1, ac: [
      { hex: 'abc123', lat: 1, lon: 2, alt_baro: 30000, type: 'adsb_icao', version: 2, nic: 8, nac_p: 4 },
      { hex: 'def456', lat: 1, lon: 2, category: 'C3' },
    ] });
    expect(t).toHaveLength(1);
    expect((t[0]!.props as unknown as AircraftProps).nav).toBe(1);
  });
});

describe('GnssStore', () => {
  const ac = (id: string, nav: number, lng = 10.1, lat = 50.1) => ({ id, lng, lat, t: 0, props: { nav } as unknown as Record<string, number> });
  it('discounts one outlier and grades the cell', () => {
    const s = new GnssStore();
    const now = 1_000_000;
    const list = Array.from({ length: 20 }, (_, i) => ac(`a${i}`, i < 4 ? 1 : 0));
    const bad = s.feed(list, now);
    expect(bad).toHaveLength(4);
    const cells = s.cells(now);
    expect(cells).toHaveLength(1);
    expect(cells[0]!.pct).toBeCloseTo(15); // (4-1)/20
    expect(cells[0]!.level).toBe('high');
    expect(cellsGeoJson(cells).features[0]!.properties!.level).toBe('high');
  });
  it('hides cells with too few aircraft and expires after 30 min', () => {
    const s = new GnssStore();
    s.feed([ac('a', 1), ac('b', 0)], 0);
    expect(s.cells(0)).toHaveLength(0);
    s.feed(Array.from({ length: 5 }, (_, i) => ac(`x${i}`, 0)), 0);
    expect(s.cells(0)).toHaveLength(1);
    expect(s.cells(31 * 60_000)).toHaveLength(0);
  });
});
