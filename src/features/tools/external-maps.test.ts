import { describe, expect, it } from 'vitest';
import { appleMapsUrl, googleMapsUrl, googleMaps3dUrl } from './external-maps';

const cam = { lng: 10, lat: 20, zoom: 8, bearing: 30, pitch: 40 };

describe('external maps urls', () => {
  it('apple carries camera', () => {
    const u = appleMapsUrl(cam);
    expect(u).toContain('maps.apple.com/frame');
    expect(u).toContain('center=20%2C10');
    expect(u).toContain('heading=30');
    expect(u).toContain('pitch=40');
  });
  it('google standard', () => {
    const u = googleMapsUrl(cam);
    expect(u).toContain('map_action=map');
    expect(u).toContain('center=20%2C10');
  });
  it('google 3d carries rotation and tilt', () => {
    const u = googleMaps3dUrl(cam);
    expect(u).toContain('20,10');
    expect(u).toContain('30h');
    expect(u).toContain('40.0t');
  });
});