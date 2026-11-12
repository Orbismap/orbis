// Aid for Ukraine by donor country (Kiel Ukraine Support Tracker, Institut für Weltwirtschaft): arcs from the donor
// capitals to Kyiv, width by the sum of allocated aid since 24 Jan 2022; the card splits it into military, financial
// and humanitarian aid. Weekly snapshot in the data bucket (ukraine-support.json).
import { computed } from '@preact/signals';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatNumber } from '../../core/format';
import { bucketUrl } from '../../data/endpoints';
import { greatCircle } from '../../data/parsers/flightinfo';
import type { AnyFeature } from '../../render/common';
import { lineLayer } from '../../render/lines';
import { pointLayer } from '../../render/points';
import { defineLayer } from '../define';

const COLOR = '#F2C230';
const KYIV: [number, number] = [30.52, 50.45];
const SITE = 'https://www.ifw-kiel.de/topics/war-against-ukraine/ukraine-support-tracker/';

interface Donor { n: string; lat: number; lon: number; fin: number; hum: number; mil: number; tot: number }
interface SupportData { built: string; source: string; xlsx: string; asOf: string; countries: Donor[] }
type Props = { i: number; n: string; w: number };

export default defineLayer({
  id: 'ukraine-hilfe',
  category: 'gesellschaft',
  title: 'Ukraine: Hilfe nach Geberland',
  summary: 'Bögen von den Geberländern nach Kiew, Breite nach zugewiesener Hilfe seit 24.01.2022, Aufteilung in militärisch, finanziell, humanitär',
  icon: 'globe',
  color: COLOR,
  form: 'lines',
  cadence: 'daily',
  coverage: 'Geberländer',
  sources: [{ name: 'Kiel Ukraine Support Tracker (Institut für Weltwirtschaft)', url: SITE, license: 'Namensnennung, siehe Tracker', manifest: { bucket: 'data', key: 'ukraine-support.json' } }],
  legend: { type: 'classes', items: [{ color: COLOR, label: 'zugewiesene Hilfe (Breite nach Summe)', shape: 'line' as const }] },
  keywords: ['ukraine', 'hilfe', 'militärhilfe', 'geberland', 'kiel', 'support tracker', 'waffenlieferungen', 'finanzhilfe'],

  mount(ctx) {
    const raw = ctx.resource<SupportData>({ key: 'data:ukraine-support', url: bucketUrl('data', 'ukraine-support.json'), timeout: 30_000 });
    const arcs = computed<FeatureCollection<LineString, Props> | undefined>(() => {
      const d = raw.data.value;
      if (!d) return undefined;
      const max = Math.max(...d.countries.map((c) => c.tot), 1);
      const features: Feature<LineString, Props>[] = d.countries.map((c, i) => ({
        type: 'Feature', geometry: { type: 'LineString', coordinates: greatCircle([c.lon, c.lat], KYIV) },
        // width 0-10 by the root of the total so that small donors stay visible
        properties: { i, n: c.n, w: Math.sqrt(c.tot / max) * 10 },
      }));
      return { type: 'FeatureCollection', features };
    });
    const donors = computed<FeatureCollection<Point, Props> | undefined>(() => {
      const a = arcs.value;
      return a && { type: 'FeatureCollection', features: a.features.map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: f.geometry.coordinates[0]! }, properties: f.properties })) };
    });
    const describe = (f: AnyFeature) => {
      const d = raw.data.value;
      const c = d?.countries[(f.properties as Props).i];
      if (!d || !c) return { title: 'Geberland', facts: [] };
      const b = (v: number) => `${formatNumber(v, 1)} Mrd. €`;
      return {
        title: c.n, subtitle: 'Zugewiesene Hilfe für die Ukraine', color: COLOR, icon: 'globe' as const, location: [c.lon, c.lat] as [number, number],
        facts: [
          { label: 'Gesamt', value: b(c.tot), emphasis: true },
          { label: 'Militärisch', value: b(c.mil) }, { label: 'Finanziell', value: b(c.fin) }, { label: 'Humanitär', value: b(c.hum) },
          { label: 'Stand', value: d.asOf || d.built.slice(0, 10) },
        ],
        links: [{ label: 'Kiel Ukraine Support Tracker', url: SITE }, ...(d.xlsx ? [{ label: 'Daten (XLSX)', url: d.xlsx }] : [])],
      };
    };
    const l = lineLayer(ctx, {
      name: 'arcs', data: arcs, resources: [raw], color: COLOR, opacity: 0.75, describe,
      width: ['interpolate', ['linear'], ['zoom'], 1, ['+', 0.6, ['*', ['get', 'w'], 0.35]], 8, ['+', 1.2, ['*', ['get', 'w'], 0.7]]] as unknown as ExpressionSpecification,
    });
    const p = pointLayer(ctx, { name: 'donors', data: donors, resources: [raw], color: COLOR, radius: 5, stroke: { color: '#3a2c00', width: 1 }, describe });
    return { destroy: () => { p.destroy(); l.destroy(); } };
  },
});
