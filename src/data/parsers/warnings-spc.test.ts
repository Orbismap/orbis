import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ninaDetail, ninaFeatures, ninaGeometry, ninaList, plainText } from './nina';
import { reportDayStart, spcReports } from './spc';
import { runParser } from '../worker/pool';

const fx = (n: string) => readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8');

describe('nina', () => {
  it('lists warnings and drops cancellations', () => {
    const l = ninaList(JSON.parse(fx('nina-map.json')), { src: 'mowas' });
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ src: 'mowas', severity: 'Minor' });
    expect(l[0]!.onset).toBeGreaterThan(0);
    expect(ninaList(null)).toEqual([]);
  });
  it('is registered as a worker parser', async () => {
    const l = await runParser('ninaList', new TextEncoder().encode(fx('nina-map.json')).buffer as ArrayBuffer, { format: 'json', args: { src: 'katwarn' } });
    expect(l[0]!.src).toBe('katwarn');
  });
  it('reads the German text and sender, strips html', () => {
    const d = ninaDetail(JSON.parse(fx('nina-detail.json')))!;
    expect(d.headline).toContain('Trinkwasserverunreinigung');
    expect(d.sender).toBe('Integrierte Leitstelle Emmendingen');
    expect(d.instruction).not.toContain('<br');
    expect(plainText('a<br/>b&nbsp;c')).toBe('a\nb c');
    expect(ninaDetail({})).toBeUndefined();
  });
  it('merges polygons and joins everything to features', () => {
    const g = ninaGeometry(JSON.parse(fx('nina-geo.json')))!;
    expect(g.type).toBe('MultiPolygon');
    const items = [{ id: 'a', src: 'katwarn', version: 1, severity: 'Severe', title: 'T', onset: 1, expires: 0 }, { id: 'b', src: 'mowas', version: 1, severity: 'Minor', title: 'U', onset: 1, expires: 0 }];
    const fc = ninaFeatures(items, new Map([['a', g]]), new Map([['a', ninaDetail(JSON.parse(fx('nina-detail.json')))!]]));
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toMatchObject({ level: 3, color: '#E53935', origin: 'nina', source: 'KATWARN', sender: 'Integrierte Leitstelle Emmendingen' });
  });
});

describe('spcReports', () => {
  const day = Date.parse('2026-11-01T12:00:00Z');
  it('reads the three blocks and places times in the 12-12 UTC report day', () => {
    const fc = spcReports(fx('spc-reports.csv'), { dayStart: day });
    const by = (k: string) => fc.features.filter((f) => f.properties.kind === k);
    expect(by('tornado')).toHaveLength(1);
    expect(by('wind')).toHaveLength(5);
    expect(by('hail')).toHaveLength(2);
    const torn = by('tornado')[0]!.properties;
    expect(new Date(torn.time).toISOString()).toBe('2026-11-02T04:59:00.000Z');
    expect(torn.comments).toContain('tornado carved');
    const w = by('wind')[0]!.properties;
    expect(new Date(w.time).toISOString()).toBe('2026-11-01T21:50:00.000Z');
    expect(w.value).toBe(60);
    expect(by('hail')[0]!.properties.value).toBe(100);
    expect(by('tornado')[0]!.properties.scale).toBe('');
  });
  it('report day boundaries', () => {
    expect(new Date(reportDayStart(Date.parse('2026-11-11T03:00:00Z'))).toISOString()).toBe('2026-11-10T12:00:00.000Z');
    expect(new Date(reportDayStart(Date.parse('2026-11-11T13:00:00Z'))).toISOString()).toBe('2026-11-11T12:00:00.000Z');
    expect(spcReports('', { dayStart: day }).features).toEqual([]);
  });
});
