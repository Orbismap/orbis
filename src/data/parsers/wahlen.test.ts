import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DE_DAYS, US_DAYS, areaCollection, deElections, resultsAt, usElections, winnerOf, DE_PARTIES, type DeDoc, type UsDoc } from './wahlen';

const de = JSON.parse(readFileSync('public/data/wahlen/de.json', 'utf8')) as DeDoc;
const us = JSON.parse(readFileSync('public/data/wahlen/us.json', 'utf8')) as UsDoc;

describe('wahlen data', () => {
  it('election day lists match the files', () => {
    const days = [...new Set([...de.btw.map((e) => e.d), ...de.ltw.map((e) => e.d)])].sort();
    expect(DE_DAYS).toEqual(days);
    expect(US_DAYS).toEqual(us.pres.map((e) => e.d));
  });
  it('each area shows its last election before the time', () => {
    const el = deElections(de);
    const regions = Object.keys(de.regions);
    const at2021 = resultsAt(el, Date.parse('2021-10-01'), ['btw', 'ltw'], regions);
    expect(at2021.get('DE-BY')!.election.label).toContain('Bundestagswahl 2021');
    expect(resultsAt(el, Date.parse('2022-04-01'), ['btw', 'ltw'], regions).get('DE-SL')!.election.label).toBe('Landtagswahl Saarland 2022');
    const btwOnly = resultsAt(el, Date.parse('2021-10-01'), ['btw'], regions);
    expect(btwOnly.get('DE-SL')!.election.label).toBe('Bundestagswahl 2021');
    expect(resultsAt(el, Date.parse('1980-01-01'), ['btw', 'ltw'], regions).size).toBe(0);
  });
  it('joins geometry and picks winners', () => {
    const geo = JSON.parse(readFileSync('public/data/wahlen/de-geo.json', 'utf8'));
    const r = resultsAt(deElections(de), Date.parse('2025-03-01'), ['btw'], Object.keys(de.regions));
    const fc = areaCollection(geo, r, DE_PARTIES, de.regions);
    expect(fc.features.length).toBe(16);
    expect(winnerOf([['SONST', 9], ['CDU', 3], ['SPD', 2]])![0]).toBe('CDU');
  });
  it('US presidential results', () => {
    const el = usElections(us);
    const r = resultsAt(el, Date.parse('2024-12-01'), ['pres'], Object.keys(us.regions));
    expect(winnerOf(r.get('TX')!.p)![0]).toBe('REPUBLICAN');
    expect(r.get('TX')!.cand!.R).toContain('Trump');
  });
});
