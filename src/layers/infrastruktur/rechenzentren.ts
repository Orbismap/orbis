// Data centres from OpenStreetMap (weekly extract of the data bucket), clustered at low zoom.
import type { ExpressionSpecification } from 'maplibre-gl';
import { bucketUrl } from '../../data/endpoints';
import type { DatacenterCollection, DatacenterProps } from '../../data/parsers/datacenters';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#8F9BFF';

export default defineLayer({
  id: 'rechenzentren',
  category: 'infrastruktur',
  title: 'Rechenzentren',
  summary: 'Rechenzentren und Serverstandorte aus OpenStreetMap',
  icon: 'server',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  sources: [{ name: 'OpenStreetMap-Mitwirkende', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'data', key: 'osm-datacenters/datacenters.json' } }],
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Rechenzentrum' }] },
  keywords: ['server', 'cloud', 'datacenter', 'data center', 'equinix', 'colocation', 'hosting'],

  mount(ctx) {
    const dcs = ctx.resource<DatacenterCollection>({ key: 'data:osm-datacenters', url: bucketUrl('data', 'osm-datacenters/datacenters.json'), parse: 'dataCenters', timeout: 40_000 });
    return pointLayer(ctx, {
      data: dcs,
      cluster: { radius: 42, maxZoom: 7 },
      radius: ['interpolate', ['linear'], ['zoom'], 1, 3, 8, 4.5, 14, 8] as ExpressionSpecification,
      color: COLOR,
      stroke: { color: 'rgba(10, 14, 40, 0.85)', width: 1 },
      describe: (f: AnyFeature) => {
        const p = f.properties as DatacenterProps;
        return {
          title: p.name || (p.operator ? `Rechenzentrum ${p.operator}` : 'Rechenzentrum'),
          subtitle: p.name && p.operator ? p.operator : 'Rechenzentrum',
          color: COLOR,
          icon: 'server',
          facts: [
            ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
            ...(p.city ? [{ label: 'Ort', value: p.city }] : []),
          ],
          links: [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/${p.id}` }],
        };
      },
    });
  },
});
