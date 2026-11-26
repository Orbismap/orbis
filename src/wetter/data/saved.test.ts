import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '@/core/lastKnown.test';
import { readSnapshot, saveSnapshot, saveWarning } from './saved';
import type { PointSeries } from './types';

const DAY = 86_400_000;
const NOON = Date.UTC(2026, 10, 24, 12);

const series: PointSeries = {
  label: 'Open-Meteo', detail: 'ICON · Live', issued: NOON, offsetSeconds: 3600, times: [NOON],
  temp: [undefined], dewPoint: [], wind: [10], gust: [], dir: [], precip: [], cloud: [], pressure: [],
};
const daily = [0, 1, 2].map((i) => ({ date: NOON + i * DAY, min: i, max: i + 5 }));
const sun = [0, 1, 2].map((i) => ({ sunrise: `07:0${i}`, sunset: '16:00', uv: 1 }));
const warning = { badge: 'Warnstufe Gelb', headline: 'Frost', text: '', source: 'DWD', expires: NOON + 3_600_000 };

describe('saved forecast', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the gaps of the series as gaps', () => {
    saveSnapshot(53.75, 11.47, { series, supplements: {} }, NOON);
    const kept = readSnapshot(53.75, 11.47, NOON)!;
    expect(kept.at).toBe(NOON);
    expect(kept.data.series.temp[0]).toBeUndefined();
    expect(readSnapshot(52.52, 13.41)).toBeUndefined();
  });

  it('drops days that are over and warnings that ran out', () => {
    saveSnapshot(53.75, 11.47, { series, supplements: { daily, sun } }, NOON);
    saveWarning(53.75, 11.47, warning);
    expect(readSnapshot(53.75, 11.47, NOON)?.data.supplements.warning?.headline).toBe('Frost');
    const later = readSnapshot(53.75, 11.47, NOON + DAY)!;
    expect(later.at).toBe(NOON);
    expect(later.data.supplements.daily?.[0]?.min).toBe(1);
    expect(later.data.supplements.sun?.[0]?.sunrise).toBe('07:01');
    expect(later.data.supplements.warning).toBeUndefined();
  });
});
