// Airports: large ones from the start, medium ones with scheduled service from zoom 6; IATA labels from zoom 5 / 7.
// Data: public/data/airports.json (OurAirports, public domain), built from the monthly CSV.
import { computed } from '@preact/signals';
import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { formatNumber } from '../../core/format';
import type { AirportProps } from '../../data/parsers/airports';
import { M_PER_FT } from '../../data/parsers/traffic';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';
import type { LayerHandle } from '../types';

const COLOR = '#90caf9';
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const URL_ = `${env.BASE_URL ?? './'}data/airports.json`;
const large = ['interpolate', ['linear'], ['zoom'], 1, 2.5, 5, 4.5, 9, 7, 13, 10] as unknown as ExpressionSpecification;
const medium = ['interpolate', ['linear'], ['zoom'], 6, 2.5, 9, 4.5, 13, 7] as unknown as ExpressionSpecification;

const describe = (f: AnyFeature) => {
  const p = f.properties as AirportProps;
  const code = [p.iata, p.icao].filter(Boolean).join(' / ');
  return {
    title: p.name,
    subtitle: `${code}${p.city ? ` · ${p.city}` : ''}`,
    color: COLOR,
    icon: 'plane' as const,
    facts: [
      ...(p.iata ? [{ label: 'IATA', value: p.iata, emphasis: true }] : []),
      { label: 'ICAO', value: p.icao },
      ...(p.elevFt !== null && p.elevFt !== undefined ? [{ label: 'Höhe', value: `${formatNumber(Math.round(p.elevFt * M_PER_FT))} m (${formatNumber(p.elevFt)} ft)` }] : []),
      { label: 'Größe', value: p.large ? 'Großflughafen' : 'Regionalflughafen' },
      ...(p.country ? [{ label: 'Land', value: p.country }] : []),
    ],
    links: [
      { label: 'Flughafen bei OurAirports', url: `https://ourairports.com/airports/${encodeURIComponent(p.icao)}/` },
      ...(p.iata ? [{ label: 'Abflüge und Ankünfte (OpenSky)', url: `https://opensky-network.org/network/explorer?airport=${encodeURIComponent(p.icao)}` }] : []),
    ],
  };
};

export default defineLayer({
  id: 'flughaefen',
  category: 'verkehr',
  title: 'Flughäfen',
  summary: 'Großflughäfen weltweit, Regionalflughäfen beim Heranzoomen',
  icon: 'plane',
  color: COLOR,
  form: 'points',
  cadence: 'static',
  sources: [{ name: 'OurAirports', url: 'https://ourairports.com/data/', license: 'gemeinfrei (Public Domain)' }],
  keywords: ['flughafen', 'airport', 'iata', 'icao', 'terminal'],

  mount(ctx) {
    const res = ctx.resource<FeatureCollection<Point, AirportProps>>({
      key: 'static:airports',
      url: URL_,
      parse: 'airportsParse',
    });
    const pick = (isLarge: boolean) =>
      computed<FeatureCollection<Point, AirportProps> | undefined>(() => {
        const d = res.data.value;
        return d ? { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.large === isLarge) } : undefined;
      });
    const big = pick(true);
    const mid = pick(false);
    const label = (name: string, src: string, minzoom: number): LayerSpecification => ({
      id: `${ctx.id}.${name}-labels`, type: 'symbol', source: src, minzoom,
      layout: {
        'text-field': ['coalesce', ['get', 'iata'], ['get', 'icao']] as unknown as ExpressionSpecification,
        'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true,
      },
      paint: { 'text-color': '#d8ecff', 'text-halo-color': 'rgba(10, 15, 24, 0.9)', 'text-halo-width': 1.4 },
    } as LayerSpecification);
    const handles: LayerHandle[] = [
      pointLayer(ctx, { data: big, resources: [res], name: 'large', radius: large, color: COLOR, stroke: { color: '#0a0f18', width: 1.5 }, describe }),
      pointLayer(ctx, { data: mid, name: 'medium', minZoom: 6, radius: medium, color: '#6fa8d8', stroke: { color: '#0a0f18', width: 1.2 }, describe }),
    ];
    ctx.map.addLayer(label('large', `${ctx.id}.large-src`, 4.5), 'labels');
    ctx.map.addLayer(label('medium', `${ctx.id}.medium-src`, 7), 'labels');
    return {
      destroy() {
        ctx.map.remove({ layers: [`${ctx.id}.medium-labels`, `${ctx.id}.large-labels`] });
        for (const h of handles.reverse()) h.destroy();
      },
    };
  },
});
