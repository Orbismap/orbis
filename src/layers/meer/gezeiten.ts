// NOAA CO-OPS tide gauges (USA): station list as points, current water level and next tides loaded on click.
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatDateTime, formatNumber } from '../../core/format';
import { fetchJson } from '../../data/http';
import type { TideStationCollection, TideStationProps } from '../../data/parsers/tides';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import type { InspectCard, LayerContext } from '../types';
import { defineLayer } from '../define';

const COLOR = '#42A5F5';
const API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

/** "2026-11-10 19:36" (GMT) -> ms */
const gmt = (t: string) => Date.parse(`${t.replace(' ', 'T')}:00Z`);
const meters = (v: number) => `${formatNumber(v, 2)} m`;

async function details(id: string, signal: AbortSignal) {
  const base = `${API}?station=${encodeURIComponent(id)}&datum=MLLW&units=metric&time_zone=gmt&format=json&application=orbis-map`;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [level, hilo] = await Promise.allSettled([
    fetchJson<{ data?: { t: string; v: string }[] }>(`${base}&product=water_level&range=1`, { signal }),
    fetchJson<{ predictions?: { t: string; v: string; type: 'H' | 'L' }[] }>(`${base}&product=predictions&interval=hilo&range=48&begin_date=${today}`, { signal }),
  ]);
  const series = level.status === 'fulfilled' ? (level.value.data.data ?? []).filter((d) => d.v !== '') : [];
  const last = series[series.length - 1];
  const prev = series[Math.max(0, series.length - 4)];
  const now = Date.now();
  const next = hilo.status === 'fulfilled' ? (hilo.value.data.predictions ?? []).map((p) => ({ t: gmt(p.t), v: parseFloat(p.v), type: p.type })).filter((p) => p.t > now).slice(0, 3) : [];
  return {
    level: last ? { v: parseFloat(last.v), t: gmt(last.t) } : undefined,
    trend: last && prev && last !== prev ? Math.sign(parseFloat(last.v) - parseFloat(prev.v)) : 0,
    next,
  };
}

function describeStation(ctx: LayerContext, f: AnyFeature): InspectCard {
  const p = f.properties as TideStationProps;
  const card: InspectCard = {
    title: p.name,
    subtitle: `Gezeitenpegel${p.state ? `, ${p.state}` : ''}`,
    color: COLOR,
    icon: 'wave',
    facts: [{ label: 'Wasserstand', value: 'wird geladen …' }],
    links: [{ label: 'Station bei NOAA CO-OPS', url: `https://tidesandcurrents.noaa.gov/stationhome.html?id=${p.id}` }],
  };
  const update = (facts: InspectCard['facts'], time?: number) => {
    if (ctx.selection.peek() === card) ctx.select({ ...card, facts, time });
  };
  details(p.id, ctx.signal)
    .then((d) => {
      const facts: InspectCard['facts'] = [];
      if (d.level) facts.push({ label: 'Wasserstand', value: `${meters(d.level.v)} über Seekartennull${d.trend > 0 ? ', steigend' : d.trend < 0 ? ', fallend' : ''}`, emphasis: true });
      for (const n of d.next) facts.push({ label: n.type === 'H' ? 'Hochwasser' : 'Niedrigwasser', value: `${formatDateTime(n.t)}, ${meters(n.v)}` });
      update(facts.length ? facts : [{ label: 'Wasserstand', value: 'keine aktuelle Messung' }], d.level?.t);
    })
    .catch(() => update([{ label: 'Wasserstand', value: 'nicht abrufbar' }]));
  return card;
}

export default defineLayer({
  id: 'gezeiten',
  category: 'meer',
  title: 'Gezeitenpegel',
  summary: 'Wasserstand und nächste Hoch- und Niedrigwasser an US-Küstenpegeln',
  icon: 'wave',
  color: COLOR,
  form: 'points',
  cadence: 'minutes',
  coverage: 'USA',
  minZoom: 3,
  sources: [{ name: 'NOAA CO-OPS Tides & Currents', url: 'https://tidesandcurrents.noaa.gov/', license: 'gemeinfrei (US-Regierung)' }],
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Gezeitenpegel, Klick zeigt Wasserstand und Tiden', shape: 'dot' }] },
  keywords: ['gezeiten', 'tide', 'ebbe', 'flut', 'hochwasser', 'niedrigwasser', 'noaa', 'pegel', 'wasserstand'],

  mount(ctx) {
    const stations = ctx.resource<TideStationCollection>({
      key: 'noaa:coops-stations',
      url: 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels',
      parse: 'coopsStations',
      timeout: 40_000,
    });
    return pointLayer(ctx, {
      data: stations,
      minZoom: 3,
      radius: ['interpolate', ['linear'], ['zoom'], 3, 3, 9, 7] as ExpressionSpecification,
      color: COLOR,
      stroke: { color: '#ffffff', width: 1 },
      describe: (f) => describeStation(ctx, f),
    });
  },
});
