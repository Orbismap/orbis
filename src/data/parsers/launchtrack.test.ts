import { describe, expect, it } from 'vitest';
import { azimuthOf, flightEndSec, groundTrack, launchTracker, phaseAt, tLabel, trackAt } from './launchtrack';

const raw = { results: [{
  id: 'abc', name: 'Falcon 9 Block 5 | USSF-627', net: '2026-11-12T02:35:00Z', window_start: '2026-11-12T02:35:00Z', window_end: '2026-11-12T06:35:00Z',
  status: { abbrev: 'Go', name: 'Go for Launch', description: 'T-0 confirmed' }, probability: null, webcast_live: false,
  launch_service_provider: { name: 'SpaceX' }, rocket: { configuration: { full_name: 'Falcon 9 Block 5' } },
  mission: { name: 'USSF-627', type: 'Government', description: 'x', orbit: { abbrev: 'LEO', name: 'Low Earth Orbit' } },
  pad: { name: 'Space Launch Complex 4E', latitude: '34.632', longitude: '-120.611', location: { name: 'Vandenberg SFB, CA, USA' } },
  vid_urls: [{ priority: 8, source: 'youtube.com', publisher: 'SPACE AFFAIRS', title: 'GO!', url: 'https://www.youtube.com/watch?v=1jhH0mR5ICA' }, { url: 'http://insecure.example/x' }],
}, { id: 'bad', net: 'x' }] };

describe('launchtrack', () => {
  it('parses detailed launches, keeps https videos only', () => {
    const l = launchTracker(raw);
    expect(l).toHaveLength(1);
    expect(l[0]!.lat).toBeCloseTo(34.632);
    expect(l[0]!.videos).toHaveLength(1);
    expect(l[0]!.altKm).toBe(450);
  });
  it('derives the azimuth: eastbound from Florida, southbound polar from Vandenberg', () => {
    expect(azimuthOf({ incDeg: 51.6, lat: 28.5, place: 'Cape Canaveral', pad: 'SLC-40' })).toBeGreaterThan(90);
    expect(azimuthOf({ incDeg: 97, lat: 34.6, place: 'Vandenberg SFB', pad: 'SLC-4E' })).toBe(190);
  });
  it('simulates the ascent monotonically', () => {
    const d = launchTracker(raw)[0]!;
    expect(trackAt(d, -5)).toBeNull();
    const a = trackAt(d, 120)!, b = trackAt(d, 300)!;
    expect(b.downrangeKm).toBeGreaterThan(a.downrangeKm);
    expect(b.altKm).toBeGreaterThan(a.altKm);
    expect(groundTrack(d, 600).length).toBeGreaterThan(20);
    expect(flightEndSec(d)).toBe(680);
  });
  it('names the phase and formats T', () => {
    const d = launchTracker(raw)[0]!;
    expect(phaseAt(d, d.net - 3_000_000).phase).toBe('pre');
    expect(phaseAt(d, d.net + 100_000).phase).toBe('active');
    expect(phaseAt(d, d.net + 5_000_000).phase).toBe('orbit');
    expect(tLabel(-750)).toBe('T−12:30');
    expect(tLabel(125)).toBe('T+02:05');
  });
});
