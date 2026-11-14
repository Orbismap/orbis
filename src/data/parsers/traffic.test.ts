import { describe, expect, it } from 'vitest';
import * as sat from 'satellite.js';
import { aircraftReadsb, coverCircles, countryOfHex, type AircraftProps } from './readsb';
import { aisLocations, aisVessels, shipClass } from './ais';
import { stationNames, trainDetail, trainLocations, withHeading } from './trains';
import { sondes, type SondeProps } from './sondes';
import { tleParse } from './tle';
import { launchesParse, groupByPad } from './launches';
import { airportsParse } from './airports';
import { groundMotion, groundTrack, initSats, positionAt } from './orbit';
import { aircraftColor, altitudeText, compass, countdownText, rateText, scaleColor, speedText } from './traffic';
import { runParser } from '../worker/pool';

const NOW = 1794342293000;

describe('aircraft (readsb)', () => {
  const raw = {
    now: NOW,
    ac: [
      { hex: '300738', flight: 'DLA398  ', r: 'I-ADJV', t: 'E195', alt_baro: 1325, gs: 147.0, track: 178.83, baro_rate: 3520, squawk: '1000', category: 'A3', lat: 49.996824, lon: 8.526207, seen_pos: 0.12 },
      { hex: '3c6659', flight: 'DLH3KX  ', r: 'D-AIRY', t: 'A321', alt_baro: 'ground', gs: 0.1, track: 157.5, lat: 50.040874, lon: 8.559667, seen_pos: 25.1 },
      { hex: '3c4dd7', flight: 'CHX12   ', t: 'EC35', alt_baro: 800, gs: 90, track: 10, category: 'A7', dbFlags: 1, squawk: '7700', lat: 50.1, lon: 8.6, seen_pos: 1 },
      { hex: 'abc123', flight: 'NOPOS' },
    ],
  };
  const list = aircraftReadsb(raw);
  it('keeps aircraft with a position and converts units', () => {
    expect(list).toHaveLength(3);
    const a = list[0]!;
    const p = a.props as unknown as AircraftProps;
    expect(a.id).toBe('300738');
    expect(p.call).toBe('DLA398');
    expect(p.alt).toBe(404); // 1325 ft
    expect(p.vr).toBeCloseTo(17.9, 1); // 3520 ft/min
    expect(a.speed).toBeCloseTo(75.6, 0); // 147 kn
    expect(a.heading).toBeCloseTo(178.83);
    expect(a.t).toBe(NOW - 120);
    expect(p.country).toBe('Italien');
  });
  it('detects ground, helicopters, military and emergencies', () => {
    const g = list[1]!.props as unknown as AircraftProps;
    expect(g.gnd).toBe(true);
    expect(g.alt).toBe(0);
    expect(list[1]!.speed).toBe(0);
    const h = list[2]!.props as unknown as AircraftProps;
    expect(h.heli).toBe(true);
    expect(h.mil).toBe(true);
    expect(h.emerg).toBe(true);
    expect((list[0]!.props as unknown as AircraftProps).emerg).toBe(false);
  });
  it('handles seconds based `now` and empty input', () => {
    expect(aircraftReadsb({ now: NOW / 1000, aircraft: [{ hex: 'a1', lat: 1, lon: 2, seen: 2 }] })[0]!.t).toBe(NOW - 2000);
    expect(aircraftReadsb(null)).toEqual([]);
  });
  it('maps ICAO blocks to countries', () => {
    expect(countryOfHex('3c6659')).toBe('Deutschland');
    expect(countryOfHex('a1b2c3')).toBe('USA');
    expect(countryOfHex('zzzzzz')).toBe('');
  });
  it('covers a view with a few circles of at most 250 nm', () => {
    const small = coverCircles([8, 49, 10, 51]);
    expect(small).toHaveLength(1);
    expect(small[0]!.nm).toBeLessThanOrEqual(250);
    const big = coverCircles([-10, 35, 30, 60], 250, 6);
    expect(big.length).toBeGreaterThan(1);
    expect(big.length).toBeLessThanOrEqual(6);
    for (const c of big) expect(c.nm).toBeLessThanOrEqual(250);
  });
});

describe('ships (Digitraffic AIS)', () => {
  const loc = {
    type: 'FeatureCollection',
    features: [
      { mmsi: 273125140, type: 'Feature', geometry: { type: 'Point', coordinates: [29.349455, 60.109752] }, properties: { mmsi: 273125140, sog: 0.2, cog: 144.0, navStat: 1, heading: 235, timestampExternal: 1794342226529 } },
      { mmsi: 230980000, type: 'Feature', geometry: { type: 'Point', coordinates: [21.7, 60.1] }, properties: { mmsi: 230980000, sog: 12.4, cog: 90.0, navStat: 0, heading: 511, timestampExternal: 1794342226529 } },
      { mmsi: 1, type: 'Feature', geometry: { type: 'Point', coordinates: [21.7, 60.1] }, properties: { mmsi: 1, sog: 0, cog: 360, navStat: 5, heading: 511, timestampExternal: 1794342226529 } },
    ],
  };
  const vessels = [{ callSign: 'SMLT', destination: 'SE VBY', draught: 62, imo: 9763655, mmsi: 266445000, name: 'VISBY ', referencePointA: 28, referencePointB: 172, referencePointC: 13, referencePointD: 13, shipType: 60 }];
  it('derives heading, speed and moving flag', () => {
    const l = aisLocations(loc);
    expect(l).toHaveLength(3);
    expect(l[0]!.heading).toBe(235); // slow: true heading
    expect(l[0]!.speed).toBe(0);
    expect(l[1]!.heading).toBe(90); // moving: course
    expect(l[1]!.speed).toBeCloseTo(6.38, 1);
    expect(l[2]!.heading).toBeUndefined(); // no course, no heading: the layer fills it in
    expect(l[1]!.t).toBe(1794342226529);
  });
  it('parses vessel master data', () => {
    const v = aisVessels(vessels)['266445000']!;
    expect(v.name).toBe('VISBY');
    expect(v.draught).toBe(6.2);
    expect(v.len).toBe(200);
    expect(v.wid).toBe(26);
  });
  it('classifies ship types', () => {
    expect(shipClass(60)).toBe('passenger');
    expect(shipClass(79)).toBe('cargo');
    expect(shipClass(84)).toBe('tanker');
    expect(shipClass(30)).toBe('fishing');
    expect(shipClass(52)).toBe('special');
    expect(shipClass(0)).toBe('other');
    expect(shipClass(undefined)).toBe('other');
  });
});

describe('trains (Digitraffic Rail)', () => {
  const raw = [
    { accuracy: 0, isGpsLocation: true, location: { type: 'Point', coordinates: [29.887751, 61.97707] }, speed: 135, trainNumber: 11, departureDate: '2026-11-10', timestamp: '2026-11-10T20:24:55.000Z' },
    { accuracy: 0, isGpsLocation: true, location: { type: 'Point', coordinates: [25.134349, 60.468766] }, speed: 0, trainNumber: 12, departureDate: '2026-11-10', timestamp: '2026-11-10T20:24:55.000Z' },
  ];
  it('parses locations in m/s', () => {
    const l = trainLocations(raw);
    expect(l).toHaveLength(2);
    expect(l[0]!.id).toBe('2026-11-10:11');
    expect(l[0]!.speed).toBeCloseTo(37.5, 1);
    expect(l[0]!.t).toBe(Date.parse('2026-11-10T20:24:55.000Z'));
  });
  it('derives the heading from consecutive fixes', () => {
    const prev = new Map();
    const first = withHeading(trainLocations(raw), prev);
    expect(first[0]!.heading).toBeUndefined();
    expect((first[0]!.props as { hd: boolean }).hd).toBe(false);
    const moved = trainLocations(raw);
    moved[0]!.lat += 0.01; // north
    const second = withHeading(moved, prev);
    expect(second[0]!.heading).toBeCloseTo(0, 0);
    expect((second[0]!.props as { hd: boolean }).hd).toBe(true);
    // standing still keeps the heading
    const third = withHeading(trainLocations(raw).map((t, i) => (i === 0 ? { ...t, lat: t.lat + 0.01 } : t)), prev);
    expect(third[0]!.heading).toBeCloseTo(0, 0);
  });
  it('builds the detail card data', () => {
    const names = stationNames([{ stationShortCode: 'HKI', stationName: 'Helsinki asema' }, { stationShortCode: 'TPE', stationName: 'Tampere asema' }]);
    expect(names.HKI).toBe('Helsinki');
    const d = trainDetail([{ trainType: 'IC', trainCategory: 'Long-distance', operatorShortCode: 'vr', commuterLineID: '', timeTableRows: [{ stationShortCode: 'HKI' }, { stationShortCode: 'TPE', actualTime: 'x', differenceInMinutes: 3 }] }], names, 27);
    expect(d).toMatchObject({ title: 'IC 27', category: 'Fernverkehr', from: 'Helsinki', to: 'Tampere', delay: 3 });
  });
});

describe('radiosondes (SondeHub)', () => {
  const raw = {
    Y2422079: { serial: 'Y2422079', manufacturer: 'Vaisala', type: 'RS41', subtype: 'RS41-SGP', datetime: '2026-11-10T20:24:31.994000Z', lat: 32.76993, lon: -79.68793, alt: 6593.92, temp: -16.2, humidity: 72.2, pressure: 449.67, vel_v: 5.18, vel_h: 17.74, heading: 91.9, frequency: 400.5, burst_timer: 65535, uploader_callsign: 'Jimmy' },
    landed: { serial: 'X1', datetime: '2026-11-10T20:00:00Z', lat: 10, lon: 20, alt: 30, vel_v: -0.1 },
    bad: { serial: 'B', lat: 1 },
  };
  it('parses telemetry', () => {
    const l = sondes(raw);
    expect(l).toHaveLength(2);
    const p = l[0]!.props as unknown as SondeProps;
    expect(p.alt).toBe(6594);
    expect(p.phase).toBe(1);
    expect(p.burst).toBeUndefined();
    expect(l[0]!.speed).toBeCloseTo(17.74);
    expect((l[1]!.props as unknown as SondeProps).phase).toBe(0);
  });
});

const ISS = ['ISS (ZARYA)             ', '1 25544U 98067A   26314.17503267  .00009346  00000+0  17575-3 0  9996', '2 25544  51.6322 297.6644 0007292   8.9462 351.1656 15.49289712594382'];
const POISK = ['POISK                   ', '1 36086U 09060A   26314.17503267  .00009346  00000+0  17575-3 0  9994', '2 36086  51.6322 297.6644 0007292   8.9462 351.1656 15.49289712586768'];
const CSS = ['CSS (TIANHE)            ', '1 48274U 21035A   26314.02396249  .00022456  00000+0  25655-3 0  9991', '2 48274  41.4656 130.3331 0005424 351.8700 130.1941 15.60054217309811'];
const TLE = [...ISS, ...POISK, ...CSS].join('\n') + '\n';

describe('TLE', () => {
  it('parses element sets and orbit facts', () => {
    const l = tleParse(TLE);
    expect(l).toHaveLength(3);
    expect(l[0]).toMatchObject({ id: 25544, name: 'ISS (ZARYA)', intl: '1998-067A' });
    expect(l[0]!.inc).toBeCloseTo(51.6322);
    expect(l[0]!.period).toBeCloseTo(92.95, 1);
    expect(new Date(l[0]!.epoch).toISOString().slice(0, 10)).toBe('2026-11-10');
  });
  it('drops docked modules that share an orbit when asked', () => {
    expect(tleParse(TLE, { dedupe: true }).map((r) => r.name)).toEqual(['ISS (ZARYA)', 'CSS (TIANHE)']);
  });
  it('filters by name', () => {
    expect(tleParse(TLE, { only: '^CSS' }).map((r) => r.name)).toEqual(['CSS (TIANHE)']);
  });
  it('survives junk and runs through the parser registry', async () => {
    expect(tleParse('nonsense\nmore')).toEqual([]);
    expect(await runParser('tleParse', TLE, { format: 'text' })).toHaveLength(3);
  });
});

describe('propagation (satellite.js)', () => {
  const recs = tleParse(TLE);
  const sats = initSats(sat, recs);
  const t0 = Date.UTC(2026, 10, 10, 12, 0, 0);
  it('puts the ISS at 370-460 km altitude and ~7.66 km/s', () => {
    const p = positionAt(sat, sats[0]!, new Date(t0))!;
    expect(p.alt).toBeGreaterThan(370);
    expect(p.alt).toBeLessThan(460);
    expect(p.v).toBeGreaterThan(7.5);
    expect(p.v).toBeLessThan(7.8);
    expect(Math.abs(p.lat)).toBeLessThanOrEqual(51.7);
  });
  it('derives ground motion from two positions', () => {
    const a = positionAt(sat, sats[0]!, new Date(t0))!;
    const b = positionAt(sat, sats[0]!, new Date(t0 + 5000))!;
    const m = groundMotion(a, b, 5);
    expect(m.speed).toBeGreaterThan(6500);
    expect(m.speed).toBeLessThan(7700);
    expect(m.heading).toBeGreaterThanOrEqual(0);
    expect(m.heading).toBeLessThan(360);
  });
  it('splits the ground track at the antimeridian', () => {
    const segs = groundTrack(sat, sats[0]!, t0, recs[0]!.period * 60_000, 120);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    for (const s of segs) for (const [lng] of s) expect(Math.abs(lng)).toBeLessThanOrEqual(180);
    for (const s of segs) for (let i = 1; i < s.length; i++) expect(Math.abs(s[i]![0] - s[i - 1]![0])).toBeLessThan(60);
  });
});

describe('launches', () => {
  const mk = (id: string, net: string, pad: number) => ({
    id, name: `Rocket | ${id}`, net, status: { abbrev: 'Go', name: 'Go for Launch' }, window_start: net, window_end: net,
    launch_service_provider: { name: 'SpaceX' }, rocket: { configuration: { full_name: 'Falcon 9 Block 5' } },
    mission: { name: 'USSF-627', type: 'Government', orbit: { name: 'Low Earth Orbit' } },
    pad: { id: pad, name: `Pad ${pad}`, latitude: 34.7, longitude: -120.6, location: { name: 'Vandenberg SFB, CA, USA' }, country: { name: 'United States of America' } },
    webcast_live: false, vid_urls: [{ priority: 9, url: 'https://vimeo.com/1' }, { priority: 8, url: 'https://www.youtube.com/watch?v=abc' }], info_urls: [{ priority: 10, url: 'https://www.spacex.com/launches/ussf627' }],
    net_precision: { name: 'Minute' },
  });
  const raw = { results: [mk('b', '2026-11-12T02:35:00Z', 1), mk('a', '2026-11-11T11:40:00Z', 2), mk('c', '2026-11-20T00:00:00Z', 1), { id: 'nopad', net: '2026-11-11T00:00:00Z' }] };
  it('parses and sorts by launch time', () => {
    const l = launchesParse(raw);
    expect(l.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(l[0]).toMatchObject({ provider: 'SpaceX', rocket: 'Falcon 9 Block 5', mission: 'USSF-627', orbit: 'Low Earth Orbit', status: 'Go', webcast: 'https://www.youtube.com/watch?v=abc' });
  });
  it('groups launches by pad, next launch first', () => {
    const pads = groupByPad(launchesParse(raw));
    expect(pads).toHaveLength(2);
    expect(pads[0]!.id).toBe(2);
    expect(pads[1]!.launches.map((x) => x.id)).toEqual(['b', 'c']);
  });
});

describe('airports', () => {
  it('builds features from compact rows', () => {
    const fc = airportsParse({ rows: [['EDDF', 'FRA', 'Frankfurt Airport', 8.5706, 50.0333, 364, 1, 'DE', 'Frankfurt'], ['EDDG', 'FMO', 'Münster Osnabrück', 7.685, 52.13, 160, 2, 'DE', 'Münster']] });
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toMatchObject({ icao: 'EDDF', iata: 'FRA', large: true, elevFt: 364 });
    expect(fc.features[1]!.properties.large).toBe(false);
  });
});

describe('traffic helpers', () => {
  it('formats speed, altitude and rates', () => {
    const n = (s: string) => s.replace(/\u202f/g, ' ');
    expect(n(speedText(250))).toBe('900 km/h (486 kn)');
    expect(n(altitudeText(10668))).toBe('10.668 m (35.000 ft)');
    expect(n(rateText(-8))).toBe('\u22128,0 m/s');
    expect(n(rateText(12.5))).toBe('+12,5 m/s');
  });
  it('counts down and up', () => {
    const now = Date.UTC(2026, 10, 10, 12);
    expect(countdownText(now + 45 * 60_000, now)).toBe('in 45 Min.');
    expect(countdownText(now + 2 * 3_600_000 + 15 * 60_000, now)).toBe('in 2 Std. 15 Min.');
    expect(countdownText(now + 50 * 3_600_000, now)).toBe('in 2 Tagen 2 Std.');
    expect(countdownText(now - 5 * 60_000, now)).toBe('vor 5 Min.');
  });
  it('compass and colour scale', () => {
    expect(compass(0)).toBe('N');
    expect(compass(92)).toBe('O');
    expect(compass(359)).toBe('N');
    expect(scaleColor([[0, '#000000'], [10, '#ffffff']], 5)).toBe('#808080');
    expect(scaleColor([[0, '#000000'], [10, '#ffffff']], 99)).toBe('#ffffff');
  });
});

describe('aircraftColor', () => {
  it('is pink for military, red for emergencies, yellow for everything else', () => {
    expect(aircraftColor({ emerg: true, mil: true })).toBe('#ff3b3b');
    expect(aircraftColor({ emerg: false, mil: true })).toBe('#ff4fb8');
    expect(aircraftColor({ emerg: false, mil: false })).toBe('#ffd84a');
  });
});
