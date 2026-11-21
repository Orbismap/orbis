// Which regional basemaps to offer for the current view (pure, so it can be tested).
import { BASEMAPS, STATIC_REGIONAL_IDS } from '../../map/basemaps';
import { allGenerated, boundsArea, intersects, isWorldwide, type Bounds, type RegionalItem } from '../../map/basemaps/regional';
import type { BasemapId } from '../../map/types';

const STATIC_COUNTRY = 'CH';

/** The hand-written regional basemaps as picker items (all are in Switzerland). */
export const staticRegional = (): RegionalItem[] =>
  STATIC_REGIONAL_IDS.map((id) => {
    const b = BASEMAPS[id].bounds as Bounds;
    return { id, label: BASEMAPS[id].label, country: STATIC_COUNTRY, bounds: b, area: boundsArea(b) };
  });

/** Wider than this (degrees of longitude), a list would be endless: the picker asks to zoom in instead. */
export const MAX_VIEW_SPAN = 40;

export interface RegionalOption { item: RegionalItem; /** great-circle distance from the map centre to the coverage in km (0 = centre inside) */ km: number }

const EARTH_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km between two lng/lat points. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance from `c` to the bounds: 0 inside, else to the nearest point of the box (latitude clamped, longitude clamped
 * after shifting the centre by ±360° to the nearest copy of the box, so the antimeridian is no edge). The nearest point
 * of a box is only approximately the clamped one on a sphere, which is fine for sorting.
 */
export function distanceToBoundsKm(c: [number, number], b: Bounds): number {
  const lat = Math.min(Math.max(c[1], b[1]), b[3]);
  let best = Infinity;
  for (const o of [-360, 0, 360]) {
    const lng = c[0] + o;
    if (lng >= b[0] && lng <= b[2] && c[1] >= b[1] && c[1] <= b[3]) return 0;
    best = Math.min(best, haversineKm([Math.min(Math.max(lng, b[0]), b[2]), lat], c));
  }
  return best;
}

/** Distance of an item (a series: its nearest member, so a series with an edition at the centre counts as 0). */
export const itemDistanceKm = (c: [number, number], i: RegionalItem): number => Math.min(...(i.parts ?? [i.bounds]).map((b) => distanceToBoundsKm(c, b)));

/**
 * Regional basemaps touching `view`, nearest to the map centre first (equal distance, e.g. several layers around the
 * centre: smaller area first, then name). `selected` stays in the list even when the view has moved away from it.
 * Worldwide entries (language styles of OSM-FR) are no regional maps and would be "nearby" everywhere: left out.
 */
export function regionalFor(view: Bounds | undefined, center: [number, number], selected: BasemapId): RegionalOption[] {
  const all = [...staticRegional(), ...allGenerated()];
  const wide = !view || view[2] - view[0] > MAX_VIEW_SPAN;
  return all
    .filter((i) => i.id === selected || (!wide && view && !isWorldwide(i.bounds) && (i.parts ?? [i.bounds]).some((b) => intersects(view, b))))
    .map((item) => ({ item, km: itemDistanceKm(center, item) }))
    .sort((a, b) => a.km - b.km || a.item.area - b.item.area || a.item.label.localeCompare(b.item.label, 'de'));
}
