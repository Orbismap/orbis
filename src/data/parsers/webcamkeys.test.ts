import { describe, expect, it } from 'vitest';
import { applyCamdir, camdirKey, camdirMap, directionToHeading, ibiCameras, ohgoCameras, npsCameras, qldCameras, trafikverketCameras, windyCameras } from './webcamkeys';

describe('keyed camera feeds', () => {
  it('IBI 511 portals', () => {
    const fc = ibiCameras([{ Id: 7, Roadway: 'I-15', Location: 'I-15 at 400 S', Direction: 'Northbound', Latitude: 40.76, Longitude: -111.9, Views: [{ Url: 'https://x.example/a.jpg', Status: 'Enabled' }] }, { Id: 8, Latitude: 1, Longitude: 1, Views: [{ Url: 'http://insecure/a.jpg' }] }], { id: 'ut', name: 'UDOT', source: 'Utah DOT' });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties).toMatchObject({ id: 'ut-7', dir: 0, image: 'https://x.example/a.jpg', source: 'Utah DOT' });
  });
  it('OHGO, QLD, Trafikverket, NPS, Windy', () => {
    expect(ohgoCameras({ results: [{ id: '1', latitude: 40, longitude: -82, location: 'I-71', cameraViews: [{ direction: 'SB', largeUrl: 'https://o.example/1.jpg' }] }] }).features[0]!.properties).toMatchObject({ id: 'ohgo-1', dir: 180 });
    expect(qldCameras({ features: [{ geometry: { type: 'Point', coordinates: [153, -27] }, properties: { description: 'M1', image_url: 'https://q.example/c.jpg' } }] }).features[0]!.properties.title).toBe('M1');
    expect(trafikverketCameras({ RESPONSE: { RESULT: [{ Camera: [{ Id: 'C1', Name: 'E4', Direction: 90, Geometry: { WGS84: 'POINT (18.06 59.33)' }, PhotoUrl: 'https://t.example/p.jpg' }] }] } }).features[0]!.properties).toMatchObject({ id: 'tv-C1', dir: 90 });
    expect(() => trafikverketCameras({ RESPONSE: { RESULT: [{ error: { MESSAGE: 'bad key' } }] } })).toThrow('bad key');
    expect(npsCameras({ data: [{ id: 'a', title: 'Old Faithful', latitude: '44.46', longitude: '-110.8', images: [{ url: 'https://n.example/x.jpg' }] }, { id: 'b', title: 'x', status: 'Inactive', latitude: 1, longitude: 1 }] }).features).toHaveLength(1);
    expect(windyCameras({ webcams: [{ webcamId: 1376565649, title: 'Fjord', location: { latitude: 62.17, longitude: 7.43, city: 'Molde', country: 'Norway' }, images: { current: { preview: 'https://w.example/p.jpg' } } }] }).features[0]!.properties).toMatchObject({ id: 'windy-1376565649', subtitle: 'Molde, Norway' });
  });
  it('directions and camdir corrections', () => {
    expect(directionToHeading('Eastbound')).toBe(90);
    expect(directionToHeading('North/South')).toBeUndefined();
    const dirs = camdirMap({ dirs: { 'windy-1@62.17270,7.42917': { d: 178.6 }, bad: { d: 'x' } } });
    expect(dirs).toEqual({ 'windy-1@62.17270,7.42917': 178.6 });
    expect(camdirKey('windy-1', 7.42917, 62.1727)).toBe('windy-1@62.17270,7.42917');
    const c = windyCameras({ webcams: [{ webcamId: 1, title: 't', location: { latitude: 62.1727, longitude: 7.42917 } }] });
    expect(applyCamdir(c, dirs).features[0]!.properties).toMatchObject({ dir: 178.6, dirset: true });
    expect(applyCamdir(c, undefined)).toBe(c);
  });
});
