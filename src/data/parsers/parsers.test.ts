import { describe, expect, it } from 'vitest';
import { usgsQuakes } from './usgs';
import { emscQuakes, titleCaseRegion } from './emsc';
import { mergeQuakes } from './quakes';
import { cableLines } from './cables';
import { runParser } from '../worker/pool';

const usgs = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: 'us1', properties: { mag: 5.2, place: '21 km WNW of Popondetta, Papua New Guinea', time: 1794332209391, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us1', tsunami: 1, type: 'earthquake' }, geometry: { type: 'Point', coordinates: [148.1, -8.6, 35.2] } },
    { type: 'Feature', id: 'ak1', properties: { mag: 2.9, place: '74 km WNW of Petersville, Alaska', time: 1794332547915, type: 'earthquake', tsunami: 0 }, geometry: { type: 'Point', coordinates: [-152.155, 62.678, 0.2] } },
    { type: 'Feature', id: 'q', properties: { mag: null, time: 1, type: 'earthquake' }, geometry: { type: 'Point', coordinates: [0, 0, 0] } },
    { type: 'Feature', id: 'blast', properties: { mag: 2.7, time: 5, type: 'quarry blast' }, geometry: { type: 'Point', coordinates: [0, 0, 0] } },
  ],
};

const emsc = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: '20261110_0000283', geometry: { type: 'Point', coordinates: [27.7967, 36.9425, -5.7] }, properties: { unid: '20261110_0000283', time: '2026-11-10T19:25:29.43Z', flynn_region: 'DODECANESE IS.-TURKEY BORDER REG', depth: 5.7, mag: 2.1, lat: 36.9425, lon: 27.7967 } },
    // duplicate of us1: same time (+30 s), 10 km away, mag +0.2
    { type: 'Feature', id: 'dup', geometry: { type: 'Point', coordinates: [148.15, -8.55, -35] }, properties: { unid: 'dup', time: new Date(1794332209391 + 30_000).toISOString(), flynn_region: 'NEW GUINEA, PAPUA NEW GUINEA', depth: 35, mag: 5.4 } },
    { type: 'Feature', id: 'bad', geometry: { type: 'Point', coordinates: [1, 1, 0] }, properties: { unid: 'bad', time: 'nonsense', mag: 3 } },
  ],
};

describe('quake parsers', () => {
  it('slims USGS', () => {
    const fc = usgsQuakes(usgs);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toEqual({ id: 'us1', mag: 5.2, depth: 35.2, place: '21 km WNW of Popondetta, Papua New Guinea', time: 1794332209391, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us1', tsunami: true, src: 'usgs' });
    expect(fc.features[1]!.properties.tsunami).toBe(false);
    expect(fc.features[1]!.properties.url).toContain('ak1');
  });
  it('slims EMSC', () => {
    const fc = emscQuakes(emsc);
    expect(fc.features).toHaveLength(2);
    const f = fc.features[0]!;
    expect(f.properties.place).toBe('Dodecanese Is.-Turkey Border Reg');
    expect(f.properties.time).toBe(Date.parse('2026-11-10T19:25:29.43Z'));
    expect(f.properties.depth).toBe(5.7);
    expect(f.properties.src).toBe('emsc');
    expect(emscQuakes(null).features).toEqual([]);
    expect(titleCaseRegion('CENTRAL TURKEY')).toBe('Central Turkey');
  });
  it('merges, dedupes (USGS wins) and sorts newest first', () => {
    const m = mergeQuakes([usgsQuakes(usgs), emscQuakes(emsc)]);
    expect(m.features).toHaveLength(3); // dup dropped
    expect(m.features.some((f) => f.properties.id === 'emsc:dup')).toBe(false);
    const times = m.features.map((f) => f.properties.time);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(mergeQuakes([undefined, undefined]).features).toEqual([]);
  });
  it('runs through the pool fallback (no Worker in node)', async () => {
    const buf = new TextEncoder().encode(JSON.stringify(usgs)).buffer as ArrayBuffer;
    const fc = await runParser('usgsQuakes', buf, { format: 'json' });
    expect(fc.features).toHaveLength(2);
  });
});

describe('cableLines', () => {
  it('keeps lines, fills defaults', () => {
    const fc = cableLines({
      features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { id: 5, name: 'CANTAT 3', operator: 'BT', since: '', color: '#4fc3f7' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [2, 2]] }, properties: {} },
      ],
    });
    expect(fc.features).toHaveLength(2);
    expect(fc.features[1]!.properties.name).toBe('Unbenanntes Kabel');
  });
});
