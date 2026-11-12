// Health facilities in the Palestinian territories (Healthsites.io, from OpenStreetMap).
import type { ExpressionSpecification } from 'maplibre-gl';
import { bucketUrl } from '../../data/endpoints';
import type { HealthCollection, HealthProps } from '../../data/parsers/gaza';
import { ZEUGEN_WARNUNG } from '../../data/parsers/zeitzeugen';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#58D0A0';
const KIND: Record<string, string> = { hospital: 'Krankenhaus', clinic: 'Klinik', doctors: 'Arztpraxis', pharmacy: 'Apotheke', dentist: 'Zahnarzt', laboratory: 'Labor', rehabilitation: 'Rehabilitation', physiotherapist: 'Physiotherapie' };
const isHospital: ExpressionSpecification = ['==', ['get', 'kind'], 'hospital'];

export default defineLayer({
  id: 'gaza-gesundheit',
  category: 'gesellschaft',
  title: 'Gaza: Gesundheitseinrichtungen',
  summary: 'Krankenhäuser, Kliniken, Arztpraxen und Apotheken in Gaza und im Westjordanland',
  icon: 'warning',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  coverage: 'Palästinensische Gebiete',
  sources: [{ name: 'Healthsites.io / OpenStreetMap-Mitwirkende, über HDX', url: 'https://healthsites.io/', license: 'ODbL', manifest: { bucket: 'data', key: 'healthsites-pse.json' } }],
  sensitive: ZEUGEN_WARNUNG,
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Krankenhaus (groß), übrige Einrichtungen (klein)' }] },
  keywords: ['gaza', 'krankenhaus', 'klinik', 'gesundheit', 'apotheke', 'healthsites', 'zeitzeugen'],

  mount(ctx) {
    const raw = ctx.resource<HealthCollection>({ key: 'data:healthsites-pse', url: bucketUrl('data', 'healthsites-pse.json'), parse: 'healthSites', timeout: 30_000 });
    return pointLayer(ctx, {
      data: raw,
      cluster: { radius: 34, maxZoom: 10 },
      radius: ['interpolate', ['linear'], ['zoom'], 7, ['case', isHospital, 3.8, 2], 13, ['case', isHospital, 8, 4.5]] as ExpressionSpecification,
      color: COLOR,
      stroke: { color: 'rgba(5,30,20,0.9)', width: 0.9 },
      sortKey: ['case', isHospital, 1, 0] as ExpressionSpecification,
      describe: (f: AnyFeature) => {
        const p = f.properties as HealthProps;
        return {
          title: p.name || KIND[p.kind] || 'Gesundheitseinrichtung',
          subtitle: KIND[p.kind] ?? p.kind,
          color: COLOR,
          icon: 'warning',
          facts: [{ label: 'Art', value: KIND[p.kind] ?? p.kind }, ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []), { label: 'Quelle', value: 'Healthsites.io / OpenStreetMap (ODbL)' }],
          links: [...(p.url ? [{ label: 'OpenStreetMap', url: p.url }] : []), { label: 'Healthsites.io', url: 'https://healthsites.io/' }],
        };
      },
    });
  },
});
