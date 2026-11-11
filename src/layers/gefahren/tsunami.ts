// NOAA tsunami warning centres (NTWC Alaska, PTWC Hawaii): epicentre of the latest bulletins.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatAge, formatDateTime, formatNumber } from '../../core/format';
import { DAY, HOUR, MINUTE } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import type { TsunamiCollection, TsunamiProps } from '../../data/parsers/tsunami';
import type { AnyFeature } from '../../render/common';
import { pointLayer } from '../../render/points';
import { defineLayer } from '../define';
import type { LayerContext } from '../types';

const LEVELS = [
  { color: '#7FB6D9', title: 'Information', label: 'Information, keine Gefahr' },
  { color: '#FFD84D', title: 'Tsunami-Beratung', label: 'Beratung (Advisory)' },
  { color: '#FF9F1A', title: 'Tsunami-Vorwarnung', label: 'Vorwarnung (Watch)' },
  { color: '#FF3B30', title: 'Tsunami-Warnung', label: 'Warnung' },
] as const;
const MAX_AGE = 72 * HOUR;

export default defineLayer({
  id: 'tsunami',
  category: 'gefahren',
  title: 'Tsunami-Meldungen',
  summary: 'Epizentren der jüngsten Bulletins der US-Tsunamiwarnzentren, Farbe nach Warnstufe',
  icon: 'wave',
  color: '#FF9F1A',
  form: 'points',
  cadence: 'minutes',
  coverage: 'Nordamerika, Pazifik, Karibik',
  sources: [
    { name: 'NOAA NWS National Tsunami Warning Center (Alaska)', url: 'https://www.tsunami.gov/', license: 'gemeinfrei (US-Regierung)', manifest: { bucket: 'live', key: 'tsunami/PAAQ.xml' } },
    { name: 'NOAA NWS Pacific Tsunami Warning Center (Hawaii)', url: 'https://www.tsunami.gov/', license: 'gemeinfrei (US-Regierung)', manifest: { bucket: 'live', key: 'tsunami/PHEB.xml' } },
  ],
  time: { mode: 'window', range: () => ({ start: -7 * DAY, end: 0, step: 3600_000 }) },
  options: [{ id: 'info', label: 'Auch Meldungen ohne Gefahr', type: 'toggle', default: true }],
  legend: () => ({ type: 'classes', items: LEVELS.map((l) => ({ color: l.color, label: l.label })) }),
  keywords: ['tsunami', 'flutwelle', 'warnung', 'seebeben', 'ptwc', 'ntwc', 'noaa'],

  mount(ctx) {
    const mk = (key: string) => ctx.resource<TsunamiCollection>({ key: `live:${key}`, url: bucketUrl('live', key), format: 'text', parse: 'tsunamiBulletins', refresh: 5 * MINUTE });
    const feeds = [mk('tsunami/PAAQ.xml'), mk('tsunami/PHEB.xml')];
    const merged = computed<TsunamiCollection | undefined>(() => {
      const parts = feeds.map((r) => r.data.value);
      if (parts.every((p) => !p)) return undefined;
      return { type: 'FeatureCollection', features: parts.flatMap((p) => p?.features ?? []).sort((a, b) => b.properties.t - a.properties.t) };
    });
    const visible = computed<TsunamiCollection | undefined>(() => {
      const d = merged.value;
      if (!d) return undefined;
      const t = ctx.time.value;
      const info = ctx.options.value.info !== false;
      return { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.t <= t && f.properties.t >= t - MAX_AGE && (info || f.properties.level > 0)) };
    });
    const active = computed(() => visible.value?.features.filter((f) => f.properties.level > 0).length);
    const emptyNote = () => {
      const last = merged.value?.features[0]?.properties;
      return last ? `Keine aktive Tsunami-Warnung. Letzte Meldung: ${LEVELS[last.level].title}, ${formatAge(last.t)}` : 'Keine aktive Tsunami-Warnung';
    };
    const reporting = Object.assign(Object.create(ctx), {
      status: (s: Parameters<LayerContext['status']>[0]) => ctx.status(s.state === 'empty' ? { ...s, note: emptyNote() } : s),
    }) as LayerContext;

    return pointLayer(reporting, {
      data: visible,
      resources: feeds,
      idKey: 'id',
      count: active,
      radius: ['interpolate', ['linear'], ['zoom'], 1, ['interpolate', ['linear'], ['get', 'mag'], 0, 5, 5, 6, 8, 13], 8, ['interpolate', ['linear'], ['get', 'mag'], 0, 8, 5, 11, 8, 24]] as ExpressionSpecification,
      color: ['match', ['get', 'level'], 3, LEVELS[3].color, 2, LEVELS[2].color, 1, LEVELS[1].color, LEVELS[0].color] as ExpressionSpecification,
      stroke: { color: '#FFFFFF', width: 1.2 },
      sortKey: ['get', 'level'] as ExpressionSpecification,
      describe: (f: AnyFeature) => {
        const p = f.properties as TsunamiProps;
        const l = LEVELS[p.level];
        const noThreat = /no tsunami (danger|threat)/i.test(p.note);
        return {
          title: `${l.title}: ${p.region}`,
          subtitle: p.mag > 0 ? `Vorläufige Stärke M ${formatNumber(p.mag, 1)}${p.magType ? ` (${p.magType})` : ''}` : undefined,
          time: p.t,
          color: l.color,
          icon: 'wave',
          facts: [
            { label: 'Stufe', value: l.label, emphasis: p.level > 0 },
            ...(p.mag > 0 ? [{ label: 'Stärke', value: `M ${formatNumber(p.mag, 1)}${p.magType ? ` (${p.magType})` : ''}` }] : []),
            { label: 'Meldung', value: `${formatDateTime(p.t)} (${formatAge(p.t)})` },
            ...(p.centre ? [{ label: 'Herausgeber', value: p.centre }] : []),
            ...(noThreat ? [{ label: 'Gefahr', value: 'Keine Tsunami-Gefahr durch dieses Beben' }] : []),
          ],
          text: !noThreat && p.note ? p.note : undefined,
          links: [{ label: 'Bulletin (Text)', url: p.url }, { label: 'tsunami.gov', url: 'https://www.tsunami.gov/' }],
        };
      },
      feed: (features) =>
        features.map((f) => {
          const p = f.properties as TsunamiProps;
          const c = (f.geometry as { coordinates: number[] }).coordinates;
          return { id: p.id, title: `${LEVELS[p.level].title}`, subtitle: p.region, time: p.t, magnitude: p.level, color: LEVELS[p.level].color, location: [c[0]!, c[1]!] as [number, number] };
        }),
    });
  },
});
