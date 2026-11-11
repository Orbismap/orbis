// NDBC buoys: latest observation of every station from the live bucket (fixed-width text, parsed in the worker).
import { computed } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { TEMPERATURE, WIND } from '../../core/color';
import { formatAge, formatDateTime, formatNumber } from '../../core/format';
import { MINUTE } from '../../core/time';
import { convert, formatQuantity, unitLabel } from '../../core/units';
import { bucketUrl } from '../../data/endpoints';
import type { BuoyCollection, BuoyProps } from '../../data/parsers/ndbc';
import { WAVE_STOPS, compass, rampExpr, type Stops } from '../../data/parsers/ramps';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

type ColorBy = 'wave' | 'water' | 'wind';
const COLOR = '#4FC3F7';
const KMH = 3.6; // NDBC reports m/s, the app's base unit for wind is km/h

const KEY: Record<ColorBy, keyof BuoyProps> = { wave: 'wvht', water: 'wtmp', wind: 'wspd' };
const waterStops = TEMPERATURE.stops.filter(([v]) => v >= -2 && v <= 34) as Stops;
const windStops = WIND.stops as Stops;

const colorExpr = (by: ColorBy): ExpressionSpecification => {
  switch (by) {
    case 'wave': return rampExpr(['get', 'wvht'], WAVE_STOPS);
    case 'water': return rampExpr(['get', 'wtmp'], waterStops);
    case 'wind': return rampExpr(['*', ['get', 'wspd'], KMH], windStops);
  }
};

export default defineLayer({
  id: 'bojen',
  category: 'meer',
  title: 'Messbojen',
  summary: 'Wellen, Wind, Luftdruck und Wassertemperatur an Messbojen, jüngste Messung',
  icon: 'buoy',
  color: COLOR,
  form: 'points',
  cadence: 'hourly',
  sources: [{ name: 'NOAA National Data Buoy Center', url: 'https://www.ndbc.noaa.gov/', license: 'gemeinfrei (US-Regierung)', manifest: { bucket: 'live', key: 'ocean/ndbc-latest_obs.txt' } }],
  options: [{
    id: 'colorBy', label: 'Farbe nach', type: 'select', default: 'wave',
    choices: [{ value: 'wave', label: 'Wellenhöhe' }, { value: 'water', label: 'Wassertemperatur' }, { value: 'wind', label: 'Wind' }],
  }],
  legend: (o) => {
    const by = (o.colorBy as ColorBy) ?? 'wave';
    if (by === 'water') return { type: 'scale', unit: `Wassertemperatur in ${unitLabel('temperature')}`, stops: waterStops.map(([v, c]) => [convert('temperature', v), c]), ticks: [0, 10, 20, 30].map((v) => convert('temperature', v)), format: (v) => formatNumber(v, 0) };
    if (by === 'wind') return { type: 'scale', unit: `Windgeschwindigkeit in ${unitLabel('wind')}`, stops: windStops.map(([v, c]) => [convert('wind', v), c]), ticks: [0, 20, 40, 60, 80, 100].map((v) => convert('wind', v)), format: (v) => formatNumber(v, 0) };
    return { type: 'scale', unit: 'Wellenhöhe in m', stops: WAVE_STOPS, ticks: [0, 2, 4, 6, 8, 10], format: (v) => formatNumber(v, 0) };
  },
  keywords: ['boje', 'wellen', 'wellenhöhe', 'wind', 'ndbc', 'noaa', 'wassertemperatur', 'seegang', 'luftdruck'],

  mount(ctx) {
    const buoys = ctx.resource<BuoyCollection>({
      key: 'live:ndbc-latest',
      url: bucketUrl('live', 'ocean/ndbc-latest_obs.txt'),
      format: 'text',
      parse: 'ndbcBuoys',
      refresh: 10 * MINUTE,
    });
    const by = computed(() => ((ctx.options.value.colorBy as ColorBy) ?? 'wave'));
    const key = computed(() => KEY[by.value]);
    // stations that did not measure the chosen quantity are hidden instead of drawn grey
    const filter = computed(() => ['has', key.value] as unknown as FilterSpecification);
    const count = computed(() => buoys.data.value?.features.filter((f) => key.value in f.properties).length);

    return pointLayer(ctx, {
      data: buoys,
      filter,
      count,
      radius: ['interpolate', ['linear'], ['zoom'], 1, 3, 9, 8] as ExpressionSpecification,
      color: computed(() => colorExpr(by.value)),
      stroke: { color: '#ffffff', width: 1 },
      describe: (f: AnyFeature) => {
        const p = f.properties as BuoyProps;
        const first = KEY[by.peek()];
        const fact = (k: keyof BuoyProps, label: string, text: string | undefined) => (text === undefined ? [] : [{ label, value: text, emphasis: k === first }]);
        const wind = p.wspd === undefined ? undefined : `${formatQuantity('wind', p.wspd * KMH)}${p.wdir !== undefined ? ` aus ${compass(p.wdir)}` : ''}${p.gst !== undefined ? `, Böen ${formatQuantity('wind', p.gst * KMH)}` : ''}`;
        return {
          title: `Messboje ${p.id}`,
          subtitle: 'NOAA National Data Buoy Center',
          time: p.time,
          color: COLOR,
          icon: 'buoy',
          facts: [
            ...fact('wvht', 'Wellenhöhe', p.wvht === undefined ? undefined : `${formatNumber(p.wvht, 1)} m`),
            ...fact('dpd', 'Wellenperiode', p.dpd === undefined ? undefined : `${formatNumber(p.dpd, 0)} s`),
            ...fact('wtmp', 'Wassertemperatur', p.wtmp === undefined ? undefined : formatQuantity('temperature', p.wtmp, { digits: 1 })),
            ...fact('atmp', 'Lufttemperatur', p.atmp === undefined ? undefined : formatQuantity('temperature', p.atmp, { digits: 1 })),
            ...fact('wspd', 'Wind', wind),
            ...fact('pres', 'Luftdruck', p.pres === undefined ? undefined : formatQuantity('pressure', p.pres)),
            { label: 'Messung', value: `${formatDateTime(p.time)} (${formatAge(p.time)})` },
          ],
          links: [{ label: 'Station beim NDBC', url: `https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(p.id)}` }],
        };
      },
    });
  },
});
