// Data centres: PeeringDB facilities (live query, operator and connected networks) plus the weekly OpenStreetMap extract
// (only sites that are not within 300 m of a PeeringDB facility, as in the old Orbis).
import { computed } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { formatInt } from '../../core/format';
import { bucketUrl } from '../../data/endpoints';
import type { DatacenterCollection } from '../../data/parsers/datacenters';
import { mergeDatacenters, pdbFacSpec, type DcCollection, type DcProps, type FacCollection } from '../../data/parsers/peeringdb';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#8F9BFF';
const OSM = '#6FD3C8';
const nets: ExpressionSpecification = ['coalesce', ['get', 'nets'], 0] as unknown as ExpressionSpecification;
const size = (k: number): ExpressionSpecification =>
  ['interpolate', ['linear'], nets, 0, 3 * k, 20, 4.2 * k, 100, 6.5 * k, 300, 9 * k, 600, 12 * k] as unknown as ExpressionSpecification;

export default defineLayer({
  id: 'rechenzentren',
  category: 'infrastruktur',
  title: 'Rechenzentren',
  summary: 'Rechenzentren und Colocation-Standorte, Größe nach angeschlossenen Netzen',
  icon: 'server',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  sources: [
    { name: 'PeeringDB (Live-Abruf, ca. 5 300 Standorte)', url: 'https://www.peeringdb.com/', license: 'PeeringDB Acceptable Use Policy (nicht gespiegelt)' },
    { name: 'OpenStreetMap-Mitwirkende', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'data', key: 'osm-datacenters/datacenters.json' } },
  ],
  options: [{ id: 'quelle', label: 'Quelle', type: 'select', default: 'all', choices: [{ value: 'all', label: 'Alle' }, { value: 'pdb', label: 'PeeringDB' }, { value: 'osm', label: 'OpenStreetMap' }] }],
  legend: { type: 'classes', items: [{ color: COLOR, label: 'PeeringDB-Standort (Größe: angeschlossene Netze)' }, { color: OSM, label: 'OpenStreetMap, nicht in PeeringDB' }] },
  keywords: ['server', 'cloud', 'datacenter', 'data center', 'equinix', 'colocation', 'hosting', 'peeringdb'],

  mount(ctx) {
    const pdb = ctx.resource<FacCollection>(pdbFacSpec());
    const osm = ctx.resource<DatacenterCollection>({ key: 'data:osm-datacenters', url: bucketUrl('data', 'osm-datacenters/datacenters.json'), parse: 'dataCenters', timeout: 40_000 });
    // PeeringDB failing (429) must not hide the OSM sites: merge whatever has arrived once one of them is there.
    const merged = computed<DcCollection | undefined>(() => {
      const a = pdb.data.value, b = osm.data.value;
      if (!a && !b) return undefined;
      return mergeDatacenters(a, b);
    });
    const filter = computed<FilterSpecification | undefined>(() => {
      const q = String(ctx.options.value.quelle ?? 'all');
      return q === 'all' ? undefined : (['==', ['get', 'src'], q] as FilterSpecification);
    });
    // all resources failing ends in `error` (kit); PeeringDB alone failing keeps the OSM sites and says so
    return pointLayer({ ...ctx, status: (s) => ctx.status(pdb.error.peek() && !pdb.data.peek() && s.state === 'ready' ? { ...s, note: 'PeeringDB gerade nicht erreichbar (Abrufgrenze), nur OpenStreetMap' } : s) }, {
      data: merged,
      resources: [pdb, osm],
      radius: ['interpolate', ['linear'], ['zoom'], 1, size(0.7), 8, size(1), 14, size(1.5)] as ExpressionSpecification,
      color: ['match', ['get', 'src'], 'pdb', COLOR, OSM] as ExpressionSpecification,
      stroke: { color: 'rgba(10, 14, 40, 0.85)', width: 1 },
      sortKey: nets,
      filter,
      describe: (f: AnyFeature) => {
        const p = f.properties as DcProps;
        const isPdb = p.src === 'pdb';
        return {
          title: p.name || (p.operator ? `Rechenzentrum ${p.operator}` : 'Rechenzentrum'),
          subtitle: p.name && p.operator ? p.operator : 'Rechenzentrum',
          color: isPdb ? COLOR : OSM,
          icon: 'server',
          facts: [
            ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
            ...(isPdb ? [
              { label: 'Angeschlossene Netze', value: formatInt(p.nets), emphasis: true },
              { label: 'Internetknoten', value: formatInt(p.ixs) },
              { label: 'Carrier', value: formatInt(p.carriers) },
            ] : []),
            ...(p.city || p.country ? [{ label: 'Ort', value: [p.city, p.country].filter(Boolean).join(', ') }] : []),
            { label: 'Quelle', value: isPdb ? 'PeeringDB' : 'OpenStreetMap' },
          ],
          links: [isPdb ? { label: 'PeeringDB', url: `https://www.peeringdb.com/fac/${p.fid}` } : { label: 'OpenStreetMap', url: `https://www.openstreetmap.org/${p.id.replace(/^osm-/, '')}` }],
        };
      },
    });
  },
});
