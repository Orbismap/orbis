// Mineral and fuel deposits: Wikidata mines and oil/gas/coal fields (clustered world view, parsed in the worker),
// plus OpenStreetMap quarries, shafts and wells from resource.pmtiles once zoomed in.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { bucketUrl } from '../../data/endpoints';
import { RESOURCE_GROUPS, RESOURCE_ORDER, type ResourceCollection, type ResourceGroup, type ResourceProps } from '../../data/parsers/resources';
import { pmtilesLayer } from '../../render/pmtiles';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#F29B1D';
const DETAIL_ZOOM = 9;

const G = (k: ResourceGroup) => RESOURCE_GROUPS[k].color;
const groupColor = ['match', ['get', 'group'], ...RESOURCE_ORDER.flatMap((k) => [k, G(k)]), G('other')] as unknown as ExpressionSpecification;

/** OSM detail points: group guessed from the keyword/resource tags, wells default to oil & gas. */
const haystack: ExpressionSpecification = ['downcase', ['concat', ['coalesce', ['get', 'words'], ''], ' ', ['coalesce', ['get', 'resource'], '']]] as unknown as ExpressionSpecification;
const has = (...words: string[]): ExpressionSpecification =>
  (words.length === 1 ? ['in', words[0], ['var', 'h']] : ['any', ...words.map((w) => ['in', w, ['var', 'h']])]) as unknown as ExpressionSpecification;
const osmColor = ['let', 'h', haystack, ['case',
  has('uranium'), G('uranium'),
  has('oil', 'gas', 'petrol'), G('oilgas'),
  ['==', ['get', 'kind'], 'Bohrloch'], G('oilgas'),
  has('coal', 'lignite', 'anthracite'), G('coal'),
  has('salt', 'potash'), G('salt'),
  has('diamond', 'emerald', 'sapphire', 'ruby', 'gem'), G('gem'),
  has('ore', 'gold', 'silver', 'copper', 'iron', 'lead', 'zinc', 'tin', 'nickel', 'mangan', 'bauxite', 'chrom', 'lithium', 'tungsten'), G('metal'),
  G('other'),
]] as unknown as ExpressionSpecification;

export default defineLayer({
  id: 'rohstoffe',
  category: 'infrastruktur',
  title: 'Rohstoffe',
  summary: 'Bergwerke, Öl-, Gas- und Kohlefelder; Gruben, Schächte und Bohrlöcher ab Zoomstufe 9',
  icon: 'mine',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  sources: [
    { name: 'Wikidata', url: 'https://www.wikidata.org/', license: 'CC0 1.0', manifest: { bucket: 'data', key: 'wikidata/resources.json' } },
    { name: 'OpenStreetMap-Mitwirkende', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'osm', key: 'resource.pmtiles' } },
  ],
  options: [{ id: 'group', label: 'Rohstoff', type: 'select', default: 'all', choices: [{ value: 'all', label: 'Alle' }, ...RESOURCE_ORDER.map((k) => ({ value: k, label: RESOURCE_GROUPS[k].label }))] }],
  legend: { type: 'classes', items: RESOURCE_ORDER.map((k) => ({ color: G(k), label: RESOURCE_GROUPS[k].label })) },
  keywords: ['mine', 'bergbau', 'bergwerk', 'öl', 'gas', 'kohle', 'gold', 'kupfer', 'lithium', 'uran', 'steinbruch', 'erz', 'ölfeld'],

  mount(ctx) {
    const wd = ctx.resource<ResourceCollection>({ key: 'data:wikidata-resources', url: bucketUrl('data', 'wikidata/resources.json'), parse: 'wikiResources', timeout: 40_000 });
    const shown = computed<ResourceCollection | undefined>(() => {
      const d = wd.data.value;
      const g = String(ctx.options.value.group ?? 'all');
      if (!d || g === 'all') return d;
      return { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.group === g) };
    });

    const overview = pointLayer(ctx, {
      data: shown,
      resources: [wd],
      name: 'wikidata',
      cluster: { radius: 36, maxZoom: 6 },
      radius: ['interpolate', ['linear'], ['zoom'], 1, 2.6, 8, 4.5, 14, 7] as ExpressionSpecification,
      color: groupColor,
      stroke: { color: 'rgba(12, 14, 20, 0.8)', width: 0.8 },
      describe: (f: AnyFeature) => {
        const p = f.properties as ResourceProps;
        const g = RESOURCE_GROUPS[p.group];
        return {
          title: p.name,
          subtitle: `${p.cls || 'Vorkommen'} · ${g.label}`,
          color: g.color,
          icon: 'mine',
          facts: [
            { label: 'Art', value: p.cls || 'Vorkommen' },
            { label: 'Gruppe', value: g.label },
            ...(p.products ? [{ label: 'Rohstoffe', value: p.products }] : []),
          ],
          links: [{ label: 'Wikidata', url: `https://www.wikidata.org/wiki/${p.id}` }],
        };
      },
    });

    // the detail layer reports no status of its own (the overview carries count and age)
    const detail = pmtilesLayer({ ...ctx, status: () => {} }, {
      url: bucketUrl('osm', 'resource.pmtiles'),
      sourceLayer: 'resource',
      name: 'osm',
      minZoom: DETAIL_ZOOM,
      radius: ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM, 2.4, 12, 3.6, 15, 6] as ExpressionSpecification,
      color: osmColor,
      stroke: { color: 'rgba(12, 14, 20, 0.8)', width: 0.7 },
      describe: (f: AnyFeature) => {
        const p = f.properties as { id: number; name?: string; kind?: string; resource?: string; words?: string; operator?: string };
        return {
          title: p.name || p.kind || 'Rohstoffstätte',
          subtitle: p.name && p.kind ? p.kind : 'OpenStreetMap',
          color: COLOR,
          icon: 'mine',
          facts: [
            ...(p.kind ? [{ label: 'Art', value: p.kind }] : []),
            ...(p.resource ? [{ label: 'Rohstoff', value: p.resource.replace(/[_;]/g, ', ') }] : []),
            ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
          ],
          links: [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/node/${p.id}` }],
        };
      },
    });

    return { destroy() { detail.destroy(); overview.destroy(); } };
  },
});
