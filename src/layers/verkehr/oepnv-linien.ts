// Public transport lines (bus, tram, metro, ferry) with their stops from OpenStreetMap route relations (Overpass via the
// proxy), for the area in view from zoom 11. Answers are cached per grid cell for the session.
import { computed } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { overpassArea } from '../../data/parsers/overpassarea';
import { oepnvQuery, ROUTE_STYLE, type LineProps, type OepnvResult, type StopProps } from '../../data/parsers/oepnv';
import type { AnyFeature } from '../../render/common';
import { lineLayer } from '../../render/lines';
import { pointLayer } from '../../render/points';
import { defineLayer } from '../define';
import type { InspectCard } from '../types';

const EMPTY: OepnvResult = { lines: { type: 'FeatureCollection', features: [] }, stops: { type: 'FeatureCollection', features: [] } };
const MODE_FILTER: Record<string, string[]> = { bus: ['bus', 'trolleybus'], tram: ['tram'], ubahn: ['subway', 'light_rail'], faehre: ['ferry'] };

const lineCard = (f: AnyFeature): InspectCard => {
  const p = f.properties as unknown as LineProps;
  return {
    title: `${p.modeLabel} ${p.ref}`.trim(), subtitle: p.name || undefined, color: p.color, icon: 'train',
    facts: [
      ...(p.from || p.to ? [{ label: 'Strecke', value: [p.from, p.to].filter(Boolean).join(' → '), emphasis: true }] : []),
      ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
    ],
    links: [{ label: 'OpenStreetMap', url: p.url }],
  };
};

export default defineLayer({
  id: 'oepnv-linien',
  category: 'verkehr',
  title: 'ÖPNV-Linien',
  summary: 'Bus-, Tram-, U-Bahn- und Fährlinien mit Haltestellen, ab Zoomstufe 11',
  icon: 'train',
  color: '#b57bff',
  form: 'lines',
  cadence: 'daily',
  coverage: 'Ausschnitt',
  minZoom: 11,
  sources: [{ name: 'OpenStreetMap-Mitwirkende (Overpass API)', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0' }],
  options: [
    { id: 'kind', label: 'Verkehrsmittel', type: 'select', default: 'all', choices: [{ value: 'all', label: 'Alle' }, { value: 'bus', label: 'Bus' }, { value: 'tram', label: 'Tram' }, { value: 'ubahn', label: 'U-Bahn / Stadtbahn' }, { value: 'faehre', label: 'Fähre' }] },
  ],
  legend: { type: 'classes', items: Object.values(ROUTE_STYLE).filter((s) => s.label !== 'O-Bus').sort((a, b) => b.order - a.order).map((s) => ({ color: s.color, label: s.label, shape: 'line' as const })) },
  keywords: ['linien', 'buslinie', 'tram', 'u-bahn', 'öpnv', 'haltestelle', 'liniennetz', 'fähre', 'overpass', 'bus lines'],

  mount(ctx) {
    const res = overpassArea(ctx, { parser: 'overpassRoutes', query: oepnvQuery, empty: EMPTY, minZoom: 11, grid: 0.25 });
    const kind = computed(() => String(ctx.options.value.kind ?? 'all'));
    const lines = computed<FeatureCollection | undefined>(() => res.data.value?.lines);
    const stops = computed<FeatureCollection | undefined>(() => res.data.value?.stops);
    const filter = computed<FilterSpecification | undefined>(() => (kind.value === 'all' ? undefined : (['in', ['get', 'mode'], ['literal', MODE_FILTER[kind.value] ?? []]] as FilterSpecification)));
    const count = computed(() => {
      const d = res.data.value;
      if (!d) return undefined;
      const modes = MODE_FILTER[kind.value];
      return modes ? d.lines.features.filter((f) => modes.includes(f.properties.mode)).length : d.lines.features.length;
    });
    const color = ['get', 'color'] as unknown as ExpressionSpecification;
    const l = lineLayer(ctx, {
      name: 'lines', data: lines, resources: [res], color, width: ['interpolate', ['linear'], ['zoom'], 11, 1.2, 14, 2.5, 17, 5] as unknown as ExpressionSpecification,
      casing: true, opacity: 0.9, filter, describe: lineCard, count, minZoom: 11,
    });
    const s = pointLayer(ctx, {
      name: 'stops', data: stops, resources: [res], color: '#ffffff', radius: ['interpolate', ['linear'], ['zoom'], 13, 2, 17, 5] as unknown as ExpressionSpecification,
      stroke: { color: '#222a3a', width: 1 }, minZoom: 13, count,
      describe: (f) => {
        const p = f.properties as unknown as StopProps;
        return { title: p.name || 'Haltestelle', subtitle: 'Haltestelle', icon: 'train', facts: [], links: [{ label: 'OpenStreetMap', url: p.url }] };
      },
    });
    return { destroy: () => { s.destroy(); l.destroy(); res.dispose(); } };
  },
});
