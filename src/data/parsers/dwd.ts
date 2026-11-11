// DWD warnings (WFS dwd:Warnungen_Landkreise, GeoJSON) -> slim polygons with the official warning colour.
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export type DwdProps = {
  id: string;
  /** DWD event group in German, e.g. "STARKREGEN" -> as given */
  event: string;
  /** 1 Wetterwarnung (gelb), 2 markantes Wetter (orange), 3 Unwetter (rot), 4 extremes Unwetter (violett) */
  level: 1 | 2 | 3 | 4;
  /** official area colour as hex */
  color: string;
  headline: string;
  area: string;
  description: string;
  instruction: string;
  /** ms since epoch */
  onset: number;
  expires: number;
  state: string;
};
export type DwdCollection = FeatureCollection<Polygon | MultiPolygon, DwdProps>;

export const DWD_LEVEL_COLORS = ['#FFEB3B', '#FFA726', '#E53935', '#8E24AA'] as const;
const LEVELS: Record<string, 1 | 2 | 3 | 4> = { minor: 1, moderate: 2, severe: 3, extreme: 4 };

const ms = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) : NaN);
const rgb = (v: unknown): string | undefined => {
  const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(String(v ?? ''));
  return m ? '#' + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('').toUpperCase() : undefined;
};
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const round = (c: unknown): unknown => (Array.isArray(c) ? (typeof c[0] === 'number' ? c.slice(0, 2).map((n) => r4(n as number)) : c.map(round)) : c);

export function dwdWarnings(raw: unknown): DwdCollection {
  const features: Feature<Polygon | MultiPolygon, DwdProps>[] = [];
  const list = (raw as { features?: { geometry?: Polygon | MultiPolygon | null; properties?: Record<string, unknown> }[] } | null)?.features;
  if (!Array.isArray(list)) return { type: 'FeatureCollection', features };
  for (const f of list) {
    const p = f.properties;
    if (!p || !f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) continue;
    const level = LEVELS[String(p.SEVERITY ?? '').toLowerCase()] ?? 1;
    const expires = ms(p.EXPIRES);
    features.push({
      type: 'Feature',
      geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } as Polygon | MultiPolygon,
      properties: {
        id: `${p.IDENTIFIER ?? ''}#${p.GC_WARNCELLID ?? features.length}`,
        event: String(p.EVENT ?? ''),
        level,
        color: rgb(p.EC_AREA_COLOR) ?? DWD_LEVEL_COLORS[level - 1]!,
        headline: String(p.HEADLINE ?? ''),
        area: String(p.AREADESC ?? ''),
        description: String(p.DESCRIPTION ?? '').trim(),
        instruction: String(p.INSTRUCTION ?? '').replace(/ /g, ' ').trim(),
        onset: ms(p.ONSET ?? p.EFFECTIVE) || 0,
        expires: Number.isFinite(expires) ? expires : 0,
        state: String(p.GC_STATE ?? ''),
      },
    });
  }
  // most severe on top: draw order = source order
  features.sort((a, b) => a.properties.level - b.properties.level);
  return { type: 'FeatureCollection', features };
}
