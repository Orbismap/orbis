// Radiosondes (weather balloons) from SondeHub: position, altitude, climb or descent, atmosphere readings.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatAge, formatNumber, NNBSP } from '../../core/format';
import { MINUTE } from '../../core/time';
import { formatQuantity } from '../../core/units';
import type { SondeProps } from '../../data/parsers/sondes';
import { altitudeText, rateText, speedText, stopsExpr } from '../../data/parsers/traffic';
import { trackLayer, type TrackObject } from '../../render/tracks';
import { defineLayer } from '../define';

const COLOR = '#2fcfc4';
const STOPS: [number, string][] = [[0, '#ff9d3d'], [3000, '#ffd84a'], [10000, '#8fe05c'], [20000, '#2fcfc4'], [30000, '#4a8dff'], [38000, '#b06bff']];
const color = stopsExpr('alt', STOPS);
const size = ['interpolate', ['linear'], ['zoom'], 1, 0.3, 6, 0.4, 10, 0.6] as unknown as ExpressionSpecification;
const phaseText = (p: SondeProps) => (p.phase === 1 ? 'steigt' : p.phase === -1 ? 'sinkt am Fallschirm' : p.alt > 1500 ? 'keine Höhenänderung gemeldet' : 'gelandet');

export default defineLayer({
  id: 'wetterballons',
  category: 'verkehr',
  title: 'Wetterballons',
  summary: 'Radiosonden im Aufstieg, Farbe nach Höhe',
  icon: 'cloud',
  color: COLOR,
  form: 'tracks',
  cadence: 'live',
  sources: [{ name: 'SondeHub (Amateurfunk-Netzwerk)', url: 'https://sondehub.org/', license: 'frei (CC BY-SA 4.0 Telemetrie)' }],
  options: [{ id: 'landed', label: 'Gelandete Sonden', type: 'toggle', default: false }],
  legend: { type: 'scale', unit: 'm', stops: STOPS, ticks: [0, 10000, 20000, 30000, 38000] },
  keywords: ['ballon', 'radiosonde', 'sonde', 'wetterballon', 'sondehub', 'balloon', 'aufstieg'],

  mount(ctx) {
    const res = ctx.resource<TrackObject[]>({
      key: 'sondehub:sondes-3h',
      url: 'https://api.v2.sondehub.org/sondes?last=10800',
      parse: 'sondes',
      refresh: 2 * MINUTE,
    });
    const tracks = computed(() => {
      const l = res.data.value;
      if (!l) return undefined;
      return ctx.options.value.landed ? l : l.filter((t) => (t.props as unknown as SondeProps).phase !== 0 || (t.props as unknown as SondeProps).alt > 1500);
    });
    return trackLayer(ctx, {
      data: tracks,
      resources: [res],
      color,
      symbol: { icon: 'balloon', size, rotate: 0 },
      maxExtrapolateMs: 5 * MINUTE,
      tickMs: 500,
      describe: (t, now) => {
        const p = t.props as unknown as SondeProps;
        return {
          title: p.serial,
          subtitle: `${p.subtype || p.type || 'Radiosonde'}${p.manufacturer ? ` · ${p.manufacturer}` : ''}`,
          color: COLOR,
          icon: 'cloud',
          time: t.t,
          facts: [
            { label: 'Höhe', value: altitudeText(p.alt, false), emphasis: true },
            { label: 'Steigrate', value: `${rateText(p.vv)} (${phaseText(p)})` },
            ...(t.speed !== undefined ? [{ label: 'Drift', value: speedText(t.speed, false) }] : []),
            ...(p.temp !== undefined ? [{ label: 'Temperatur', value: formatQuantity('temperature', p.temp, { digits: 1 }) }] : []),
            ...(p.pressure !== undefined ? [{ label: 'Luftdruck', value: formatQuantity('pressure', p.pressure) }] : []),
            ...(p.humidity !== undefined ? [{ label: 'Feuchte', value: `${formatNumber(p.humidity)}${NNBSP}%` }] : []),
            ...(p.freq !== undefined ? [{ label: 'Frequenz', value: `${formatNumber(p.freq, 3)} MHz` }] : []),
            ...(p.uploader ? [{ label: 'Empfangen von', value: p.uploader }] : []),
            { label: 'Letzte Meldung', value: formatAge(t.t, now) },
          ],
          links: [{ label: 'Auf SondeHub ansehen', url: `https://sondehub.org/${encodeURIComponent(p.serial)}` }],
        };
      },
    });
  },
});
