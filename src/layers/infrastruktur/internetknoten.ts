// Internet exchange points (PeeringDB). Live query only, held in memory (PeeringDB acceptable use: no mirroring).
// An exchange is placed at the mean position of its facilities; the area encodes the number of connected networks.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { formatInt } from '../../core/format';
import { failFast, pdbFacSpec, type FacCollection } from '../../data/parsers/peeringdb';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#E07BFF';
const API = 'https://www.peeringdb.com/api';

interface Ix { id: number; name: string; name_long?: string; city?: string; country?: string; website?: string; net_count?: number }
interface IxFac { ix_id: number; fac_id: number }
type IxProps = { id: number; name: string; longName: string; city: string; country: string; website: string; nets: number; facilities: number };

const rows = <T>(raw: unknown): T[] => ((raw as { data?: T[] } | null)?.data ?? []);
const nets = (e: ExpressionSpecification): ExpressionSpecification => e;
const size = (k: number): ExpressionSpecification =>
  nets(['interpolate', ['linear'], ['get', 'nets'], 0, 3 * k, 30, 5 * k, 150, 8.5 * k, 500, 13 * k, 1000, 17 * k] as ExpressionSpecification);

export default defineLayer({
  id: 'internetknoten',
  category: 'infrastruktur',
  title: 'Internetknoten',
  summary: 'Internet Exchange Points, Größe nach Zahl der angeschlossenen Netze',
  icon: 'cable',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  sources: [{ name: 'PeeringDB', url: 'https://www.peeringdb.com/', license: 'PeeringDB Acceptable Use Policy (Live-Abruf, keine Weitergabe)' }],
  legend: {
    type: 'size', unit: 'angeschlossene Netze', color: COLOR,
    items: [{ size: 3, label: '1' }, { size: 8, label: '150' }, { size: 17, label: '1000' }],
  },
  keywords: ['ixp', 'peering', 'de-cix', 'ams-ix', 'linx', 'internet', 'exchange', 'peeringdb'],

  mount(ctx) {
    const ix = ctx.resource<Ix[]>({ key: 'peeringdb:ix', url: `${API}/ix?fields=id,name,name_long,city,country,website,net_count`, parse: rows<Ix>, timeout: 40_000 });
    const ixfac = ctx.resource<IxFac[]>({ key: 'peeringdb:ixfac', url: `${API}/ixfac?fields=ix_id,fac_id`, parse: rows<IxFac>, timeout: 40_000 });
    // same request as `rechenzentren` (shared resource): PeeringDB is only asked once
    const fac = ctx.resource<FacCollection>(pdbFacSpec());

    const data = computed<FeatureCollection<Point, IxProps> | undefined>(() => {
      const a = ix.data.value, b = ixfac.data.value, c = fac.data.value;
      if (!a || !b || !c) return undefined;
      const pos = new Map<number, [number, number]>();
      for (const f of c.features) pos.set(f.properties.fid, f.geometry.coordinates as [number, number]);
      const at = new Map<number, [number, number][]>();
      for (const l of b) {
        const p = pos.get(l.fac_id);
        if (p) (at.get(l.ix_id) ?? at.set(l.ix_id, []).get(l.ix_id)!).push(p);
      }
      const features: Feature<Point, IxProps>[] = [];
      for (const x of a) {
        const ps = at.get(x.id);
        if (!ps?.length) continue;
        const lon = ps.reduce((s, p) => s + p[0], 0) / ps.length;
        const lat = ps.reduce((s, p) => s + p[1], 0) / ps.length;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [+lon.toFixed(4), +lat.toFixed(4)] },
          properties: { id: x.id, name: x.name, longName: x.name_long && x.name_long !== x.name ? x.name_long : '', city: x.city ?? '', country: x.country ?? '', website: /^https?:\/\//.test(x.website ?? '') ? x.website! : '', nets: x.net_count ?? 0, facilities: ps.length },
        });
      }
      return { type: 'FeatureCollection', features };
    });

    // a failed (429) request ends in `error`, not in endless loading
    const all = [ix, ixfac, fac];
    return pointLayer({ ...ctx, status: failFast(ctx.status, all) }, {
      data,
      resources: all,
      radius: ['interpolate', ['linear'], ['zoom'], 1, size(0.8), 8, size(1.2)] as ExpressionSpecification,
      color: COLOR,
      stroke: { color: 'rgba(30, 8, 40, 0.85)', width: 1 },
      sortKey: ['get', 'nets'] as ExpressionSpecification,
      describe: (f: AnyFeature) => {
        const p = f.properties as IxProps;
        return {
          title: p.name,
          subtitle: p.longName || 'Internetknoten',
          color: COLOR,
          icon: 'cable',
          facts: [
            { label: 'Angeschlossene Netze', value: formatInt(p.nets), emphasis: true },
            { label: 'Standorte', value: formatInt(p.facilities) },
            ...(p.city || p.country ? [{ label: 'Ort', value: [p.city, p.country].filter(Boolean).join(', ') }] : []),
          ],
          links: [{ label: 'PeeringDB', url: `https://www.peeringdb.com/ix/${p.id}` }, ...(p.website ? [{ label: 'Website', url: p.website }] : [])],
        };
      },
    });
  },
});
