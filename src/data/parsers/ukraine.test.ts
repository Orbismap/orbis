import { describe, expect, it } from 'vitest';
import { oblastCollection, oblastKey, ukraineHarmPoints, type UkOblast } from './ukraine';

describe('ukraine', () => {
  it('parses Bellingcat events', () => {
    const fc = ukraineHarmPoints({ built: 'b', events: [
      { id: 'BLK5D6', d: '2025-04-16', l: 'Pokrovsk', lat: 48.25663, lon: 37.17889, t: 'Heavily damaged building.', i: ['Residential', 'Religious'], s: ['https://a.example/1', 'https://b.example/2'] },
      { id: 'x', d: '2025-04-16', lat: null, lon: 1 },
    ] });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toMatchObject({ place: 'Pokrovsk', impact: 'Residential, Religious', graphic: 0, src: 'https://a.example/1\nhttps://b.example/2' });
  });
  it('keys regions and joins the table', () => {
    expect(oblastKey('Ivano-Frankivsk', 'Region')).toBe('ivanofrankivsk');
    expect(oblastKey('Kyiv', 'Municipality')).toBe('kyivcity');
    const data = { built: '', source: '', unresolved: 0, who: {}, regions: { lviv: { ew: 29, year: {}, sector: {}, weapon: {}, killed: {}, last: '2026-10-20', air: { '2022-03': 66.8, '2022-04': 84.2 } } } } as UkOblast;
    const geo = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { en: 'Lviv', type: 'Region' }, geometry: { type: 'Point', coordinates: [0, 0] } }] } as never;
    expect(oblastCollection(geo, data, 'incidents').features[0]!.properties).toMatchObject({ value: 29, airHours: 151, name: 'Lviv' });
    expect(oblastCollection(geo, data, 'air').features[0]!.properties.value).toBe(151);
  });
});
