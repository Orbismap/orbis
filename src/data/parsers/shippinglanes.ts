// "Global Shipping Lanes" (P. Benden, CC BY 4.0): keeps geometry and the lane class only.
import type { Feature, FeatureCollection, LineString, MultiLineString } from 'geojson';

export type LaneType = 'major' | 'middle' | 'minor';
export interface LaneProps { type: LaneType; id: string }
export type LaneCollection = FeatureCollection<LineString | MultiLineString, LaneProps>;

interface RawFeature { geometry?: { type?: string; coordinates?: unknown } | null; properties?: { Type?: string } | null }

export function shippingLanes(raw: unknown): LaneCollection {
  const feats = (raw as { features?: RawFeature[] } | null)?.features ?? [];
  const out: Feature<LineString | MultiLineString, LaneProps>[] = [];
  feats.forEach((f, i) => {
    const g = f.geometry;
    if (!g || (g.type !== 'LineString' && g.type !== 'MultiLineString')) return;
    const t = (f.properties?.Type ?? '').toLowerCase();
    const type: LaneType = t === 'major' ? 'major' : t === 'middle' ? 'middle' : 'minor';
    out.push({ type: 'Feature', geometry: g as LineString | MultiLineString, properties: { type, id: String(i) } });
  });
  return { type: 'FeatureCollection', features: out };
}
