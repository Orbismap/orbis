import { describe, expect, it } from 'vitest';
import { incidentTrack, indexAt, localizeUnits, sampleAt, type TrackPoint } from './incidents';

const pts: TrackPoint[] = [
  [100, 26.0, -80.0, 30000, 400, 90],
  [110, 26.0, -79.9, 29000, 410, 100],
  [120, 26.1, -79.9, null, 420, 110],
  [130, 26.1, -79.8, 20000, 430, 120],
  [140, 26.2, -79.8, 10000, 430, 130, 1],
];

describe('incident track', () => {
  it('parses and sorts', () => {
    expect(incidentTrack({ pts: [[5, 1, 1, 0, 0, 0], [1, 1, 1, 0, 0, 0], 'x'] }).map((p) => p[0])).toEqual([1, 5]);
    expect(incidentTrack(null)).toEqual([]);
  });
  it('finds the index', () => {
    expect(indexAt(pts, 99)).toBe(-1);
    expect(indexAt(pts, 115)).toBe(1);
    expect(indexAt(pts, 500)).toBe(4);
  });
  it('interpolates position and altitude', () => {
    const s = sampleAt(pts, 105);
    expect(s.lon).toBeCloseTo(-79.95);
    expect(s.alt).toBeCloseTo(29500);
    expect(s.vs).toBeCloseTo(-6000);
  });
  it('fills a gap in altitude linearly and marks it estimated', () => {
    const s = sampleAt(pts, 120);
    expect(s.alt).toBeCloseTo(24500, -2);
    expect(s.estimated).toBe(true);
  });
  it('clamps before and after the track', () => {
    expect(sampleAt(pts, 0).t).toBe(100);
    expect(sampleAt(pts, 999).lat).toBeCloseTo(26.2);
  });
  it('localizes unit placeholders', () => {
    expect(localizeUnits('{{ft:35000}} und {{kn:437}}')).toContain('10.668 m (35.000 ft)');
  });
});
