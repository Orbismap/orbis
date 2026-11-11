// Shared quake types and the merge of the USGS world feed with the EMSC Europe feed.
import type { Feature, FeatureCollection, Point } from 'geojson';
import { haversine } from '../../core/geo';

export type QuakeProps = {
  id: string;
  mag: number;
  /** km below surface */
  depth: number;
  place: string;
  /** ms since epoch */
  time: number;
  url: string;
  tsunami: boolean;
  src: 'usgs' | 'emsc';
};
export type QuakeFeature = Feature<Point, QuakeProps>;
export type QuakeCollection = FeatureCollection<Point, QuakeProps>;

export const emptyQuakes = (): QuakeCollection => ({ type: 'FeatureCollection', features: [] });

/** Same event reported by both agencies: close in time, place and size. */
function isDuplicate(a: QuakeProps, ac: Point['coordinates'], b: QuakeProps, bc: Point['coordinates']): boolean {
  return Math.abs(a.time - b.time) <= 120_000 && Math.abs(a.mag - b.mag) <= 1 && haversine([ac[0]!, ac[1]!], [bc[0]!, bc[1]!]) <= 100;
}

/**
 * Merges quake collections. The first input wins on duplicates (pass USGS first), the result is
 * sorted newest first. Missing inputs are ignored.
 */
export function mergeQuakes(inputs: readonly (QuakeCollection | undefined)[]): QuakeCollection {
  const out: QuakeFeature[] = [];
  for (const fc of inputs) {
    if (!fc) continue;
    for (const f of fc.features) {
      const dup = out.some((o) => o.properties.src !== f.properties.src && isDuplicate(o.properties, o.geometry.coordinates, f.properties, f.geometry.coordinates));
      if (!dup) out.push(f);
    }
  }
  out.sort((a, b) => b.properties.time - a.properties.time);
  return { type: 'FeatureCollection', features: out };
}
