// Global shipping lanes (Benden et al., CC BY 4.0) as lines by class. 1.2 MB GeoJSON straight from GitHub (CORS open),
// jsDelivr as fallback; trimmed in the worker.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { fetchJson } from '../../data/http';
import { shippingLanes, type LaneCollection, type LaneProps, type LaneType } from '../../data/parsers/shippinglanes';
import type { AnyFeature } from '../../render/common';
import { lineLayer } from '../../render/lines';
import { defineLayer } from '../define';

const COLOR = '#26C6DA';
const RAW = 'https://raw.githubusercontent.com/newzealandpaul/Shipping-Lanes/main/data/Shipping_Lanes_v1.geojson';
const MIRROR = 'https://cdn.jsdelivr.net/gh/newzealandpaul/Shipping-Lanes@main/data/Shipping_Lanes_v1.geojson';
const CLASS: Record<LaneType, { label: string; color: string }> = {
  major: { label: 'Hauptschifffahrtsweg', color: '#7fe3f5' },
  middle: { label: 'Nebenroute', color: '#4fbfe0' },
  minor: { label: 'Kleine Route', color: '#3a8fc0' },
};

export default defineLayer({
  id: 'schiffsrouten',
  category: 'meer',
  title: 'Schiffsrouten',
  summary: 'Die großen Schifffahrtswege der Welt, nach Bedeutung gestuft',
  icon: 'ship',
  color: COLOR,
  form: 'lines',
  cadence: 'static',
  coverage: 'Welt',
  sources: [{ name: 'Global Shipping Lanes (P. Benden, Zenodo 6361763)', url: 'https://github.com/newzealandpaul/Shipping-Lanes', license: 'CC BY 4.0' }],
  legend: { type: 'classes', items: (Object.keys(CLASS) as LaneType[]).map((t) => ({ color: CLASS[t].color, label: CLASS[t].label, shape: 'line' as const })) },
  keywords: ['schiffsrouten', 'schifffahrt', 'handelsrouten', 'seewege', 'shipping lanes', 'frachter', 'container'],

  mount(ctx) {
    const lanes = ctx.resource<LaneCollection>({
      key: 'shipping-lanes', url: RAW, parse: 'shippingLanes', timeout: 45_000,
      fallback: async () => shippingLanes((await fetchJson(MIRROR, { timeout: 45_000 })).data),
    });
    return lineLayer(ctx, {
      data: lanes,
      color: ['match', ['get', 'type'], 'major', CLASS.major.color, 'middle', CLASS.middle.color, CLASS.minor.color] as ExpressionSpecification,
      width: ['interpolate', ['linear'], ['zoom'], 1, ['match', ['get', 'type'], 'major', 1.6, 'middle', 1, 0.6], 7, ['match', ['get', 'type'], 'major', 3, 'middle', 2, 1.2]] as ExpressionSpecification,
      opacity: 0.8,
      count: computed(() => lanes.data.value?.features.reduce((n, f) => n + (f.geometry.type === 'MultiLineString' ? f.geometry.coordinates.length : 1), 0)),
      describe: (f: AnyFeature) => {
        const p = f.properties as LaneProps;
        return {
          title: CLASS[p.type].label, subtitle: 'Schiffsroute', color: CLASS[p.type].color, icon: 'ship',
          facts: [{ label: 'Klasse', value: CLASS[p.type].label }],
          text: 'Mittlere Verkehrsachsen aus Schiffsbewegungen, keine Fahrwasser und nicht zur Navigation.',
          links: [{ label: 'Datensatz', url: 'https://doi.org/10.5281/zenodo.6361763' }],
        };
      },
    });
  },
});
