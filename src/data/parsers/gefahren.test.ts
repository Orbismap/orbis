import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gvpVolcanoes, summaryExcerpt } from './gvp';
import { gvpEruptions, eruptionYears } from './eruptions';
import { fireConfidence, firmsFires } from './firms';
import { gdacsEvents } from './gdacs';
import { eonetEvents } from './eonet';
import { tsunamiBulletins } from './tsunami';
import { nwsAlerts } from './nws';
import { dwdWarnings } from './dwd';
import { AURORA_H, AURORA_W, auroraGrid, latestKp } from './aurora';
import { bfsDose, bfsVoronoi, hcDose, safecastAir, safecastDose, safecastTrack, stukDose } from './radiation';
import { lzwDecode, parseStrike } from './blitzortung';
import { runParser } from '../worker/pool';

const fx = (n: string) => readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8');
const json = (n: string) => JSON.parse(fx(n));
const NOW = Date.parse('2026-11-10T20:00:00Z');

describe('gvpVolcanoes', () => {
  it('classifies by last eruption and carries the inspector facts', () => {
    const fc = gvpVolcanoes(json('gvp.json'), { now: NOW });
    const by = Object.fromEntries(fc.features.map((f) => [f.properties.name, f.properties]));
    expect(by['Stromboli']).toMatchObject({ state: 'active', rank: 2, last: 2026 });
    expect(by['Campi Flegrei']).toMatchObject({ state: 'dormant', rank: 0, last: 1538 });
    expect(by['West Eifel Volcanic Field']!.last).toBe(-8300);
    expect(by['Stromboli']).toMatchObject({
      landform: 'Composite',
      setting: 'Subduction zone / Continental crust (> 25 km)',
      rock: 'Trachyandesite / Basaltic Trachyandesite',
      epoch: 'Holocene',
      evidence: 'Eruption Observed',
      photo: 'https://volcano.si.edu/gallery/photos/GVP-09131.jpg',
    });
    expect(by['Stromboli']!.photoCredit).toContain('Smithsonian');
    expect(by['Stromboli']!.summary!.length).toBeLessThanOrEqual(321);
    expect(by['Stromboli']!.summary!.endsWith('.') || by['Stromboli']!.summary!.endsWith('…')).toBe(true);
    expect(gvpVolcanoes(null).features).toEqual([]);
  });
  it('shortens the summary without cutting words', () => {
    expect(summaryExcerpt('Kurzer Text.')).toBe('Kurzer Text.');
    const long = `${'Ein Satz mit Inhalt. '.repeat(30)}Ende.`;
    const s = summaryExcerpt(long)!;
    expect(s.length).toBeLessThanOrEqual(321);
    expect(s.endsWith('.') || s.endsWith('…')).toBe(true);
    expect(summaryExcerpt(undefined)).toBeUndefined();
  });
});

describe('gvpEruptions', () => {
  const raw = {
    u: '2026-11-15T00:00:00Z',
    v: [
      [38.789, 15.213, 211040, 'Stromboli', [[2026, 1, 15, 2, 1], [-4250, 0, 0, 5, 0]]],
      [64.416, -17.316, 373010, 'Bárðarbunga', [[2014, 8, 29, 0, 1]]],
      [0, 0, 1, 'Kaputt', [[NaN, 0, 0, 0, 1]]],
    ],
  };
  it('turns grouped years into eruption points', () => {
    const fc = gvpEruptions(raw);
    expect(fc.features).toHaveLength(3);
    expect(fc.features[0]!.properties).toMatchObject({ vnum: 211040, name: 'Stromboli', year: 2026, month: 1, day: 15, vei: 2, conf: 1 });
    expect(fc.features[1]!.properties).toMatchObject({ year: -4250, vei: 5, conf: 0 });
    expect(fc.features[2]!.properties).toMatchObject({ name: 'Bárðarbunga', year: 2014, month: 8, day: 29, vei: 0 });
    expect(new Set(fc.features.map((f) => f.id)).size).toBe(3);
    expect(eruptionYears(fc)).toEqual({ from: -4250, to: 2026 });
    expect(gvpEruptions(null).features).toEqual([]);
  });
});

describe('firmsFires', () => {
  it('drops low confidence and keeps minutes', () => {
    const raw = json('firms.json');
    const fc = firmsFires(raw);
    expect(fc.features.length).toBeLessThan(raw.rows.length);
    expect(fc.features.every((f) => f.properties.c >= 1)).toBe(true);
    expect(fc.features[0]!.properties.t).toBe(raw.rows[0][4]);
    expect(fireConfidence('95')).toBe(2);
    expect(fireConfidence(20)).toBe(0);
    expect(fireConfidence('l')).toBe(0);
  });
});

describe('gdacsEvents', () => {
  it('slims events and reads alert level and period as UTC', () => {
    const fc = gdacsEvents(json('gdacs.json'));
    expect(fc.features.length).toBeGreaterThanOrEqual(4);
    const dr = fc.features.find((f) => f.properties.type === 'DR')!.properties;
    expect(dr.alert).toBeGreaterThanOrEqual(1);
    expect(dr.from).toBeLessThan(dr.to);
    expect(dr.id).toMatch(/^DR\d+$/);
    expect(dr.url).toContain('gdacs.org');
    expect(dr.name).not.toMatch(/\s{2}/);
    const tc = fc.features.find((f) => f.properties.type === 'TC')!.properties;
    expect(tc.unit).toBe('km/h');
    expect(tc.sev).toBeGreaterThan(50);
  });
});

describe('eonetEvents', () => {
  it('uses the latest position and skips earthquakes', () => {
    const fc = eonetEvents(json('eonet.json'));
    expect(fc.features.some((f) => f.properties.cat === 'earthquakes')).toBe(false);
    const f = fc.features[0]!;
    expect(f.properties.t).toBeGreaterThanOrEqual(f.properties.t0);
    expect(f.properties.url).toMatch(/^http/);
  });
});

describe('tsunamiBulletins', () => {
  it('parses the NTWC atom feed', () => {
    const fc = tsunamiBulletins(fx('tsunami-alaska.xml'));
    expect(fc.features).toHaveLength(1);
    const p = fc.features[0]!.properties;
    expect(fc.features[0]!.geometry.coordinates).toEqual([-125.484, 40.396]);
    expect(p).toMatchObject({ level: 0, category: 'Information', mag: 4.5, magType: 'Ml', t: Date.parse('2026-11-05T05:01:47Z') });
    expect(p.region).toBe('75 miles SW of Eureka, California');
    expect(p.note).toBe('There is NO tsunami danger from this earthquake.');
    expect(p.url).toContain('WEAK53.txt');
    expect(p.centre).toContain('Tsunami Warning Center');
  });
  it('parses the PTWC feed and handles empty input', () => {
    const p = tsunamiBulletins(fx('tsunami-info.xml')).features[0]!.properties;
    expect(p.mag).toBe(4.6);
    expect(p.region).toBe('ABOUT 72 MILES NORTHWEST OF PUERTO RICO');
    expect(tsunamiBulletins('').features).toEqual([]);
    expect(tsunamiBulletins(undefined).features).toEqual([]);
  });
});

describe('nwsAlerts', () => {
  const poly = { type: 'Polygon', coordinates: [[[-97, 35], [-96, 35], [-96, 36], [-97, 35]]] };
  const raw = {
    type: 'FeatureCollection',
    features: [
      { id: 'https://api.weather.gov/alerts/urn:1', geometry: poly, properties: { id: 'urn:1', event: 'Tornado Warning', headline: 'Tornado Warning issued', areaDesc: 'Cleveland, OK', description: 'x'.repeat(3000), instruction: 'Take cover', onset: '2026-11-10T19:00:00-06:00', ends: null, expires: '2026-11-10T20:00:00-06:00', severity: 'Extreme', senderName: 'NWS Norman OK' } },
      { id: 'zone', geometry: null, properties: { event: 'Tornado Watch' } },
    ],
  };
  it('keeps polygon alerts, truncates text, reads times', () => {
    const fc = nwsAlerts(raw);
    expect(fc.features).toHaveLength(1);
    const p = fc.features[0]!.properties;
    expect(p.event).toBe('Tornado Warning');
    expect(p.description.length).toBeLessThan(1700);
    expect(p.onset).toBe(Date.parse('2026-11-11T01:00:00Z'));
    expect(p.expires).toBe(Date.parse('2026-11-11T02:00:00Z'));
    expect(nwsAlerts({ type: 'FeatureCollection', features: [] }).features).toEqual([]);
  });
});

describe('dwdWarnings', () => {
  it('maps severity to levels and official colours, sorts by level', () => {
    const fc = dwdWarnings(json('dwd.json'));
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties.level).toBe(1);
    expect(fc.features[0]!.properties.color).toBe('#FFEB3B');
    expect(fc.features[1]!.properties).toMatchObject({ level: 3, color: '#FF0000', event: 'STARKREGEN' });
    expect(fc.features[0]!.properties.expires).toBeGreaterThan(0);
  });
});

describe('aurora', () => {
  it('builds a 360x181 probability grid', () => {
    const g = auroraGrid(json('aurora.json'));
    expect(g.probs).toHaveLength(AURORA_W * AURORA_H);
    expect(g.probs[(70 + 90) * AURORA_W + 10]).toBe(88);
    expect(g.probs[20]).toBe(100); // lat -90, lon 20
    expect(g.max).toBe(100);
    expect(g.obs).toBe(Date.parse('2026-11-10T20:13:00Z'));
  });
  it('reads the latest Kp', () => {
    expect(latestKp([{ time_tag: '2026-11-10T12:00:00', Kp: 1.33 }, { time_tag: '2026-11-10T15:00:00', Kp: '3.00' }])).toEqual({ kp: 3, time: Date.parse('2026-11-10T15:00:00Z') });
    expect(latestKp(null)).toBeUndefined();
  });
});

describe('radiation parsers', () => {
  it('BfS: drops stations without value', () => {
    const fc = bfsDose(json('bfs.json'));
    expect(fc.features).toHaveLength(3);
    const p = fc.features[0]!.properties;
    expect(p.net).toBe('bfs');
    expect(p.v).toBeGreaterThan(0.01);
    expect(p.v).toBeLessThan(1);
    expect(p.t).toBeGreaterThan(0);
    expect(p.status).toBe('in Betrieb');
    expect(p.kenn).toBe('083170571');
  });
  it('STUK and Health Canada rows', () => {
    const s = stukDose(json('stuk.json')).features[0]!.properties;
    expect(s).toMatchObject({ net: 'stuk', name: 'Helsinki Vuosaaren Satama', v: 0.111 });
    expect(s.t).toBe(1794340200 * 1000);
    expect(hcDose(json('hc.json')).features[0]!.properties.net).toBe('hc');
  });
  it('Safecast: counts per minute to µSv/h, age filter', () => {
    const raw = json('safecast.json');
    const fc = safecastDose(raw, { now: Date.parse('2026-11-10T00:00:00Z'), maxAgeDays: 30 });
    expect(fc.features).toHaveLength(3);
    expect(fc.features[0]!.properties.v).toBeCloseTo(87.9375 / 334, 3);
    expect(safecastDose(raw, { now: Date.parse('2026-11-10T00:00:00Z'), maxAgeDays: 3 }).features).toHaveLength(0);
  });
  it('Safecast bGeigie: imports become tracks with stats', () => {
    const fc = safecastTrack(json('safecast-tracks.json'));
    expect(fc.features).toHaveLength(1);
    const f = fc.features[0]!;
    expect(f.geometry.type).toBe('LineString');
    expect(f.properties).toMatchObject({ source: 'a.log', credits: 'tester', min: 0.03, max: 0.06, avg: 0.045, count: 2 });
    expect(f.properties.t).toBe(Date.parse('2026-11-10T00:00:00Z'));
    // raw import with points is converted too
    const raw = safecastTrack([
      { id: 7, credits: 'x', source: { url: 'https://example.org/b.log' }, created_at: '2026-11-10T00:00:00Z', points: [[37.0, 140.0, 12], [37.1, 140.1, 20]] },
    ]);
    expect(raw.features).toHaveLength(1);
    expect(raw.features[0]!.properties.source).toBe('b.log');
    expect(raw.features[0]!.properties.avg).toBeCloseTo((12 / 334 + 20 / 334) / 2, 5);
    expect(safecastTrack(null).features).toEqual([]);
  });
  it('Safecast AirNote: PM values, skips radiation devices, stale and glitchy sensors', () => {
    const air = [
      { device_urn: 'note:dev:1', device_class: 'product:org.airnote.solar.air.v1', when_captured: '2026-11-09T20:00:00Z', loc_lat: 41.42, loc_lon: 2.17, loc_name: 'Horta-Guinardó', loc_country: 'ES', pms_pm01_0: 2.04, pms_pm02_5: 12.46, pms_pm10_0: 19.8, env_temp: 22.1, env_humid: 48.8, env_press: 99945.2, bat_voltage: 2.72, dev_dashboard: 'http://qrgo.org/ID/1' },
      { device_urn: 'note:dev:2', device_class: 'product:org.airnote.solar.air.v1', when_captured: '2026-09-01T00:00:00Z', loc_lat: 1, loc_lon: 2, pms_pm02_5: 5 },
      { device_urn: 'note:dev:3', device_class: 'product:org.airnote.solar.air.v1', when_captured: '2026-11-09T20:00:00Z', loc_lat: 3, loc_lon: 4, pms_pm02_5: 5000 },
      { device_urn: 'rad:1', device_class: 'product:com.blues.radnote', when_captured: '2026-11-09T20:00:00Z', loc_lat: 5, loc_lon: 6, lnd_7318c: 30 },
    ];
    const now = Date.parse('2026-11-10T00:00:00Z');
    const fc = safecastAir(air, { now });
    expect(fc.features).toHaveLength(1);
    const p = fc.features[0]!.properties;
    expect(p).toMatchObject({ name: 'Horta-Guinardó', pm25: 12.5, pm1: 2, pm10: 19.8, country: 'ES', bat: 2.72, dash: 'http://qrgo.org/ID/1' });
    expect(p.t).toBe(Date.parse('2026-11-09T20:00:00Z'));
    expect(safecastAir(air, { now, maxAgeDays: 0.1 }).features).toHaveLength(0);
  });
  it('BfS Voronoi: keeps valued polygons of the requested hour', () => {
    const raw = {
      features: [
        { geometry: { type: 'Polygon', coordinates: [[[13, 48], [14, 48], [14, 49], [13, 48]]] }, properties: { id: 7, value_interp: 0.156, time_measurement_end: '2026-11-15T08:00:00Z' } },
        { geometry: { type: 'Polygon', coordinates: [[[13, 48], [14, 48], [14, 49], [13, 48]]] }, properties: { id: 8, value_interp: null, time_measurement_end: '2026-11-15T08:00:00Z' } },
        { geometry: { type: 'Point', coordinates: [1, 2] }, properties: { id: 9, value_interp: 0.2, time_measurement_end: '2026-11-15T08:00:00Z' } },
      ],
    };
    const fc = bfsVoronoi(raw);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toMatchObject({ id: 'bfs-voronoi:7', v: 0.156, t: Date.parse('2026-11-15T08:00:00Z') });
    expect(fc.features[0]!.geometry.type).toBe('Polygon');
    expect(bfsVoronoi(null).features).toEqual([]);
  });
});

describe('blitzortung', () => {
  it('parses plain JSON messages (time in ns)', () => {
    const now = Date.parse('2026-11-10T20:00:00Z');
    const r = parseStrike(JSON.stringify({ time: (now - 2000) * 1e6, lat: 48.1, lon: 11.5, sig: [] }), now)!;
    expect(r.strike).toMatchObject({ lat: 48.1, lon: 11.5, t: now - 2000, recv: now });
    expect(parseStrike('{"x":1}', now)).toBeUndefined();
    expect(parseStrike('not json', now)).toBeUndefined();
  });
  it('decodes the LZW variant', () => {
    expect(lzwDecode('')).toBe('');
    expect(lzwDecode('abc')).toBe('abc');
  });
  it('decodes real stream messages and exposes duplicates by key', () => {
    const msgs = json('blitz-msgs.json') as string[];
    const now = 1794342861476;
    const r = msgs.map((m) => parseStrike(m, now)!);
    expect(r.every((x) => Math.abs(x.strike.lat) < 90 && Math.abs(x.strike.lon) <= 180)).toBe(true);
    expect(r[0]!.key).toBe(r[1]!.key);
    expect(r[2]!.key).not.toBe(r[0]!.key);
  });
  it('falls back to arrival time for implausible timestamps', () => {
    const now = Date.parse('2026-11-10T20:00:00Z');
    expect(parseStrike(JSON.stringify({ time: 1, lat: 1, lon: 1 }), now)!.strike.t).toBe(now);
  });
});

describe('pool fallback', () => {
  it('runs a registered parser by name', async () => {
    const buf = new TextEncoder().encode(fx('gdacs.json')).buffer as ArrayBuffer;
    const fc = await runParser('gdacsEvents', buf, { format: 'json' });
    expect(fc.features.length).toBeGreaterThan(0);
    const x = await runParser('tsunamiBulletins', new TextEncoder().encode(fx('tsunami-info.xml')).buffer as ArrayBuffer, { format: 'text' });
    expect(x.features).toHaveLength(1);
  });
});
