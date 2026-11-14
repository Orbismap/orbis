import { describe, expect, it } from 'vitest';
import { barentswatchEta, barentswatchLatest } from './barentswatch';

const rec = (over: Record<string, unknown> = {}) => ({
  mmsi: 257123456, msgtime: '2026-11-14T11:58:30+00:00', latitude: 69.65, longitude: 18.96, speedOverGround: 12.4, courseOverGround: 41.2,
  trueHeading: 40, navigationalStatus: 0, name: 'KONG HARALD ', shipType: 60, shipLength: 122, shipWidth: 19, draught: 47,
  destination: 'TROMSO', eta: '2026-11-14T14:30:00', imoNumber: 9039119, callSign: 'LJBR', ...over,
});

describe('barentswatchLatest', () => {
  it('turns a record into a track and its static data', () => {
    const { tracks, vessels } = barentswatchLatest([rec()]);
    expect(tracks).toHaveLength(1);
    const t = tracks[0]!;
    expect(t).toMatchObject({ id: '257123456', lng: 18.96, lat: 69.65, heading: 41.2, t: Date.parse('2026-11-14T11:58:30Z') });
    expect(t.speed).toBeCloseTo(12.4 * 0.514444);
    expect(t.props).toMatchObject({ mmsi: 257123456, moving: true, cls: 'passenger', name: 'KONG HARALD' });
    expect(vessels['257123456']).toMatchObject({ name: 'KONG HARALD', type: 60, dest: 'TROMSO', draught: 4.7, len: 122, wid: 19, imo: 9039119, call: 'LJBR', eta: { month: 11, day: 14, hour: 14, minute: 30 } });
  });

  it('knows the "not available" values', () => {
    const { tracks, vessels } = barentswatchLatest([rec({ speedOverGround: 102.3, courseOverGround: 360, trueHeading: 511, draught: 255, shipLength: 0, shipWidth: 0, dimensionA: 80, dimensionB: 20, dimensionC: 6, dimensionD: 6 })]);
    expect(tracks[0]!.props).toMatchObject({ sog: 0, cog: -1, hdg: -1, moving: false });
    expect(tracks[0]!.heading).toBe(0);
    expect(vessels['257123456']).toMatchObject({ draught: 0, len: 100, wid: 12 });
  });

  it('a ship at rest points along its true heading', () => {
    expect(barentswatchLatest([rec({ speedOverGround: 0, trueHeading: 270 })]).tracks[0]!.heading).toBe(270);
  });

  it('skips broken records and non-arrays', () => {
    expect(barentswatchLatest(null).tracks).toEqual([]);
    expect(barentswatchLatest({}).tracks).toEqual([]);
    expect(barentswatchLatest([rec({ latitude: null }), rec({ msgtime: 'x' }), rec({ mmsi: 0 }), rec({ longitude: 200 })]).tracks).toEqual([]);
  });
});

describe('barentswatchEta', () => {
  it('reads ISO date-times and rejects the rest', () => {
    expect(barentswatchEta('2026-12-01T06:15:00')).toEqual({ month: 12, day: 1, hour: 6, minute: 15 });
    expect(barentswatchEta('0000-00-00T24:60:00')).toBeNull();
    expect(barentswatchEta(null)).toBeNull();
    expect(barentswatchEta('')).toBeNull();
  });
});
