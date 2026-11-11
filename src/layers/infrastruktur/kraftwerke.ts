// Power plants: one layer for all fuels (WRI Global Power Plant Database), parsed in the worker.
// Colour = fuel class, area = capacity, the world view shows only the large plants.
import { computed, signal } from '@preact/signals';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { formatNumber } from '../../core/format';
import { bucketUrl } from '../../data/endpoints';
import { FUELS, FUEL_ORDER, type FuelClass, type PlantCollection, type PlantProps } from '../../data/parsers/powerplants';
import type { AnyFeature } from '../../render/common';
import { pointLayer } from '../../render/points';
import { defineLayer } from '../define';

const COLOR = '#F5B73D';

/** Smallest plant (MW) shown at the integer zoom level (index), so the world view stays readable. */
const MIN_MW_BY_ZOOM = [2000, 1000, 600, 300, 150, 80, 40, 15, 5, 0];
const minMwAt = (z: number) => MIN_MW_BY_ZOOM[Math.min(MIN_MW_BY_ZOOM.length - 1, Math.max(0, Math.floor(z)))]!;

const colorExpr = ['match', ['get', 'fuel'], ...FUEL_ORDER.flatMap((k) => [k, FUELS[k].color]), FUELS.other.color] as unknown as ExpressionSpecification;
/** Radius in px: grows with the square root of the capacity (area ~ MW) and with the zoom. */
const sizes = (k: number, min: number, max: number): ExpressionSpecification => ['max', min, ['min', max, ['*', k, ['sqrt', ['get', 'mw']]]]] as ExpressionSpecification;
const radius = ['interpolate', ['linear'], ['zoom'], 1, sizes(0.07, 1.6, 9), 5, sizes(0.15, 2.2, 15), 9, sizes(0.3, 3.5, 24), 13, sizes(0.5, 5, 34)] as ExpressionSpecification;

const power = (mw: number) => (mw >= 1000 ? `${formatNumber(mw / 1000, mw >= 10_000 ? 1 : 2)} GW` : `${formatNumber(mw, mw < 10 ? 1 : 0)} MW`);

export default defineLayer({
  id: 'kraftwerke',
  category: 'infrastruktur',
  title: 'Kraftwerke',
  summary: 'Kraftwerke weltweit, Farbe nach Energieträger, Fläche nach Leistung',
  icon: 'power',
  color: COLOR,
  form: 'points',
  cadence: 'static',
  sources: [{
    name: 'WRI Global Power Plant Database', url: 'https://datasets.wri.org/dataset/globalpowerplantdatabase',
    license: 'CC BY 4.0, World Resources Institute', manifest: { bucket: 'data', key: 'wri/powerplants.json' },
  }],
  options: [
    { id: 'fuel', label: 'Energieträger', type: 'select', default: 'all', choices: [{ value: 'all', label: 'Alle' }, ...FUEL_ORDER.map((k) => ({ value: k, label: FUELS[k].label }))] },
    { id: 'minMw', label: 'Mindestleistung', type: 'range', min: 0, max: 2000, step: 10, default: 0, unit: 'MW' },
  ],
  legend: {
    type: 'classes',
    items: FUEL_ORDER.map((k) => ({ color: FUELS[k].color, label: FUELS[k].label })),
  },
  keywords: ['strom', 'energie', 'wind', 'solar', 'kohle', 'gas', 'atom', 'kernkraft', 'wasserkraft', 'power plant', 'wri'],

  mount(ctx) {
    const plants = ctx.resource<PlantCollection>({ key: 'data:wri-powerplants', url: bucketUrl('data', 'wri/powerplants.json'), parse: 'powerPlants', timeout: 40_000 });

    const ml = ctx.map.ml;
    const zoom = signal(ml.getZoom());
    const onZoom = () => { const z = Math.floor(ml.getZoom()); if (z !== zoom.peek()) zoom.value = z; };
    ml.on('zoom', onZoom);

    const filter = computed<FilterSpecification>(() => {
      const o = ctx.options.value;
      const min = Math.max(Number(o.minMw ?? 0), minMwAt(zoom.value));
      const fuel = String(o.fuel ?? 'all');
      const parts: unknown[] = [['>=', ['get', 'mw'], min]];
      if (fuel !== 'all') parts.push(['==', ['get', 'fuel'], fuel]);
      return ['all', ...parts] as FilterSpecification;
    });

    const handle = pointLayer(ctx, {
      data: plants,
      radius,
      color: colorExpr,
      stroke: { color: 'rgba(8, 12, 20, 0.7)', width: 0.8 },
      sortKey: ['get', 'mw'] as ExpressionSpecification, // small ones first, the big ones on top
      filter,
      describe: (f: AnyFeature) => {
        const p = f.properties as PlantProps;
        const fuel = FUELS[p.fuel as FuelClass];
        return {
          title: p.name,
          subtitle: `${fuel.label}${p.country ? ` · ${p.country}` : ''}`,
          color: fuel.color,
          icon: 'power',
          facts: [
            { label: 'Leistung', value: power(p.mw), emphasis: true },
            { label: 'Energieträger', value: p.fuel === 'other' && p.fuelRaw ? p.fuelRaw : fuel.label },
            ...(p.country ? [{ label: 'Land', value: p.country }] : []),
            ...(p.year ? [{ label: 'In Betrieb seit', value: String(p.year) }] : []),
            ...(p.owner ? [{ label: 'Betreiber', value: p.owner }] : []),
          ],
          links: [...(p.url ? [{ label: 'Quelle zur Anlage', url: p.url }] : []), { label: 'WRI Global Power Plant Database', url: 'https://datasets.wri.org/dataset/globalpowerplantdatabase' }],
        };
      },
    });
    return { destroy() { ml.off('zoom', onZoom); handle.destroy(); } };
  },
});
