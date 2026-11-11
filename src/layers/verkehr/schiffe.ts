// Ships from AIS via Digitraffic Marine (Fintraffic): everything reported in the Baltic Sea / Finnish waters
// during the last 30 minutes. Positions every minute, dead-reckoned in between; vessel master data once.
import { computed } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { formatNumber } from '../../core/format';
import { MINUTE } from '../../core/time';
import { SHIP_CLASSES, shipClass, shipTypeName, type ShipProps, type ShipVessel } from '../../data/parsers/ais';
import { speedText } from '../../data/parsers/traffic';
import { trackLayer, type TrackObject } from '../../render/tracks';
import { defineLayer } from '../define';

const COLOR = '#4fc3f7';
const BASE = 'https://meri.digitraffic.fi/api/ais/v1';
const colorExpr = ['match', ['get', 'cls'], ...SHIP_CLASSES.slice(0, -1).flatMap((c) => [c.id, c.color]), SHIP_CLASSES[SHIP_CLASSES.length - 1]!.color] as unknown as ExpressionSpecification;
const size = ['interpolate', ['linear'], ['zoom'], 3, 0.2, 7, 0.3, 11, 0.5, 14, 0.7] as unknown as ExpressionSpecification;

export default defineLayer({
  id: 'schiffe',
  category: 'verkehr',
  title: 'Schiffe',
  summary: 'Schiffe nach AIS, Farbe nach Schiffstyp',
  icon: 'ship',
  color: COLOR,
  form: 'tracks',
  cadence: 'live',
  coverage: 'Ostsee / Finnland',
  sources: [{ name: 'Fintraffic Digitraffic Marine (AIS)', url: 'https://www.digitraffic.fi/en/marine-traffic/', license: 'CC BY 4.0' }],
  options: [
    { id: 'moving', label: 'Nur fahrende Schiffe', type: 'toggle', default: false },
    {
      id: 'cls', label: 'Schiffstyp', type: 'select', default: 'all',
      choices: [{ value: 'all', label: 'Alle' }, ...SHIP_CLASSES.map((c) => ({ value: c.id, label: c.label }))],
    },
  ],
  legend: { type: 'classes', items: SHIP_CLASSES.map((c) => ({ color: c.color, label: c.label })) },
  keywords: ['schiff', 'ais', 'fähre', 'ostsee', 'finnland', 'ship', 'vessel', 'tanker', 'frachter'],

  mount(ctx) {
    const loc = ctx.resource<TrackObject[]>({
      key: 'digitraffic:ais-locations',
      // last 30 minutes; the server returns the newest position per vessel
      url: () => `${BASE}/locations?from=${Date.now() - 30 * MINUTE}`,
      parse: 'aisLocations',
      refresh: MINUTE,
      timeout: 40_000,
    });
    const vessels = ctx.resource<Record<string, ShipVessel>>({
      key: 'digitraffic:ais-vessels',
      url: `${BASE}/vessels`,
      parse: 'aisVessels',
      refresh: 30 * MINUTE,
      timeout: 60_000,
    });
    // positions + master data; the class and name live in props so that the map can colour and filter on them
    const tracks = computed<TrackObject[] | undefined>(() => {
      const l = loc.data.value;
      if (!l) return undefined;
      const v = vessels.data.value;
      return l.map((t) => {
        const m = v?.[t.id];
        return { ...t, props: { ...t.props, cls: shipClass(m?.type), name: m?.name ?? '' } };
      });
    });
    const filter = computed<FilterSpecification | undefined>(() => {
      const o = ctx.options.value;
      const clauses: unknown[] = [];
      if (o.moving) clauses.push(['get', 'moving']);
      if (o.cls && o.cls !== 'all') clauses.push(['==', ['get', 'cls'], String(o.cls)]);
      return clauses.length ? (['all', ...clauses] as FilterSpecification) : undefined;
    });
    const count = computed(() => {
      const t = tracks.value;
      if (!t) return undefined;
      const o = ctx.options.value;
      return t.filter((x) => (!o.moving || (x.props as unknown as ShipProps).moving) && (!o.cls || o.cls === 'all' || (x.props as { cls: string }).cls === o.cls)).length;
    });
    return trackLayer(ctx, {
      data: tracks,
      resources: [loc, vessels],
      color: colorExpr,
      symbol: { icon: 'ship', size },
      filter,
      count,
      maxExtrapolateMs: 10 * MINUTE,
      tickMs: 1000,
      describe: (t, now) => {
        const p = t.props as unknown as ShipProps & { cls: string; name: string };
        const m = vessels.data.value?.[t.id];
        const cls = SHIP_CLASSES.find((c) => c.id === p.cls) ?? SHIP_CLASSES[SHIP_CLASSES.length - 1]!;
        const facts: { label: string; value: string; emphasis?: boolean }[] = [{ label: 'Typ', value: shipTypeName(m?.type) }];
        if (m?.dest) facts.push({ label: 'Ziel', value: m.dest, emphasis: true });
        facts.push({ label: 'Geschwindigkeit', value: p.moving ? speedText(p.sog * 0.514444) : 'liegt still' });
        if (p.cog >= 0 && p.moving) facts.push({ label: 'Kurs', value: `${formatNumber(p.cog, 0)}°` });
        if (m?.draught) facts.push({ label: 'Tiefgang', value: `${formatNumber(m.draught, 1)} m` });
        if (m?.len) facts.push({ label: 'Größe', value: `${formatNumber(m.len)} × ${formatNumber(m.wid)} m` });
        if (m?.call) facts.push({ label: 'Rufzeichen', value: m.call });
        facts.push({ label: 'MMSI', value: String(p.mmsi) });
        if (m?.imo) facts.push({ label: 'IMO', value: String(m.imo) });
        const age = Math.round((now - t.t) / MINUTE);
        facts.push({ label: 'Letzte Meldung', value: age < 1 ? 'gerade eben' : `vor ${age} min` });
        return {
          title: m?.name || `MMSI ${p.mmsi}`,
          subtitle: cls.label,
          color: cls.color,
          icon: 'ship',
          facts,
          links: [{ label: 'Auf MarineTraffic ansehen', url: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${p.mmsi}` }],
        };
      },
    });
  },
});
