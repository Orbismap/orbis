// NWS active warnings and watches for severe convective weather (USA), as areas coloured by event.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatAge, formatDateTime } from '../../core/format';
import { MINUTE } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import { fetchJson } from '../../data/http';
import { geometryCenter } from '../../data/parsers/geocenter';
import { nwsAlerts, type NwsCollection, type NwsProps } from '../../data/parsers/nws';
import { areaLayer } from '../../render/areas';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

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
  sources: [{ name: 'NOAA National Weather Service', url: 'https://www.weather.gov/', license: 'gemeinfrei (US-Regierung)', manifest: { bucket: 'live', key: 'events/nws/tornado-warning.geojson' } }],
  legend: () => ({
    type: 'classes',
    items: Object.entries(EVENTS).sort((a, b) => b[1].rank - a[1].rank).map(([, v]) => ({ color: v.color, label: v.de, shape: 'square' as const })),
  }),
  keywords: ['nws', 'tornado', 'gewitter', 'unwetter', 'usa', 'sturzflut', 'warnung', 'thunderstorm', 'flash flood'],

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

    return areaLayer(
      Object.assign(Object.create(ctx), {
        status: (s: Parameters<typeof ctx.status>[0]) => ctx.status(s.state === 'empty' ? { ...s, note: 'Derzeit keine aktiven Warnungen' } : s),
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
  },
});
