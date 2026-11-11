// Reference layer: lines from a bucket file (data: osm-cables/cables.json), parsed in the worker.
import type { ExpressionSpecification } from 'maplibre-gl';
import { bucketUrl } from '../../data/endpoints';
import type { CableCollection, CableProps } from '../../data/parsers/cables';
import { lineLayer } from '../../render/lines';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'seekabel',
  category: 'infrastruktur',
  title: 'Seekabel',
  summary: 'Unterseekabel der Datennetze, Verlauf nach OpenStreetMap',
  icon: 'cable',
  color: '#4FC3F7',
  form: 'lines',
  cadence: 'daily',
  sources: [{ name: 'OpenStreetMap-Mitwirkende', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'data', key: 'osm-cables/cables.json' } }],
  keywords: ['internet', 'kabel', 'glasfaser', 'submarine', 'cable', 'daten'],

  mount(ctx) {
    const cables = ctx.resource<CableCollection>({ key: 'data:osm-cables', url: bucketUrl('data', 'osm-cables/cables.json'), parse: 'cableLines', timeout: 40_000 });
    return lineLayer(ctx, {
      data: cables,
      color: ['coalesce', ['get', 'color'], '#4FC3F7'] as ExpressionSpecification,
      width: ['interpolate', ['linear'], ['zoom'], 1, 0.8, 6, 1.6, 12, 3] as ExpressionSpecification,
      casing: true,
      opacity: 0.9,
      describe: (f: AnyFeature) => {
        const p = f.properties as CableProps;
        return {
          title: p.name,
          subtitle: 'Seekabel',
          color: p.color,
          icon: 'cable',
          facts: [
            ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
            ...(p.since ? [{ label: 'In Betrieb seit', value: p.since }] : []),
          ],
          links: [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/way/${p.id}` }],
        };
      },
    });
  },
});
