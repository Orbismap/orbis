import { describe, expect, it } from 'vitest';
import { ndbcBuoys } from './ndbc';
import { pegelStations } from './pegel';
import { plateBoundaries } from './plates';
import { coopsStations } from './tides';
import { marineWaves } from './marine';
import { runParser } from '../worker/pool';

const NDBC = `#STN       LAT      LON  YYYY MM DD hh mm WDIR WSPD   GST WVHT  DPD APD MWD   PRES  PTDY  ATMP  WTMP  DEWP  VIS   TIDE
#text      deg      deg   yr mo day hr mn degT  m/s   m/s   m   sec sec degT   hPa   hPa  degC  degC  degC  nmi     ft
14049   -12.000   65.000 2026 11 10 19 00  MM    MM    MM   MM  MM   MM  MM     MM    MM    MM  27.6    MM   MM     MM
15001   -10.000  -10.000 2026 11 10 19 00 130   7.6   8.6   MM  MM   MM  MM 1018.1    MM  23.5    MM    MM   MM     MM
41001    34.700  -72.300 2026 11 10 18 50 250  10.0  13.0  2.7   8 5.9 270 1011.2  -1.1  17.5  22.0    MM   MM     MM
BAD       95.000    0.000 2026 11 10 19 00 130   7.6   8.6   MM  MM   MM  MM 1018.1    MM  23.5    MM    MM   MM     MM
nodata    10.000   10.000 2026 11 10 19 00  MM    MM    MM   MM  MM   MM  MM     MM    MM    MM    MM    MM   MM     MM
short line`;

describe('ndbcBuoys', () => {
  const fc = ndbcBuoys(NDBC);
  it('reads valid rows and skips headers, bad coordinates and rows without values', () => {
    expect(fc.features.map((f) => f.properties.id)).toEqual(['14049', '15001', '41001']);
  });
  it('drops MM fields instead of writing NaN', () => {
    const p = fc.features[0]!.properties;
    expect(p.wtmp).toBe(27.6);
    expect('wvht' in p).toBe(false);
    expect('pres' in p).toBe(false);
  });
  it('maps the columns', () => {
    const f = fc.features[2]!;
    expect(f.geometry.coordinates).toEqual([-72.3, 34.7]);
    expect(f.properties).toMatchObject({ wdir: 250, wspd: 10, gst: 13, wvht: 2.7, dpd: 8, pres: 1011.2, atmp: 17.5, wtmp: 22 });
    expect(f.properties.time).toBe(Date.UTC(2026, 10, 10, 18, 50));
  });
  it('is registered and runs through the worker entry', async () => {
    expect((await runParser('ndbcBuoys', NDBC)).features).toHaveLength(3);
  });
});

const ts = (value: number, a: string, b: string, cv: { shortname: string; value: number }[] = []) => [
  { shortname: 'W', unit: 'cm', currentMeasurement: { timestamp: '2026-11-10T21:15:00+01:00', value, stateMnwMhw: a, stateNswHsw: b }, characteristicValues: cv },
];
const PEGEL = [
  { number: '48300105', longname: 'CELLE', km: 1.74, agency: 'VERDEN', longitude: 10.06, latitude: 52.62, water: { longname: 'ALLER' }, timeseries: ts(120, 'normal', 'normal', [{ shortname: 'MW', value: 192 }, { shortname: 'MNW', value: 117 }, { shortname: 'MHW', value: 300 }]) },
  { number: '1', longname: 'DORDRECHT', longitude: 4.67, latitude: 51.8, water: { longname: 'ALTE MAAS' }, timeseries: ts(10, 'unknown', 'unknown') },
  { number: '2', longname: 'KEINE KOORDINATEN', timeseries: ts(10, 'normal', 'unknown') },
  { number: '3', longname: 'BAD-HARZBURG', longitude: 10.5, latitude: 51.9, water: { longname: 'RADAU' }, timeseries: ts(300, 'unknown', 'high') },
  { number: '4', longname: 'NIEDRIG', longitude: 8.2, latitude: 50.0, water: { longname: 'RHEIN' }, timeseries: ts(76, 'low', 'unknown') },
  { number: '5', longname: 'OHNE MESSWERT', longitude: 9, latitude: 50, timeseries: [{ shortname: 'W', unit: 'cm' }] },
];

describe('pegelStations', () => {
  const fc = pegelStations(PEGEL);
  it('keeps only German gauges with a current value', () => {
    expect(fc.features.map((f) => f.properties.id)).toEqual(['48300105', '3', '4']);
  });
  it('title-cases names and derives deviation from mean water', () => {
    expect(fc.features[0]!.properties).toMatchObject({ name: 'Celle', water: 'Aller', level: 120, state: 'normal', mw: 192, dev: -72, mnw: 117, mhw: 300, agency: 'Verden' });
    expect(fc.features[1]!.properties.name).toBe('Bad-Harzburg');
  });
  it('classifies the state, high wins', () => {
    expect(fc.features.map((f) => f.properties.state)).toEqual(['normal', 'high', 'low']);
  });
  it('survives garbage', () => {
    expect(pegelStations(null).features).toEqual([]);
    expect(pegelStations({}).features).toEqual([]);
  });
});

describe('plateBoundaries', () => {
  const fc = plateBoundaries({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { Name: 'AF-AN', Source: 'Mueller', PlateA: 'AF', PlateB: 'AN', Type: '' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
      { type: 'Feature', properties: { Name: 'PA-NA', PlateA: 'PA', PlateB: 'NA', Type: 'subduction' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
      { type: 'Feature', properties: { Name: 'AF-AN', PlateA: 'AF', PlateB: 'AN' }, geometry: { type: 'LineString', coordinates: [[2, 2], [3, 3]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } },
    ],
  });
  it('gives German plate names, the type and unique ids', () => {
    expect(fc.features).toHaveLength(3);
    expect(fc.features[0]!.properties).toMatchObject({ aName: 'Afrika', bName: 'Antarktis', type: 'other' });
    expect(fc.features[1]!.properties).toMatchObject({ aName: 'Pazifik', bName: 'Nordamerika', type: 'subduction' });
    expect(new Set(fc.features.map((f) => f.properties.id)).size).toBe(3);
  });
});

describe('coopsStations', () => {
  it('keeps stations with coordinates', () => {
    const fc = coopsStations({ stations: [{ id: '1611400', name: 'Nawiliwili', state: 'HI', lat: 21.95, lng: -159.36 }, { id: 'x', lat: 'a' }, { name: 'ohne id', lat: 1, lng: 1 }] });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toEqual({ id: '1611400', name: 'Nawiliwili', state: 'HI' });
    expect(coopsStations(null).features).toEqual([]);
  });
});

describe('marineWaves', () => {
  it('drops land points and reads time, period and direction', () => {
    const row = (lat: number, h: number | null) => ({ latitude: lat, longitude: 10, current: { time: '2026-11-10T20:30', wave_height: h, wave_period: 9.5, wave_direction: 283 } });
    const fc = marineWaves([row(-59.96, 4.7), row(50, null)]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toMatchObject({ h: 4.7, t: 9.5, dir: 283, time: Date.UTC(2026, 10, 10, 20, 30) });
  });
  it('accepts a single-location object', () => {
    expect(marineWaves({ latitude: 1, longitude: 2, current: { time: '2026-11-10T20:30', wave_height: 1 } }).features).toHaveLength(1);
  });
});
