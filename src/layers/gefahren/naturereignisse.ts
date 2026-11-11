// NASA EONET: open natural events. Wildfires are off by default because "Brände" shows far more of them,
// storms stay on because EONET also carries Pacific/Indian Ocean cyclones that the NHC layer does not cover.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatAge, formatDateTime, formatInt, formatNumber, withUnit } from '../../core/format';
import { DAY, MINUTE } from '../../core/time';
import { formatQuantity } from '../../core/units';
import { bucketUrl } from '../../data/endpoints';
import { fetchJson } from '../../data/http';
import { eonetEvents, type EonetCollection, type EonetProps } from '../../data/parsers/eonet';
import type { AnyFeature } from '../../render/common';
import { pointLayer } from '../../render/points';
import type { IconName } from '../../ui/icons/names';
import { defineLayer } from '../define';

interface Cat { color: string; de: string; icon: IconName; group: string }
const CATS: Record<string, Cat> = {
  wildfires: { color: '#FF7A1A', de: 'Waldbrand', icon: 'flame', group: 'wildfires' },
  severeStorms: { color: '#5EA8FF', de: 'Unwetter und Wirbelsturm', icon: 'storm', group: 'severeStorms' },
  seaLakeIce: { color: '#BFE9FF', de: 'Meer- und Seeeis', icon: 'ice', group: 'seaLakeIce' },
  volcanoes: { color: '#FF4B2B', de: 'Vulkan', icon: 'volcano', group: 'volcanoes' },
  floods: { color: '#3D8BFF', de: 'Überschwemmung', icon: 'drop', group: 'floods' },
  drought: { color: '#D9A441', de: 'Dürre', icon: 'sun', group: 'other' },
  dustHaze: { color: '#C2A27A', de: 'Staub und Dunst', icon: 'cloud', group: 'other' },
  landslides: { color: '#A0714F', de: 'Erdrutsch', icon: 'mountain', group: 'other' },
  manmade: { color: '#B084F0', de: 'Menschengemacht', icon: 'warning', group: 'other' },
  snow: { color: '#E6F0FF', de: 'Schnee', icon: 'snow', group: 'other' },
  tempExtremes: { color: '#FF5E7E', de: 'Temperaturextrem', icon: 'thermometer', group: 'other' },
  waterColor: { color: '#3DDCC0', de: 'Wasserfärbung', icon: 'drop', group: 'other' },
};
const FALLBACK: Cat = { color: '#9AA5B5', de: 'Ereignis', icon: 'info', group: 'other' };
const cat = (id: string) => CATS[id] ?? FALLBACK;

function magnitude(p: EonetProps): string | undefined {
  if (p.mag === null) return undefined;
  switch (p.unit) {
    case 'kts': return formatQuantity('wind', p.mag * 1.852);
    case 'NM^2': return withUnit(formatInt(p.mag * 3.4299), 'km²');
    case 'acres': return withUnit(formatInt(p.mag * 0.404686), 'ha');
    case 'hectares': return withUnit(formatInt(p.mag), 'ha');
    default: return `${formatNumber(p.mag, p.mag % 1 ? 1 : 0)} ${p.unit}`.trim();
  }
}

export default defineLayer({
  id: 'naturereignisse',
  category: 'gefahren',
  title: 'Naturereignisse',
  summary: 'Offene Ereignisse der NASA: Unwetter, Eisberge, Vulkane, Überschwemmungen, Dürren und mehr, Brände nur auf Wunsch',
  icon: 'globe',
  color: '#5EA8FF',
  form: 'points',
  cadence: 'minutes',
  sources: [{ name: 'NASA EONET', url: 'https://eonet.gsfc.nasa.gov/', license: 'NASA, frei nutzbar mit Quellenangabe', manifest: { bucket: 'live', key: 'events/eonet.json' } }],
  time: { mode: 'window', range: () => ({ start: -45 * DAY, end: 0, step: 3600_000 }) },
  options: [
    { id: 'severeStorms', label: 'Unwetter und Wirbelstürme', type: 'toggle', default: true },
    { id: 'seaLakeIce', label: 'Meer- und Seeeis', type: 'toggle', default: true },
    { id: 'volcanoes', label: 'Vulkane', type: 'toggle', default: true },
    { id: 'floods', label: 'Überschwemmungen', type: 'toggle', default: true },
    { id: 'other', label: 'Sonstige (Dürre, Staub, Erdrutsch …)', type: 'toggle', default: true },
    { id: 'wildfires', label: 'Waldbrände', type: 'toggle', default: false },
  ],
  legend: () => ({
    type: 'classes',
    items: ['severeStorms', 'seaLakeIce', 'volcanoes', 'floods', 'drought', 'wildfires'].map((c) => ({ color: CATS[c]!.color, label: CATS[c]!.de })),
  }),
  keywords: ['eonet', 'nasa', 'ereignis', 'eisberg', 'unwetter', 'natur', 'event', 'iceberg', 'storm'],

  mount(ctx) {
    const res = ctx.resource<EonetCollection>({
      key: 'live:eonet',
      url: bucketUrl('live', 'events/eonet.json'),
      parse: 'eonetEvents',
      refresh: 10 * MINUTE,
      fallback: async () => eonetEvents((await fetchJson('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=45')).data),
    });
    const visible = computed<EonetCollection | undefined>(() => {
      const d = res.data.value;
      if (!d) return undefined;
      const o = ctx.options.value;
      const t = ctx.time.value;
      return { type: 'FeatureCollection', features: d.features.filter((f) => o[cat(f.properties.cat).group] !== false && f.properties.t0 <= t) };
    });
    const color = ['match', ['get', 'cat'], ...Object.entries(CATS).flatMap(([k, v]) => [k, v.color]), FALLBACK.color] as unknown as ExpressionSpecification;

    return pointLayer(ctx, {
      data: visible,
      resources: [res],
      idKey: 'id',
      radius: ['interpolate', ['linear'], ['zoom'], 1, ['interpolate', ['linear'], ['to-number', ['get', 'mag'], 0], 0, 4, 34, 4, 150, 8], 8, ['interpolate', ['linear'], ['to-number', ['get', 'mag'], 0], 0, 8, 34, 8, 150, 15]] as ExpressionSpecification,
      color,
      stroke: { color: 'rgba(10,15,24,0.9)', width: 1.2 },
      describe: (f: AnyFeature) => {
        const p = f.properties as EonetProps;
        const c = cat(p.cat);
        const mag = magnitude(p);
        return {
          title: p.title,
          subtitle: c.de,
          time: p.t,
          color: c.color,
          icon: c.icon,
          facts: [
            { label: 'Art', value: c.de },
            ...(mag ? [{ label: p.unit === 'kts' ? 'Wind' : 'Ausmaß', value: mag, emphasis: true }] : []),
            { label: 'Zuletzt gemeldet', value: `${formatDateTime(p.t)} (${formatAge(p.t)})` },
            ...(p.n > 1 ? [{ label: 'Seit', value: formatDateTime(p.t0) }, { label: 'Meldungen', value: formatInt(p.n) }] : []),
            { label: 'Quelle', value: p.src },
          ],
          links: [{ label: `Quelle (${p.src})`, url: p.url }, { label: 'NASA EONET', url: `https://eonet.gsfc.nasa.gov/api/v3/events/${p.id}` }],
        };
      },
      feed: (features) =>
        [...features]
          .sort((a, b) => b.properties.t - a.properties.t)
          .slice(0, 150)
          .map((f) => {
            const p = f.properties as EonetProps;
            const c = f.geometry as { coordinates: number[] };
            return { id: p.id, title: p.title, subtitle: cat(p.cat).de, time: p.t, color: cat(p.cat).color, location: [c.coordinates[0]!, c.coordinates[1]!] as [number, number] };
          }),
    });
  },
});
