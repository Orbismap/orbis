import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goLive, live, pause, play, range, setTime, step, time, timeSources, playing } from './time';
import { validateSettings } from './settings';
import { HOUR } from '../core/time';

describe('time', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    goLive();
    timeSources.value = [];
  });
  afterEach(() => {
    pause();
    vi.useRealTimers();
  });
  it('is live by default and unions the ranges of the layers', () => {
    expect(live.value).toBe(true);
    const d = range.value;
    expect(d.end - d.start).toBe(96 * HOUR);
    timeSources.value = [
      { mode: 'frames', range: () => ({ start: -2 * HOUR, end: HOUR / 2, step: 5 * 60_000 }) },
      { mode: 'frames', range: () => ({ start: 0, end: 72 * HOUR, step: 3 * HOUR }) },
    ];
    const r = range.value;
    expect(r.end - r.start).toBe(74 * HOUR);
    expect(r.step).toBe(5 * 60_000);
  });
  it('steps, clamps, plays and returns to live', () => {
    timeSources.value = [{ mode: 'frames', range: () => ({ start: 0, end: 6 * HOUR, step: HOUR }) }];
    const r = range.value;
    setTime(r.start + 2 * HOUR);
    expect(live.value).toBe(false);
    step(1);
    expect(time.value).toBe(r.start + 3 * HOUR);
    setTime(r.end + 99 * HOUR);
    expect(time.value).toBe(r.end);
    play(100);
    expect(playing.value).toBe(true);
    vi.advanceTimersByTime(250);
    expect(time.value).toBeGreaterThan(r.start);
    goLive();
    expect(live.value).toBe(true);
    expect(playing.value).toBe(false);
  });
});

describe('settings', () => {
  it('validates and repairs', () => {
    const s = validateSettings({ units: { temperature: 'f', wind: 'xx' }, theme: 'dark', keys: { a: 'b', c: 1 } })!;
    expect(s.units.temperature).toBe('f');
    expect(s.units.wind).toBe('kmh');
    expect(s.theme).toBe('dark');
    expect(s.keys).toEqual({ a: 'b' });
    expect(validateSettings(5)).toBeUndefined();
  });
});
