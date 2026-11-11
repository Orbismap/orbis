import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gvpVolcanoes } from './gvp';
import { fireConfidence, firmsFires } from './firms';
import { gdacsEvents } from './gdacs';
import { eonetEvents } from './eonet';
import { tsunamiBulletins } from './tsunami';
import { nwsAlerts } from './nws';
import { dwdWarnings } from './dwd';
import { AURORA_H, AURORA_W, auroraGrid, latestKp } from './aurora';
import { bfsDose, hcDose, safecastDose, stukDose } from './radiation';
import { lzwDecode, parseStrike } from './blitzortung';
import { runParser } from '../worker/pool';

const fx = (n: string) => readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8');
const json = (n: string) => JSON.parse(fx(n));
const NOW = Date.parse('2026-11-10T20:00:00Z');

describe('gvpVolcanoes', () => {
  it('classifies by last eruption and drops long text', () => {
    const fc = gvpVolcanoes(json('gvp.json'), { now: NOW });
    const by = Object.fromEntries(fc.features.map((f) => [f.properties.name, f.properties]));
    expect(by['Stromboli']).toMatchObject({ state: 'active', rank: 2, last: 2026 });
    expect(by['Campi Flegrei']).toMatchObject({ state: 'dormant', rank: 0, last: 1538 });
    expect(by['West Eifel Volcanic Field']!.last).toBe(-8300);
    expect(JSON.stringify(fc)).not.toContain('Geological');
    expect(gvpVolcanoes(null).features).toEqual([]);
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
