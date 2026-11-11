// Individual wind turbines from the monthly OpenStreetMap extract (wind.pmtiles, ~700 000 points).
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatNumber } from '../../core/format';
import { bucketUrl } from '../../data/endpoints';
import { pmtilesLayer } from '../../render/pmtiles';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#2BC48A';
const MIN_ZOOM = 7;

/** "6.8 MW", "300 kW", "2500000 W" -> "6,8 MW"; anything else is shown as written. */
function formatOutput(raw: string): string {
  const m = /^\s*([\d.,]+)\s*(k?w|mw|gw)\s*$/i.exec(raw);
  if (!m) return raw;
  const v = Number(m[1]!.replace(',', '.'));
  if (!Number.isFinite(v)) return raw;
  const unit = m[2]!.toLowerCase();
  const kw = unit === 'w' ? v / 1000 : unit === 'kw' ? v : unit === 'mw' ? v * 1000 : v * 1_000_000;
  return kw >= 1000 ? `${formatNumber(kw / 1000, kw % 1000 === 0 ? 0 : 2).replace(/,?0+$/, (s) => (s.startsWith(',') ? '' : s))} MW` : `${formatNumber(kw, 0)} kW`;
}

export default defineLayer({
  id: 'windraeder',
  category: 'infrastruktur',
  title: 'Windräder',
  summary: 'Einzelne Windenergieanlagen aus OpenStreetMap, ab Zoomstufe 7',
  icon: 'turbine',
  color: COLOR,
  form: 'points',
  cadence: 'static',
  minZoom: MIN_ZOOM,
  sources: [{ name: 'OpenStreetMap-Mitwirkende', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'osm', key: 'wind.pmtiles' } }],
  legend: {
    type: 'classes',
    items: [{ color: COLOR, label: 'Windenergieanlage' }],
  },
  keywords: ['wind', 'windrad', 'windkraft', 'turbine', 'windpark', 'energie', 'vestas', 'enercon', 'nordex'],

  mount(ctx) {
    return pmtilesLayer(ctx, {
      url: bucketUrl('osm', 'wind.pmtiles'),
      sourceLayer: 'wind',
      minZoom: MIN_ZOOM,
      radius: ['interpolate', ['linear'], ['zoom'], MIN_ZOOM, 1.6, 10, 2.8, 13, 5, 16, 8] as ExpressionSpecification,
      symbol: { icon: 'turbine', size: ['interpolate', ['linear'], ['zoom'], MIN_ZOOM, 0.2, 10, 0.3, 13, 0.5, 16, 0.8] as ExpressionSpecification },
      color: COLOR,
      stroke: { color: 'rgba(6, 22, 14, 0.8)', width: 0.7 },
      describe: (f: AnyFeature) => {
        const p = f.properties as { id: number; name?: string; operator?: string; manufacturer?: string; model?: string; output?: string };
        const make = [p.manufacturer, p.model].filter(Boolean).join(' ');
        return {
          title: p.name || make || 'Windenergieanlage',
          subtitle: p.name && make ? make : 'Windenergieanlage',
          color: COLOR,
          icon: 'turbine',
          facts: [
            ...(p.output ? [{ label: 'Leistung', value: formatOutput(p.output), emphasis: true }] : []),
            ...(p.manufacturer ? [{ label: 'Hersteller', value: p.manufacturer }] : []),
            ...(p.model ? [{ label: 'Modell', value: p.model }] : []),
            ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
          ],
          links: [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/node/${p.id}` }],
        };
      },
    });
  },
});
