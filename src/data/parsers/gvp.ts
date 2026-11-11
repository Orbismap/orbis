// Smithsonian GVP Holocene volcanoes (WFS GeoJSON) -> slim points with an activity state.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type VolcanoState = 'active' | 'historic' | 'dormant';
export type VolcanoProps = {
  id: number;
  name: string;
  type: string;
  country: string;
  region: string;
  /** m above sea level */
  elev: number | null;
  /** last known eruption year (negative = BCE), null = no eruption known */
  last: number | null;
  /** active: eruption this or last year; historic: since 1900; dormant: older or unknown */
  state: VolcanoState;
  /** 2 / 1 / 0 for sort keys */
  rank: 0 | 1 | 2;
};
export type VolcanoCollection = FeatureCollection<Point, VolcanoProps>;

interface Raw {
  geometry?: { type?: string; coordinates?: number[] };
  properties?: Record<string, unknown>;
}

export function gvpVolcanoes(raw: unknown, args?: { now?: number }): VolcanoCollection {
  const year = new Date(args?.now ?? Date.now()).getUTCFullYear();
  const features: Feature<Point, VolcanoProps>[] = [];
  const list = (raw as { features?: Raw[] } | null)?.features;
  if (!Array.isArray(list)) return { type: 'FeatureCollection', features };
  for (const f of list) {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    if (!p || f.geometry?.type !== 'Point' || !c || c.length < 2) continue;
    const id = Number(p.Volcano_Number);
    if (!Number.isFinite(id)) continue;
    const lastRaw = p.Last_Eruption_Year;
    const last = typeof lastRaw === 'number' && Number.isFinite(lastRaw) ? lastRaw : null;
    const state: VolcanoState = last !== null && last >= year - 1 ? 'active' : last !== null && last >= 1900 ? 'historic' : 'dormant';
    const elev = Number(p.Elevation);
    features.push({
      type: 'Feature',
      id,
      geometry: { type: 'Point', coordinates: [c[0]!, c[1]!] },
      properties: {
        id,
        name: String(p.Volcano_Name ?? 'Vulkan'),
        type: String(p.Primary_Volcano_Type ?? '').replace(/\(es\)|\(s\)/g, '').trim(),
        country: String(p.Country ?? ''),
        region: String(p.Region ?? ''),
        elev: p.Elevation == null || !Number.isFinite(elev) ? null : elev,
        last,
        state,
        rank: state === 'active' ? 2 : state === 'historic' ? 1 : 0,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
