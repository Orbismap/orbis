// GDACS: global disaster alerts (cyclones, floods, droughts, volcanoes, fires), colour = alert level, icon = type.
import { computed } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { formatDate, formatDateTime, formatInt, withUnit } from '../../core/format';
import { DAY, MINUTE } from '../../core/time';
import { formatQuantity } from '../../core/units';
import { bucketUrl } from '../../data/endpoints';
import { fetchJson } from '../../data/http';
import { gdacsEvents, type GdacsCollection, type GdacsProps, type GdacsType } from '../../data/parsers/gdacs';
import { markEventTimes, type AnyFeature } from '../../render/common';
import { pointLayer } from '../../render/points';
import type { IconName } from '../../ui/icons/names';
import { defineLayer } from '../define';
import type { LayerContext } from '../types';

const ALERT = [
  { color: '#3DDC84', label: 'Grün', name: 'Grün' },
  { color: '#FFA21F', label: 'Orange', name: 'Orange' },
  { color: '#FF3B30', label: 'Rot', name: 'Rot' },
] as const;
const TYPES: { type: GdacsType; icon: string; ui: IconName; de: string }[] = [
  { type: 'TC', icon: 'star', ui: 'storm', de: 'Wirbelsturm' },
  { type: 'FL', icon: 'square', ui: 'drop', de: 'Überschwemmung' },
  { type: 'DR', icon: 'diamond', ui: 'sun', de: 'Dürre' },
  { type: 'VO', icon: 'volcano', ui: 'volcano', de: 'Vulkanausbruch' },
  { type: 'WF', icon: 'flame', ui: 'flame', de: 'Waldbrand' },
  { type: 'EQ', icon: 'dot', ui: 'quake', de: 'Erdbeben' },
];
const typeDe = (t: GdacsType) => TYPES.find((x) => x.type === t)!.de;
const short = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n).replace(/[,\s]+\S*$/, '')} …` : s);

function title(p: GdacsProps): string {
  const first = p.country.split(',')[0]!.trim();
  const rest = p.country.split(',').length - 1;
  const place = rest > 0 ? `${first} +${rest}` : first;
  if (p.type === 'TC') return `${typeDe(p.type)} ${p.name.replace(/^Tropical Cyclone\s+/i, '')}`;
  if (p.type === 'VO') return `${typeDe(p.type)} ${p.name.replace(/^Eruption\s+/i, '')}`;
  return `${typeDe(p.type)}: ${short(place, 40)}`;
}
function severity(p: GdacsProps): string | undefined {
  if (p.type === 'TC' && p.unit === 'km/h' && p.sev > 0) return `Wind bis ${formatQuantity('wind', p.sev)}`;
  if (p.type === 'WF' && p.unit === 'ha' && p.sev > 0) return `${withUnit(formatInt(p.sev), 'ha')} verbrannt`;
  if (p.type === 'DR' && p.unit === 'km2' && p.sev > 0) return `${withUnit(formatInt(p.sev), 'km²')} betroffen`;
  return undefined;
}

export default defineLayer({
  id: 'katastrophen',
  category: 'gefahren',
  title: 'Katastrophenwarnungen',
  summary: 'Wirbelstürme, Überschwemmungen, Dürren, Vulkanausbrüche und Waldbrände nach GDACS, Farbe nach Alarmstufe',
  icon: 'warning',
  color: '#FFA21F',
  form: 'points',
  cadence: 'minutes',
  sources: [{ name: 'GDACS (UN/EU)', url: 'https://www.gdacs.org/', license: 'frei mit Quellenangabe', manifest: { bucket: 'live', key: 'events/gdacs.json' } }],
  time: { mode: 'window', range: () => ({ start: -30 * DAY, end: 0, step: 3600_000 }) },
  options: [
    { id: 'minAlert', label: 'Mindest-Alarmstufe', type: 'select', default: '0', choices: [{ value: '0', label: 'Grün und höher' }, { value: '1', label: 'Orange und Rot' }, { value: '2', label: 'Nur Rot' }] },
    { id: 'grace', label: 'Ereignisse bis nach Ende zeigen', type: 'select', default: '7', choices: [{ value: '1', label: '1 Tag' }, { value: '7', label: '7 Tage' }, { value: '30', label: '30 Tage' }] },
  ],
  legend: () => ({ type: 'classes', items: ALERT.map((a) => ({ color: a.color, label: `Alarmstufe ${a.label}` })) }),
  keywords: ['gdacs', 'katastrophe', 'alarm', 'flut', 'dürre', 'überschwemmung', 'waldbrand', 'disaster', 'flood', 'drought'],

  mount(ctx) {
    const res = ctx.resource<GdacsCollection>({
      key: 'live:gdacs',
      url: bucketUrl('live', 'events/gdacs.json'),
      parse: 'gdacsEvents',
      refresh: 5 * MINUTE,
      fallback: async () => gdacsEvents((await fetchJson('https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC;FL;VO;DR;WF')).data),
    });
    const visible = computed<GdacsCollection | undefined>(() => {
      const d = res.data.value;
      if (!d) return undefined;
      const min = Number(ctx.options.value.minAlert ?? 0);
      const grace = Number(ctx.options.value.grace ?? 7) * DAY;
      const t = ctx.time.value;
      return { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.alert >= min && f.properties.from <= t && f.properties.to + grace >= t) };
    });
    // Zeitleiste: alle Ereignisse mit ihrem Beginn, in den Farben der Legende
    markEventTimes(ctx, () => {
      const d = res.data.value;
      const min = Number(ctx.options.value.minAlert ?? 0);
      const all = d?.features.filter((f) => f.properties.alert >= min);
      return all && { times: all.map((f) => f.properties.from), colors: all.map((f) => ALERT[f.properties.alert].color) };
    });
    const alertColor = ['match', ['get', 'alert'], 2, ALERT[2].color, 1, ALERT[1].color, ALERT[0].color] as ExpressionSpecification;
    const size = (a: number, b: number, c: number): ExpressionSpecification => ['match', ['get', 'alert'], 2, c, 1, b, a] as ExpressionSpecification;
    const quiet = Object.assign(Object.create(ctx), { status() {} }) as LayerContext;
    const reporting = Object.assign(Object.create(ctx), {
      status: (s: Parameters<LayerContext['status']>[0]) => ctx.status(s.state === 'empty' ? { ...s, note: 'Keine Warnungen im gewählten Zeitraum' } : s),
    }) as LayerContext;

    const describe = (f: AnyFeature) => {
      const p = f.properties as GdacsProps;
      const a = ALERT[p.alert];
      const t = TYPES.find((x) => x.type === p.type)!;
      const sev = severity(p);
      return {
        title: title(p),
        subtitle: `Alarmstufe ${a.name}${p.country && p.type !== 'DR' ? ` · ${short(p.country, 60)}` : ''}`,
        time: p.from,
        color: a.color,
        icon: t.ui,
        facts: [
          { label: 'Alarmstufe', value: a.name, emphasis: p.alert === 2 },
          ...(sev ? [{ label: 'Ausmaß', value: sev }] : []),
          { label: 'Beginn', value: formatDateTime(p.from) },
          ...(p.to > p.from ? [{ label: p.to > Date.now() ? 'Voraussichtlich bis' : 'Ende', value: formatDate(p.to) }] : []),
          ...(p.country ? [{ label: p.type === 'DR' ? 'Betroffene Länder' : 'Land', value: short(p.country, 160) }] : []),
        ],
        links: p.url ? [{ label: 'Bericht bei GDACS', url: p.url }] : [],
      };
    };
    const filterFor = (type: GdacsType) => computed<FilterSpecification>(() => ['==', ['get', 'type'], type] as FilterSpecification);

    const handles = TYPES.map((t, i) =>
      pointLayer(i === 0 ? reporting : quiet, {
        name: t.type,
        data: visible,
        resources: i === 0 ? [res] : [],
        idKey: 'id',
        filter: filterFor(t.type),
        radius: 7,
        color: alertColor,
        stroke: { color: 'rgba(10,15,24,0.9)', width: 1.4 },
        symbol: { icon: t.icon, size: ['interpolate', ['linear'], ['zoom'], 1, size(0.4, 0.52, 0.68), 8, size(0.62, 0.82, 1.05)] as ExpressionSpecification },
        sortKey: ['get', 'alert'] as ExpressionSpecification,
        describe,
        feed:
          i === 0
            ? (features) =>
                [...features]
                  .sort((a, b) => b.properties.from - a.properties.from)
                  .slice(0, 150)
                  .map((f) => {
                    const p = f.properties as GdacsProps;
                    const c = (f.geometry as { coordinates: number[] }).coordinates;
                    return { id: p.id, title: title(p), subtitle: `Alarmstufe ${ALERT[p.alert].name}${severity(p) ? ` · ${severity(p)}` : ''}`, time: p.from, magnitude: p.alert, color: ALERT[p.alert].color, location: [c[0]!, c[1]!] as [number, number] };
                  })
            : undefined,
      }),
    );
    return { destroy: () => handles.reverse().forEach((h) => h.destroy()) };
  },
});
