import { describe, expect, it } from 'vitest';
import { greatCircle, parseAircraftRecord, parsePhoto, parseRoute, routeFeatures } from './flightinfo';

const route = { response: { flightroute: { callsign: 'DLH400', airline: { name: 'Lufthansa' },
  origin: { icao_code: 'EDDF', iata_code: 'FRA', name: 'Frankfurt am Main Airport', municipality: 'Frankfurt am Main', country_name: 'Germany', latitude: 50.03333, longitude: 8.57056 },
  destination: { icao_code: 'KJFK', iata_code: 'JFK', name: 'John F Kennedy International Airport', municipality: 'New York', country_name: 'United States', latitude: 40.6398, longitude: -73.7789 } } } };

describe('flightinfo', () => {
  it('parses the route and rejects unknown callsigns', () => {
    const r = parseRoute(route)!;
    expect(r.origin.iata).toBe('FRA');
    expect(r.destination.lat).toBeCloseTo(40.6398);
    expect(parseRoute({ response: 'unknown callsign' })).toBeNull();
    expect(parseRoute(null)).toBeNull();
  });
  it('parses the aircraft record', () => {
    const a = parseAircraftRecord({ response: { aircraft: { type: 'A319 112', icao_type: 'A319', manufacturer: 'Airbus', registration: 'D-AIBD', registered_owner: 'Lufthansa', registered_owner_country_name: 'Germany' } } })!;
    expect(a.icaoType).toBe('A319');
    expect(a.owner).toBe('Lufthansa');
  });
  it('parses the photo with photographer and link', () => {
    const p = parsePhoto({ photos: [{ thumbnail: { src: 'https://t.plnspttrs.net/a_t.jpg' }, thumbnail_large: { src: 'https://t.plnspttrs.net/a_280.jpg' }, link: 'https://www.planespotters.net/photo/1', photographer: 'Steffen Müller' }] })!;
    expect(p.src).toContain('_280');
    expect(p.photographer).toBe('Steffen Müller');
    expect(parsePhoto({ photos: [] })).toBeNull();
  });
  it('great circle goes through the end points and bends north', () => {
    const pts = greatCircle([8.57, 50.03], [-73.78, 40.64], 20);
    expect(pts[0]![0]).toBeCloseTo(8.57, 6);
    expect(pts[0]![1]).toBeCloseTo(50.03, 6);
    expect(pts[20]![0]).toBeCloseTo(-73.78, 1);
    expect(Math.max(...pts.map((p) => p[1]))).toBeGreaterThan(52);
  });
  it('unwraps across the antimeridian', () => {
    const pts = greatCircle([170, 10], [-170, 20], 10);
    for (let i = 1; i < pts.length; i++) expect(Math.abs(pts[i]![0] - pts[i - 1]![0])).toBeLessThan(5);
  });
  it('route features hold a flown and an ahead leg', () => {
    const f = routeFeatures(parseRoute(route)!, [-30, 55]);
    expect(f.features.map((x) => x.properties!.part)).toEqual(['flown', 'ahead']);
    const end = f.features[0]!.geometry.coordinates.at(-1)!;
    expect(end[0]).toBeCloseTo(-30, 6);
    expect(end[1]).toBeCloseTo(55, 6);
  });
});
