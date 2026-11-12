// NWS active warnings and watches for severe convective weather (USA), as areas coloured by event.
import { computed, effect, signal } from '@preact/signals';
import type { FeatureCollection } from 'geojson';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatAge, formatDateTime } from '../../core/format';
import { DAY, MINUTE } from '../../core/time';
import { bucketUrl, proxied } from '../../data/endpoints';
import { fetchJson, fetchRaw } from '../../data/http';
import { geometryCenter } from '../../data/parsers/geocenter';
import { nwsAlerts, type NwsCollection, type NwsProps } from '../../data/parsers/nws';
import { reportDayStart, spcReports, type SpcCollection, type SpcKind, type SpcProps } from '../../data/parsers/spc';
import { areaLayer } from '../../render/areas';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';
import type { FeedItem } from '../types';

/** English NWS event -> German label, colour, draw/feed priority (higher = more severe, drawn on top). */
const EVENTS: Record<string, { de: string; color: string; slug: string; rank: number }> = {
  'Severe Thunderstorm Watch': { de: 'Vorwarnung schwere Gewitter', color: '#DB7093', slug: 'severe-thunderstorm-watch', rank: 0 },
  'Tornado Watch': { de: 'Tornado-Vorwarnung', color: '#FFD400', slug: 'tornado-watch', rank: 1 },
  'Snow Squall Warning': { de: 'Warnung Schneeböen', color: '#C71585', slug: 'snow-squall-warning', rank: 2 },
  'Flash Flood Warning': { de: 'Warnung Sturzflut', color: '#2ECC71', slug: 'flash-flood-warning', rank: 3 },
  'Severe Thunderstorm Warning': { de: 'Warnung schwere Gewitter', color: '#FF9900', slug: 'severe-thunderstorm-warning', rank: 4 },
  'Extreme Wind Warning': { de: 'Warnung Extremwind', color: '#FF8C69', slug: 'extreme-wind-warning', rank: 5 },
  'Tornado Warning': { de: 'Tornado-Warnung', color: '#FF1F3D', slug: 'tornado-warning', rank: 6 },
};
/** SPC storm reports: observed tornadoes, damaging wind and large hail. */
const REPORTS: Record<SpcKind, { de: string; color: string }> = {
  tornado: { de: 'Tornado gemeldet', color: '#FF1F3D' },
  wind: { de: 'Sturmschaden / Böe gemeldet', color: '#4FA3FF' },
  hail: { de: 'Hagel gemeldet', color: '#3DDC84' },
};
const SPC = 'https://www.spc.noaa.gov/climo/reports/';
const mph = (v: number) => `${Math.round(v * 1.609)} km/h`;
const hail = (v: number) => `${(v / 100 * 2.54).toFixed(1).replace('.', ',')} cm`;
const info = (e: string) => EVENTS[e] ?? { de: e, color: '#FF9900', slug: '', rank: 0 };

export default defineLayer({
  id: 'unwetter-usa',
  category: 'gefahren',
  title: 'Unwetter USA',
  summary: 'Aktive Warnungen und Vorwarnungen des NWS: Tornado, schwere Gewitter, Sturzflut, Extremwind, Schneeböen',
  icon: 'storm',
  color: '#FF1F3D',
  form: 'areas',
  cadence: 'minutes',
  coverage: 'USA',
  sources: [
    { name: 'NOAA National Weather Service', url: 'https://www.weather.gov/', license: 'gemeinfrei (US-Regierung)', manifest: { bucket: 'live', key: 'events/nws/tornado-warning.geojson' } },
    { name: 'NOAA Storm Prediction Center, Local Storm Reports', url: 'https://www.spc.noaa.gov/climo/reports/', license: 'gemeinfrei (US-Regierung)' },
  ],
  time: { mode: 'window', range: () => ({ start: -2 * DAY, end: 0 }) },
  options: [{ id: 'meldungen', label: 'Meldungen (SPC)', type: 'select', default: 'all', choices: [{ value: 'off', label: 'Aus' }, { value: 'tornado', label: 'Nur Tornados' }, { value: 'all', label: 'Tornado, Hagel, Sturm' }] }],
  legend: (o) => ({
    type: 'classes',
    items: [
      ...Object.entries(EVENTS).sort((a, b) => b[1].rank - a[1].rank).map(([, v]) => ({ color: v.color, label: v.de, shape: 'square' as const })),
      ...(o.meldungen === 'off' ? [] : Object.entries(REPORTS).filter(([k]) => o.meldungen === 'all' || k === 'tornado').map(([, v]) => ({ color: v.color, label: v.de, shape: 'dot' as const }))),
    ],
  }),
  keywords: ['spc', 'storm report', 'meldung', 'hagel', 'tornado gemeldet', 'nws', 'tornado', 'gewitter', 'unwetter', 'usa', 'sturzflut', 'warnung', 'thunderstorm', 'flash flood'],

  mount(ctx) {
    const feeds = Object.entries(EVENTS).map(([event, v]) =>
      ctx.resource<NwsCollection>({
        key: `live:nws-${v.slug}`,
        url: bucketUrl('live', `events/nws/${v.slug}.geojson`),
        parse: 'nwsAlerts',
        refresh: 2 * MINUTE,
        fallback: async () => nwsAlerts((await fetchJson(`https://api.weather.gov/alerts/active?event=${encodeURIComponent(event)}`, { headers: { Accept: 'application/geo+json' } })).data),
      }),
    );
    const merged = computed<NwsCollection | undefined>(() => {
      const parts = feeds.map((r) => r.data.value);
      if (parts.every((p) => !p)) return undefined;
      const t = ctx.time.value;
      // expired alerts can linger in the snapshot for a few minutes
      const features = parts.flatMap((p) => p?.features ?? []).filter((f) => !f.properties.expires || f.properties.expires >= t);
      features.sort((a, b) => info(a.properties.event).rank - info(b.properties.event).rank);
      return { type: 'FeatureCollection', features };
    });
    const colors = ['match', ['get', 'event'], ...Object.entries(EVENTS).flatMap(([k, v]) => [k, v.color]), '#FF9900'] as unknown as ExpressionSpecification;

    // SPC local storm reports of the current and the previous report day (12-12 UTC); the day start is computed at parse time
    // spc.noaa.gov: curl sees a CORS header, but Chrome gets none (and revalidating requests fail the preflight).
    // The fallback goes through the CORS proxy, which only works once www.spc.noaa.gov is in the proxy's host list;
    // until then the reports stay empty and the warnings are unaffected.
    const reportFile = (file: string, back: number) => {
      const parse = (raw: unknown) => spcReports(raw, { dayStart: reportDayStart(Date.now()) - back * DAY });
      return ctx.resource<SpcCollection>({
        key: `spc:${file}`,
        url: `${SPC}${file}`,
        format: 'text',
        parse,
        refresh: 5 * MINUTE,
        fallback: async () => parse((await fetchRaw<string>(proxied(`${SPC}${file}`), { format: 'text', signal: ctx.signal })).data),
      });
    };
    const reportRes = [reportFile('today.csv', 0), reportFile('yesterday.csv', 1)];
    const reports = computed<FeatureCollection | undefined>(() => {
      const kinds = ctx.options.value.meldungen ?? 'all';
      if (kinds === 'off') return undefined;
      const t = ctx.time.value;
      if (reportRes.every((r) => !r.data.value)) return undefined;
      const features = reportRes.flatMap((r) => r.data.value?.features ?? []).filter((f) => f.properties.time <= t && f.properties.time > t - 2 * DAY && (kinds === 'all' || f.properties.kind === 'tornado'));
      return { type: 'FeatureCollection', features };
    });

    // both kits feed the same list: collect their items and hand them over together
    let areaItems: FeedItem[] = [];
    let reportItems: FeedItem[] = [];
    const push = () => ctx.feed([...reportItems.filter((i) => (i.magnitude ?? 0) >= 3), ...areaItems, ...reportItems.filter((i) => (i.magnitude ?? 0) < 3)].slice(0, 200));
    const quietStatus = { status: () => {}, feed: (items: FeedItem[]) => { reportItems = items; push(); } };
    const reportsLayer = pointLayer(Object.assign(Object.create(ctx), quietStatus), {
      name: 'reports',
      data: reports,
      idKey: 'id',
      radius: ['match', ['get', 'rank'], 3, 6, 2, 5, 4] as unknown as ExpressionSpecification,
      color: ['match', ['get', 'kind'], 'tornado', REPORTS.tornado.color, 'wind', REPORTS.wind.color, REPORTS.hail.color] as unknown as ExpressionSpecification,
      stroke: { color: '#ffffff', width: 1 },
      minZoom: 3,
      describe: (f: AnyFeature) => {
        const p = f.properties as SpcProps;
        const r = REPORTS[p.kind];
        const value = p.kind === 'wind' ? (p.value ? [{ label: 'Böe', value: mph(p.value) }] : []) : p.kind === 'hail' ? (p.value ? [{ label: 'Korngröße', value: hail(p.value) }] : []) : p.scale ? [{ label: 'Stärke', value: p.scale }] : [];
        return {
          title: `${r.de} – ${p.location}`,
          subtitle: `${p.county} County, ${p.state}`,
          time: p.time,
          color: r.color,
          icon: p.kind === 'tornado' ? 'storm' : 'warning',
          facts: [{ label: 'Gemeldet', value: `${formatDateTime(p.time)} (${formatAge(p.time)})`, emphasis: p.kind === 'tornado' }, ...value, { label: 'Quelle', value: 'NOAA SPC, ungeprüfte Erstmeldung' }],
          text: p.comments || undefined,
          links: [{ label: 'Meldungen beim SPC (englisch)', url: SPC }],
        };
      },
      feed: (features) =>
        [...features].sort((a, b) => b.properties.time - a.properties.time).slice(0, 120).map((f) => {
          const p = f.properties as SpcProps;
          return { id: p.id, title: `${REPORTS[p.kind].de} – ${p.location}`, subtitle: `${p.county} County, ${p.state}`, time: p.time, magnitude: p.rank, color: REPORTS[p.kind].color, location: (f.geometry as unknown as { coordinates: [number, number] }).coordinates };
        }),
    });

    // warnings own the status; with none active, the SPC reports keep the layer "ready"
    const areaStatus = signal<Parameters<typeof ctx.status>[0]>({ state: 'loading' });
    const stopStatus = effect(() => {
      const s = areaStatus.value;
      const n = reports.value?.features.length ?? 0;
      if (s.state === 'empty') ctx.status(n ? { state: 'ready', count: n, updatedAt: s.updatedAt, note: `Keine aktiven Warnungen, ${n} Meldungen` } : { ...s, note: 'Derzeit keine aktiven Warnungen' });
      else ctx.status(s);
    });
    const area = areaLayer(
      Object.assign(Object.create(ctx), {
        status: (s: Parameters<typeof ctx.status>[0]) => { areaStatus.value = s; },
        feed: (items: FeedItem[]) => { areaItems = items; push(); },
      }),
      {
        data: merged,
        resources: feeds,
        idKey: 'id',
        fill: colors,
        fillOpacity: 0.3,
        outline: { color: colors, width: 1.6 },
        describe: (f: AnyFeature) => {
          const p = f.properties as NwsProps;
          const e = info(p.event);
          return {
            title: e.de,
            subtitle: p.area,
            time: p.onset || undefined,
            color: e.color,
            icon: 'storm',
            facts: [
              { label: 'Meldung', value: `${p.event}${p.severity ? ` · ${p.severity}` : ''}`, emphasis: e.rank >= 4 },
              ...(p.expires ? [{ label: 'Gültig bis', value: `${formatDateTime(p.expires)} (${p.expires > Date.now() ? 'noch aktiv' : formatAge(p.expires)})` }] : []),
              ...(p.onset ? [{ label: 'Beginn', value: formatDateTime(p.onset) }] : []),
              ...(p.sender ? [{ label: 'Herausgeber', value: p.sender }] : []),
            ],
            text: [p.headline, p.description, p.instruction && `Handlungshinweis: ${p.instruction}`].filter(Boolean).join('\n\n'),
            links: [{ label: 'Meldung beim NWS (englisch)', url: p.url }],
          };
        },
        feed: (features) =>
          [...features]
            .sort((a, b) => info(b.properties.event).rank - info(a.properties.event).rank || b.properties.onset - a.properties.onset)
            .slice(0, 150)
            .map((f) => {
              const p = f.properties as NwsProps;
              return { id: p.id, title: info(p.event).de, subtitle: p.area, time: p.onset || undefined, magnitude: info(p.event).rank, color: info(p.event).color, location: geometryCenter(f.geometry) ?? [0, 0] };
            }),
      },
    );
    return { destroy() { stopStatus(); reportsLayer.destroy(); area.destroy(); } };
  },
});
