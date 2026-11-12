import { describe, expect, it } from 'vitest';
import { airportIndex, airportsInView, overpassQuery, planFromOverpass, planFromStatic, pxPerMetre, runwayEnds } from './airportplan';

const static_ = {
  icao: 'EDDF', v: 2,
  polygons: [{ type: 'Feature', id: 'w1', geometry: { type: 'Polygon', coordinates: [[[8.5, 50], [8.6, 50], [8.6, 50.1], [8.5, 50]]] }, properties: { kind: 'apron', h: 9 } }],
  lines: [
    { type: 'Feature', id: 'w2', geometry: { type: 'LineString', coordinates: [[8.5, 50.0], [8.6, 50.0]] }, properties: { kind: 'runway', ref: '07L/25R', w: 60 } },
    { type: 'Feature', id: 'w3', geometry: { type: 'LineString', coordinates: [[8.5, 50.0], [8.6, 50.0]] }, properties: { kind: 'taxiway' } },
  ],
  points: [{ type: 'Feature', id: 'n1', geometry: { type: 'Point', coordinates: [8.57, 50.03] }, properties: { kind: 'gate', ref: 'J12' } }],
};

describe('airportplan', () => {
  it('fills defaults of prebuilt files', () => {
    const p = planFromStatic(static_);
    expect(p.lines[0]!.properties.w).toBe(60);
    expect(p.lines[1]!.properties.w).toBe(23);
    expect(p.lines[1]!.properties.ref).toBe('');
    expect(p.points[0]!.properties.ref).toBe('J12');
    expect(p.polygons[0]!.properties.h).toBe(9);
  });
  it('parses Overpass ways and nodes', () => {
    const p = planFromOverpass({ elements: [
      { type: 'way', id: 5, tags: { aeroway: 'runway', ref: '09/27', width: '45' }, geometry: [{ lat: 1, lon: 1 }, { lat: 1, lon: 2 }] },
      { type: 'way', id: 6, tags: { aeroway: 'terminal', 'building:levels': '3' }, geometry: [{ lat: 1, lon: 1 }, { lat: 1, lon: 2 }, { lat: 2, lon: 2 }, { lat: 1, lon: 1 }] },
      { type: 'node', id: 7, lat: 1.5, lon: 1.5, tags: { aeroway: 'parking_position', ref: 'A1' } },
      { type: 'way', id: 8, tags: { highway: 'service' }, geometry: [] },
    ] }, 'XXXX');
    expect(p.lines).toHaveLength(1);
    expect(p.polygons[0]!.properties.h).toBeCloseTo(10.5);
    expect(p.points[0]!.properties.kind).toBe('parking');
    expect(overpassQuery({ west: 1, south: 2, east: 3, north: 4 })).toContain('(2,1,4,3)');
  });
  it('places runway numbers at both ends', () => {
    const e = runwayEnds(planFromStatic(static_).lines);
    expect(e.map((f) => f.properties.text)).toEqual(['07L', '25R']);
    expect(e[0]!.properties.rot).toBeCloseTo(90);
    expect(e[1]!.properties.rot).toBeCloseTo(270);
  });
  it('finds the airports in view and scales widths', () => {
    const idx = airportIndex({ airports: [{ icao: 'A', name: 'a', bbox: [8, 50, 9, 51] }, { icao: 'B', name: 'b', bbox: [20, 50, 21, 51] }] });
    expect(airportsInView(idx, [8.5, 50.5, 8.6, 50.6]).map((a) => a.icao)).toEqual(['A']);
    expect(pxPerMetre(17, 0)).toBeCloseTo(131072 / 78271.517, 4);
  });
});
