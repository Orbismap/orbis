// Significant wave height on a coarse global grid: ONE Open-Meteo Marine request (240 points, 15° spacing), refreshed hourly.
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatAge, formatDateTime, formatNumber } from '../../core/format';
import { HOUR } from '../../core/time';
import type { WaveCollection, WaveProps } from '../../data/parsers/marine';
import { WAVE_STOPS, compass, rampExpr } from '../../data/parsers/ramps';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#66BB6A';
const STEP = 15;

/** Fixed global grid; land points answer with null and are dropped by the parser. */
const grid = (() => {
  const lat: number[] = [];
  const lon: number[] = [];
  for (let la = -60; la <= 75; la += STEP) for (let lo = -180; lo < 180; lo += STEP) { lat.push(la); lon.push(lo); }
  return { lat, lon };
})();
const URL_ = `https://marine-api.open-meteo.com/v1/marine?latitude=${grid.lat.join(',')}&longitude=${grid.lon.join(',')}&current=wave_height,wave_period,wave_direction&timezone=GMT`;

export default defineLayer({
  id: 'seegang',
  category: 'meer',
  title: 'Seegang',
  summary: 'Wellenhöhe und Wellenrichtung der Weltmeere auf einem groben 15°-Raster, Modellwerte',
  icon: 'wave',
  color: COLOR,
  form: 'points',
  cadence: 'hourly',
  sources: [{ name: 'Open-Meteo Marine (MeteoFrance MFWAM, DWD EWAM)', url: 'https://open-meteo.com/en/docs/marine-weather-api', license: 'CC BY 4.0' }],
  legend: { type: 'scale', unit: 'Wellenhöhe in m (Pfeil zeigt die Laufrichtung)', stops: WAVE_STOPS, ticks: [0, 2, 4, 6, 8, 10], format: (v) => formatNumber(v, 0) },
  keywords: ['wellen', 'seegang', 'wellenhöhe', 'sturm', 'ozean', 'dünung', 'marine'],

  mount(ctx) {
    const waves = ctx.resource<WaveCollection>({ key: 'open-meteo:marine-grid-15', url: URL_, parse: 'marineWaves', refresh: HOUR, timeout: 40_000 });
    return pointLayer(ctx, {
      data: waves,
      radius: 6,
      color: rampExpr(['get', 'h'], WAVE_STOPS),
      stroke: { color: '#10202c', width: 1 },
      // arrows point where the waves travel (the API gives the direction they come from)
      symbol: {
        icon: 'arrow',
        size: ['interpolate', ['linear'], ['zoom'], 1, 0.35, 5, 0.7, 8, 1.1] as ExpressionSpecification,
        rotate: ['+', ['coalesce', ['get', 'dir'], 0], 180] as ExpressionSpecification,
      },
      describe: (f: AnyFeature) => {
        const p = f.properties as WaveProps;
        return {
          title: `Wellenhöhe ${formatNumber(p.h, 1)} m`,
          subtitle: 'Seegang, Modellwert am Rasterpunkt',
          time: p.time,
          color: COLOR,
          icon: 'wave',
          facts: [
            { label: 'Wellenhöhe', value: `${formatNumber(p.h, 1)} m`, emphasis: true },
            ...(p.t !== undefined ? [{ label: 'Wellenperiode', value: `${formatNumber(p.t, 0)} s` }] : []),
            ...(p.dir !== undefined ? [{ label: 'Wellen aus', value: `${compass(p.dir)} (${formatNumber(p.dir, 0)}°)` }] : []),
            { label: 'Modellzeit', value: `${formatDateTime(p.time)} (${formatAge(p.time)})` },
          ],
          links: [{ label: 'Open-Meteo Marine', url: 'https://open-meteo.com/en/docs/marine-weather-api' }],
        };
      },
    });
  },
});
