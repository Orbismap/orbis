import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '@/core/lastKnown.test';
import type { PointSeries, WeatherSupplements } from './types';

vi.mock('./icon', () => ({ loadIconSeries: vi.fn() }));
vi.mock('./openMeteo', () => ({ loadOpenMeteoSeries: vi.fn(), loadSupplements: vi.fn() }));

import { loadIconSeries } from './icon';
import { loadOpenMeteoSeries, loadSupplements } from './openMeteo';
import { buildWeather, compass, loadWeather } from './weather';

const location = { name: 'Bad Kleinen', eyebrow: 'Mecklenburg-Vorpommern', lat: 53.75, lng: 11.47 };

/** Two days of hours, like the live sources: longer than the 24 columns the timeline shows. */
function series(label = 'ICON · R2', base = Date.now() - 30 * 60_000): PointSeries {
  const times = Array.from({ length: 48 }, (_, i) => base + i * 3_600_000);
  return {
    label, detail: 'Lauf 12 UTC', issued: Date.now(), offsetSeconds: 3600, times,
    temp: times.map(() => 4),
    dewPoint: times.map(() => 1),
    wind: times.map(() => 14),
    gust: times.map(() => 25),
    dir: times.map(() => 355),
    precip: times.map(() => 0),
    cloud: times.map(() => 20),
    pressure: times.map(() => 1012),
    humidity: times.map(() => 79),
    weatherCode: times.map(() => 0),
    isDay: times.map(() => 1),
  };
}

const supplements: WeatherSupplements = {
  daily: Array.from({ length: 10 }, (_, i) => ({
    date: Date.now() + i * 86_400_000, min: i % 2, max: 5 + i, code: 2,
  })),
  sun: Array.from({ length: 10 }, () => ({ sunrise: '07:55', sunset: '16:06', uv: 1 })),
  visibility: Array.from({ length: 24 }, () => 17),
  aqi: 20,
  warning: { badge: 'Warnstufe Gelb', headline: 'Wetterhinweis', text: 'Frost', source: 'Deutscher Wetterdienst' },
};

describe('weather view model', () => {
  it('maps a point series and supplements into the widget model', () => {
    const weather = buildWeather(series(), supplements, location);
    expect(weather.place.name).toBe('Bad Kleinen');
    expect(weather.current.temp).toBe(4);
    expect(weather.current.windSpeed).toBe(14);
    expect(weather.current.windGust).toBe(25);
    expect(weather.current.windLabel).toBe('N');
    expect(weather.current.high).toBe(5);
    expect(weather.current.low).toBe(0);
    expect(weather.current.air).toMatchObject({ value: 20, label: 'Gut' });
    expect(weather.current.warning).toEqual(supplements.warning);
    expect(weather.hourly.length).toBeGreaterThan(9);
    expect(weather.daily).toHaveLength(10);
    expect(weather.daily[0]!.label).toBe('Heute');
  });

  it('falls back to deriving days from the series when Open-Meteo is unavailable', () => {
    const weather = buildWeather(series(), {}, location);
    expect(weather.daily.length).toBeGreaterThan(0);
    expect(weather.current.sunrise).toBeTruthy();
  });

  it('maps compass directions', () => {
    expect(compass(0)).toBe('N');
    expect(compass(270)).toBe('W');
    expect(compass(90)).toBe('O');
    expect(compass(180)).toBe('S');
  });
});

describe('sunrise and sunset in the timeline', () => {
  // 27 November, UTC+1 like `series()`: local midnight and local noon as UTC ms
  const midnight = Date.UTC(2026, 10, 26, 23);
  const noon = midnight + 12 * 3_600_000;
  const withSun: WeatherSupplements = {
    daily: Array.from({ length: 2 }, (_, i) => ({ date: noon + i * 86_400_000, min: 0, max: 5 })),
    sun: [
      { sunrise: '07:55', sunset: '16:06', uv: 1 },
      { sunrise: '07:56', sunset: '16:05', uv: 1 },
    ],
  };
  const events = (data: PointSeries) => buildWeather(data, withSun, location).hourly.filter((hour) => hour.event);

  afterEach(() => vi.useRealTimers());

  it.each(Array.from({ length: 24 }, (_, hour) => hour))('adds both as extra entries with minutes at %i:00', (hour) => {
    vi.useFakeTimers({ now: midnight + hour * 3_600_000 });
    const found = events(series());
    expect(found.every((entry) => /^\d{2}:\d{2}$/.test(entry.time))).toBe(true);
    expect(new Set(found.map((entry) => entry.event))).toEqual(new Set(['sunrise', 'sunset']));
  });

  it('keeps a sunset that is minutes away when the first column is already the next hour', () => {
    vi.useFakeTimers({ now: midnight + 16 * 3_600_000 });
    // hours on the full hour: at 16:00 the strip starts with 17:00
    expect(events(series('Open-Meteo', midnight)).map((entry) => entry.time)).toContain('16:06');
  });
});

describe('source chain', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses Open-Meteo by default', async () => {
    vi.mocked(loadOpenMeteoSeries).mockResolvedValue(series('Open-Meteo'));
    vi.mocked(loadSupplements).mockResolvedValue(supplements);
    const result = await loadWeather(location);
    expect(result.source.label).toBe('Open-Meteo');
    expect(vi.mocked(loadIconSeries)).not.toHaveBeenCalled();
    expect(result.weather.current.temp).toBe(4);
  });

  it('falls back to R2 when Open-Meteo fails', async () => {
    vi.mocked(loadOpenMeteoSeries).mockRejectedValue(new Error('API down'));
    vi.mocked(loadIconSeries).mockResolvedValue(series('ICON · R2 (Fallback)'));
    vi.mocked(loadSupplements).mockResolvedValue(supplements);
    const result = await loadWeather(location);
    expect(result.source.label).toBe('ICON · R2 (Fallback)');
  });

  it('does not use an outdated ICON run as fallback', async () => {
    vi.mocked(loadOpenMeteoSeries).mockRejectedValue(new Error('API down'));
    vi.mocked(loadIconSeries).mockResolvedValue({ ...series('ICON · R2 (Fallback)'), issued: Date.now() - 24 * 3_600_000 });
    const result = await loadWeather(location);
    expect(result.source.label).toBe('Beispieldaten');
  });

  it('falls back to sample data when every live source fails', async () => {
    vi.mocked(loadOpenMeteoSeries).mockRejectedValue(new Error('API down'));
    vi.mocked(loadIconSeries).mockRejectedValue(new Error('R2 down'));
    const result = await loadWeather(location);
    expect(result.source.label).toBe('Beispieldaten');
    expect(result.weather.place.name).toBe('Bad Kleinen');
    expect(result.weather.current.temp).toBe(4);
  });
});

describe('offline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', fakeStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  const loadOnce = async () => {
    vi.mocked(loadOpenMeteoSeries).mockResolvedValue(series('Open-Meteo'));
    vi.mocked(loadSupplements).mockResolvedValue(supplements);
    await loadWeather(location);
  };

  it('uses the saved forecast when no source answers, and says so', async () => {
    await loadOnce();
    vi.mocked(loadOpenMeteoSeries).mockRejectedValue(new Error('offline'));
    vi.mocked(loadIconSeries).mockRejectedValue(new Error('offline'));
    const result = await loadWeather(location);
    expect(result.source).toEqual({ label: 'Gespeichert', detail: 'gerade eben · Open-Meteo' });
    expect(result.weather.current.temp).toBe(4);
    expect(result.weather.current.air.value).toBe(20);
  });

  it('prefers the saved forecast over an older mirror run', async () => {
    await loadOnce();
    vi.mocked(loadOpenMeteoSeries).mockRejectedValue(new Error('offline'));
    vi.mocked(loadIconSeries).mockResolvedValue({ ...series('ICON · R2 (Fallback)'), issued: Date.now() - 6 * 3_600_000 });
    expect((await loadWeather(location)).source.label).toBe('Gespeichert');
  });

  it('keeps the last known extras when only they fail', async () => {
    await loadOnce();
    vi.mocked(loadSupplements).mockRejectedValue(new Error('offline'));
    const result = await loadWeather(location);
    expect(result.weather.current.air.value).toBe(20);
    expect(result.weather.daily).toHaveLength(10);
  });
});
