import { describe, expect, it, beforeEach } from 'vitest';
import { bearing, destination, haversine, lngLatToMercator, mercatorToLngLat, subsolarPoint, sunAltitude, terminatorPolygon, wrapLng, bboxOf, bboxContains } from './geo';
import { buildLut, parseColor, sampleScale, TEMPERATURE, PRECIP } from './color';
import { formatAge, formatCoord, formatCompact, formatNumber, NNBSP } from './format';
import { convert, formatQuantity, setUnitPrefs, DEFAULT_UNITS, unitLabel, convertBack } from './units';
import { parseHash, serializeHash } from './url';
import { getJSON, setJSON } from './storage';
import { throttle, debounce } from './scheduler';
import { dayBoundaries, roundTo, startOfDay, HOUR } from './time';

describe('geo', () => {
  it('wraps longitudes', () => {
    expect(wrapLng(190)).toBe(-170);
    expect(wrapLng(-181)).toBe(179);
    expect(wrapLng(180)).toBe(-180);
  });
  it('haversine Berlin-Paris', () => {
    expect(haversine([13.405, 52.52], [2.3522, 48.8566])).toBeGreaterThan(870);
    expect(haversine([13.405, 52.52], [2.3522, 48.8566])).toBeLessThan(885);
  });
  it('bearing and destination are consistent', () => {
    const a: [number, number] = [10, 50];
    const b = destination(a, 90, 100);
    expect(bearing(a, b)).toBeCloseTo(90, 0);
    expect(haversine(a, b)).toBeCloseTo(100, 3);
  });
  it('mercator round trip', () => {
    const [x, y] = lngLatToMercator(13.4, 52.5);
    const [lng, lat] = mercatorToLngLat(x, y);
    expect(lng).toBeCloseTo(13.4, 6);
    expect(lat).toBeCloseTo(52.5, 6);
    expect(lngLatToMercator(0, 0)).toEqual([0.5, 0.5]);
  });
  it('bbox helpers', () => {
    const b = bboxOf([[1, 2], [3, 4], [-1, 0]])!;
    expect(b).toEqual([-1, 0, 3, 4]);
    expect(bboxContains(b, [0, 1])).toBe(true);
  });
  it('sun: equinox noon at Greenwich, solstice declination', () => {
    const eq = Date.UTC(2026, 2, 20, 12, 0); // near March equinox
    expect(sunAltitude(0, 0, eq)).toBeGreaterThan(80);
    const sol = subsolarPoint(Date.UTC(2026, 5, 21, 12, 0));
    expect(sol.lat).toBeGreaterThan(23);
    expect(sol.lat).toBeLessThan(23.6);
    expect(Math.abs(sol.lng)).toBeLessThan(5);
  });
  it('terminator polygon matches sun altitude', () => {
    const t = Date.UTC(2026, 10, 10, 18, 0);
    const poly = terminatorPolygon(t);
    const ring = poly.geometry.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lng, lat] of ring.slice(0, 180)) {
      if (Math.abs(lat!) < 89) expect(Math.abs(sunAltitude(lng!, lat!, t))).toBeLessThan(0.5);
    }
    // November: northern hemisphere tilted away, so the north pole is dark and the south pole is part of day
    const dark = terminatorPolygon(t, 0).geometry.coordinates[0]!;
    expect(dark.some((p) => p[1] === 90)).toBe(true);
    const twilight = terminatorPolygon(t, -12);
    expect(twilight.properties.altitude).toBe(-12);
  });
});

describe('color', () => {
  it('parses colours', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255, 255]);
    expect(parseColor('#11223344')).toEqual([17, 34, 51, 68]);
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30, 128]);
    expect(parseColor('transparent')[3]).toBe(0);
  });
  it('samples scale endpoints and clamps', () => {
    expect(sampleScale(TEMPERATURE, -100)).toEqual(parseColor('#3a1c71'));
    expect(sampleScale(TEMPERATURE, 100)).toEqual(parseColor('#6e1236'));
    const mid = sampleScale(TEMPERATURE, 5);
    expect(mid[3]).toBe(255);
  });
  it('precip is transparent below 0.1', () => {
    expect(sampleScale(PRECIP, 0)[3]).toBe(0);
    expect(sampleScale(PRECIP, 5)[3]).toBe(255);
  });
  it('builds a LUT', () => {
    const lut = buildLut(TEMPERATURE, -40, 45);
    expect(lut.length).toBe(256 * 4);
    expect(lut[3]).toBe(255);
  });
});

describe('format + units', () => {
  beforeEach(() => setUnitPrefs({ ...DEFAULT_UNITS }));
  it('formats numbers de-DE', () => {
    expect(formatNumber(1234.5, 1)).toBe('1.234,5');
    expect(formatCompact(3400000)).toMatch(/3,4/);
    expect(formatCoord(52.52, 13.405)).toBe(`52,52°${NNBSP}N, 13,41°${NNBSP}O`);
  });
  it('formats ages', () => {
    const now = new Date(2026, 10, 10, 15, 0).getTime();
    expect(formatAge(now - 30_000, now)).toBe('gerade eben');
    expect(formatAge(now - 3 * 60_000, now)).toBe(`vor 3${NNBSP}min`);
    expect(formatAge(new Date(2026, 10, 10, 9, 5).getTime(), now)).toBe('heute 09:05');
    expect(formatAge(new Date(2026, 10, 9, 9, 5).getTime(), now)).toMatch(/^Stand 9\. Nov/);
  });
  it('converts units', () => {
    expect(convert('temperature', 100)).toBe(100);
    setUnitPrefs({ temperature: 'f', wind: 'bft', pressure: 'inhg', distance: 'mi' });
    expect(convert('temperature', 100)).toBe(212);
    expect(convertBack('temperature', 212)).toBeCloseTo(100);
    expect(convert('wind', 40)).toBe(6);
    expect(unitLabel('distance')).toBe('mi');
    expect(formatQuantity('temperature', 0)).toBe(`32${NNBSP}°F`);
    setUnitPrefs({ wind: 'ms' });
    expect(convert('wind', 36)).toBeCloseTo(10);
  });
});

describe('url', () => {
  it('round-trips', () => {
    const s = { view: { lat: 52.52, lng: 13.405, zoom: 5.25, bearing: 30, pitch: 45 }, karte: 'wetter', layers: ['erdbeben', 'seekabel'], time: Date.UTC(2026, 10, 10, 12, 0), globe: true };
    const h = serializeHash(s);
    expect(h).toBe('#/@52.52,13.405,5.25z,30b,45p?k=wetter&l=erdbeben,seekabel&t=2026-11-10T12:00Z&g=1');
    expect(parseHash(h)).toEqual(s);
  });
  it('round-trips a searched place, commas in names included', () => {
    const s = { karte: 'wetter', place: { lat: 52.51874, lng: 13.40802, title: 'Berlin, Mitte', subtitle: 'Berlin, Deutschland', kind: 'city' } };
    const h = serializeHash(s);
    expect(h).toBe('#/?k=wetter&p=52.51874,13.40802,Berlin%2C%20Mitte,Berlin%2C%20Deutschland,city');
    expect(parseHash(h)).toEqual(s);
    expect(parseHash('#/?p=1,2,%E0%A4%A').place).toBeUndefined();
  });
  it('handles empty and broken hashes', () => {
    expect(parseHash('')).toEqual({});
    expect(parseHash('#/@abc')).toEqual({});
    expect(parseHash('#/?l=').layers).toEqual([]);
    expect(serializeHash({})).toBe('#/');
  });
});

describe('storage', () => {
  it('works without localStorage and with it', () => {
    expect(getJSON('x', 1, (r) => r as number, 5)).toBe(5);
    const mem = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    expect(setJSON('x', 1, 7)).toBe(true);
    expect(getJSON('x', 1, (r) => (typeof r === 'number' ? r : undefined), 0)).toBe(7);
    expect(getJSON('x', 2, (r) => r as number, 0)).toBe(0);
    expect(getJSON('x', 1, () => undefined, 9)).toBe(9);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});

describe('scheduler + time', () => {
  it('throttles and debounces', async () => {
    const calls: number[] = [];
    const th = throttle((n: number) => calls.push(n), 20);
    th(1); th(2); th(3);
    expect(calls).toEqual([1]);
    await new Promise((r) => setTimeout(r, 40));
    expect(calls).toEqual([1, 3]);
    const out: number[] = [];
    const d = debounce((n: number) => out.push(n), 10);
    d(1); d(2);
    await new Promise((r) => setTimeout(r, 30));
    expect(out).toEqual([2]);
  });
  it('rounds and finds day boundaries', () => {
    expect(roundTo(95, 60, 'floor')).toBe(60);
    const s = Date.UTC(2026, 0, 1, 12);
    expect(dayBoundaries(s, s + 50 * HOUR, true)).toEqual([Date.UTC(2026, 0, 2), Date.UTC(2026, 0, 3)]);
    expect(startOfDay(s, true)).toBe(Date.UTC(2026, 0, 1));
  });
});
