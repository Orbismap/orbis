// Smithsonian GVP eruption history (bundled snapshot, public/data/gvp-eruptions.json) -> points per eruption.
// Shape: { u, s, v: [[lat, lon, volcanoNumber, name, [[year, month, day, vei, confirmed], …]], …] }
// year < 0 = BCE, month/day 0 = unknown, confirmed 1 = confirmed eruption, 0 = uncertain.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type EruptionProps = {
  id: string;
  /** GVP volcano number, joins the volcano layer */
  vnum: number;
  name: string;
  /** start year, negative = BCE */
  year: number;
  /** 1-12, 0 = unknown */
  month: number;
  /** 1-31, 0 = unknown */
  day: number;
  /** volcanic explosivity index 0-7, 0 = not stated */
  vei: number;
  /** 1 = confirmed, 0 = uncertain */
  conf: 0 | 1;
};
export type EruptionCollection = FeatureCollection<Point, EruptionProps>;

interface RawVolcano {
  v?: unknown;
}

export function gvpEruptions(raw: unknown): EruptionCollection {
  const features: Feature<Point, EruptionProps>[] = [];
  const list = (raw as RawVolcano | null)?.v;
  if (!Array.isArray(list)) return { type: 'FeatureCollection', features };
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [lat, lon, vnum, name, eruptions] = row as [number, number, number, string, unknown[]];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Array.isArray(eruptions)) continue;
    const label = String(name || 'Vulkan');
    for (const e of eruptions) {
      if (!Array.isArray(e) || e.length < 5) continue;
      const [year, month, day, vei, conf] = e as [number, number, number, number, number];
      if (!Number.isFinite(year)) continue;
      features.push({
        type: 'Feature',
        // stable id: volcano number + year/month/day + vei (duplicates within a year keep their own entry)
        id: `${vnum}-${year}-${month}-${day}-${vei}-${features.length}`,
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          id: `${vnum}-${year}-${month}-${day}-${features.length}`,
          vnum,
          name: label,
          year,
          month: Number.isFinite(month) ? month : 0,
          day: Number.isFinite(day) ? day : 0,
          vei: Number.isFinite(vei) ? vei : 0,
          conf: conf === 1 ? 1 : 0,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** First and last eruption year of a collection (for the legend and the epoch option). */
export function eruptionYears(fc: EruptionCollection): { from: number; to: number } {
  let from = Infinity;
  let to = -Infinity;
  for (const f of fc.features) {
    from = Math.min(from, f.properties.year);
    to = Math.max(to, f.properties.year);
  }
  return Number.isFinite(from) ? { from, to } : { from: 0, to: 0 };
}
