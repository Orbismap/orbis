// Tectonic plate boundaries (PB2002, Bird 2003) from a static GeoJSON in public/data.
import type { ExpressionSpecification } from 'maplibre-gl';
import { PLATE_NAMES, type PlateBoundaryProps, type PlateCollection } from '../../data/parsers/plates';
import { lineLayer } from '../../render/lines';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const SUBDUCTION = '#FF5A4D';
const OTHER = '#FFB347';
const URL_ = `${import.meta.env.BASE_URL}data/PB2002_boundaries.json`;

export default defineLayer({
  id: 'plattengrenzen',
  category: 'erde',
  title: 'Plattengrenzen',
  summary: 'Grenzen der Erdplatten, wo Beben und Vulkane entstehen',
  icon: 'quake',
  color: SUBDUCTION,
  form: 'lines',
  cadence: 'static',
  sources: [{ name: 'Bird (2003) PB2002, GeoJSON von Hugo Ahlenius / Nordpil', url: 'https://github.com/fraxen/tectonicplates', license: 'ODC Attribution License 1.0' }],
  legend: {
    type: 'classes',
    items: [
      { color: SUBDUCTION, label: 'Subduktionszone (eine Platte taucht ab)', shape: 'line' },
      { color: OTHER, label: 'Rücken, Transform- und andere Grenzen', shape: 'line' },
    ],
  },
  keywords: ['platten', 'tektonik', 'subduktion', 'kontinentaldrift', 'graben', 'rücken', 'plate'],

  mount(ctx) {
    const data = ctx.resource<PlateCollection>({ key: 'static:plates-pb2002', url: URL_, parse: 'plateBoundaries', timeout: 30_000 });
    return lineLayer(ctx, {
      data,
      color: ['match', ['get', 'type'], 'subduction', SUBDUCTION, OTHER] as ExpressionSpecification,
      width: ['interpolate', ['linear'], ['zoom'], 1, 1.2, 6, 2.2, 10, 3.5] as ExpressionSpecification,
      casing: true,
      opacity: 0.95,
      describe: (f: AnyFeature) => {
        const p = f.properties as PlateBoundaryProps;
        const sub = p.type === 'subduction';
        return {
          title: `${p.aName} – ${p.bName}`,
          subtitle: sub ? 'Subduktionszone' : 'Plattengrenze',
          color: sub ? SUBDUCTION : OTHER,
          icon: 'quake',
          facts: [
            { label: 'Platten', value: `${PLATE_NAMES[p.a] ?? p.a} und ${PLATE_NAMES[p.b] ?? p.b}`, emphasis: true },
            { label: 'Art', value: sub ? 'Subduktion' : 'Rücken, Transform- oder andere Grenze' },
            ...(p.source ? [{ label: 'Datengrundlage', value: p.source }] : []),
            { label: 'Modell', value: 'PB2002, Bird (2003)' },
          ],
        };
      },
    });
  },
});
