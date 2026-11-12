import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arcLine, congressPoints, flowLines, type FlowData } from './money';

describe('money', () => {
  it('real flow file turns into lines and country points', () => {
    const d = JSON.parse(readFileSync('public/data/geldfluesse.json', 'utf8')) as FlowData;
    const r = flowLines(d);
    expect(r.arcs.features.length).toBe(d.arcs.length);
    expect(r.countries.features.length).toBe(d.countries.length);
    expect(r.arcs.features[0]!.geometry.coordinates).toHaveLength(49);
  });
  it('arc keeps its end points and takes the short way over the date line', () => {
    const l = arcLine([170, 0], [-170, 0], 0, 4);
    expect(l[0]).toEqual([170, 0]);
    expect(l[4]![0]).toBeCloseTo(190, 1);
  });
  it('congress points drop districts without money', () => {
    const fc = congressPoints({ members: [{ n: 'A', p: 'GOP', d: 'AL-01', lon: -87, lat: 31, don: 100, ie: 5, aipac: 50, backers: ['AIPAC'] }, { n: 'B', p: 'DEM', d: 'X', lon: 1, lat: 1, don: 0, ie: 0, aipac: 0, backers: [] }] });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toMatchObject({ sum: 105, backers: 'AIPAC' });
    const real = JSON.parse(readFileSync('public/data/moneyflow.json', 'utf8'));
    expect(congressPoints(real).features.length).toBeGreaterThan(300);
  });
});
