// Overpass answer (`out geom`) for man_made=pipeline ways -> slim lines with a colour per substance.
import type { Feature, FeatureCollection, LineString } from 'geojson';

export const SUBSTANCES: Record<string, { label: string; color: string }> = {
  gas: { label: 'Gas', color: '#FFD166' },
  oil: { label: 'Öl', color: '#E5533D' },
  hydrogen: { label: 'Wasserstoff', color: '#C77DFF' },
  water: { label: 'Wasser', color: '#3E8BFF' },
  other: { label: 'Sonstige', color: '#9AA3B2' },
};

const MAP: Record<string, string> = {
  gas: 'gas', natural_gas: 'gas', lpg: 'gas', fuel: 'oil', oil: 'oil', crude_oil: 'oil', petroleum: 'oil', hydrogen: 'hydrogen', water: 'water',
};

export type PipelineProps = { id: number; name: string; substance: string; color: string; operator: string; diameter: string; underground: boolean };
export type PipelineCollection = FeatureCollection<LineString, PipelineProps>;

export function overpassPipelines(raw: unknown): PipelineCollection {
  const features: Feature<LineString, PipelineProps>[] = [];
  const els = (raw as { elements?: { id: number; geometry?: { lat: number; lon: number }[]; tags?: Record<string, string> }[] } | null)?.elements;
  for (const e of els ?? []) {
    if (!e.geometry || e.geometry.length < 2) continue;
    const t = e.tags ?? {};
    const key = MAP[t.substance ?? ''] ?? 'other';
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: e.geometry.map((p) => [p.lon, p.lat]) },
      properties: {
        id: e.id,
        name: t.name ?? '',
        substance: key,
        color: SUBSTANCES[key]!.color,
        operator: t.operator ?? '',
        diameter: t.diameter ?? '',
        underground: t.location === 'underground' || t.location === 'underwater',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
