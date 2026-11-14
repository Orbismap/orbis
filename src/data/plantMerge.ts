// Duplicate check between the WRI plants and the OpenStreetMap plants (OpenInfraMap tiles): a WRI plant is hidden once
// an OSM plant of the same energy class lies close to it, or an OSM area (wind or solar park) of that class contains it.
// WRI therefore only shows what OpenStreetMap does not have; the OSM objects are always drawn.
import type { FuelClass, PlantCollection } from './parsers/powerplants';

const CELL = 0.08; // degrees, >= 4.4 km in longitude up to 60° latitude: a 3x3 neighbourhood covers the largest match radius

/** OSM `source` -> WRI energy class. */
const OSM_CLASS: Record<string, FuelClass> = {
  wind: 'wind', solar: 'solar', hydro: 'hydro', tidal: 'hydro', nuclear: 'nuclear', coal: 'coal', gas: 'gas', oil: 'oil', diesel: 'oil',
  biomass: 'biomass', biogas: 'biomass', waste: 'biomass',
};
export const fuelClassOfOsm = (source: unknown): FuelClass | undefined => (typeof source === 'string' ? OSM_CLASS[source] ?? 'other' : undefined);

/** How far an OSM point may lie from the WRI plant (WRI places big plants less precisely than OSM). */
const radiusKm = (mw: number) => (mw >= 500 ? 4 : mw >= 100 ? 2.5 : 1.5);
const ANY_CLASS_KM = 0.5; // very close counts as the same plant whatever the class says
const AREA_MARGIN = 0.005; // degrees around an OSM area

interface Wri { id: number; lng: number; lat: number; fuel: FuelClass; mw: number }
const cellOf = (v: number) => Math.floor(v / CELL);
const key = (cx: number, cy: number) => `${cx}:${cy}`;
const sameClass = (a: FuelClass, b: FuelClass) => a === b;
const km = (aLng: number, aLat: number, bLng: number, bLat: number) => {
  const dx = (aLng - bLng) * 111.32 * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  const dy = (aLat - bLat) * 110.57;
  return Math.hypot(dx, dy);
};

export class PlantMatcher {
  /** ids (`properties.id`) of WRI plants that have an OSM counterpart */
  readonly hidden = new Set<number>();
  private readonly grid = new Map<string, Wri[]>();

  constructor(wri: PlantCollection | undefined) {
    for (const f of wri?.features ?? []) {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const w: Wri = { id: f.properties.id, lng, lat, fuel: f.properties.fuel, mw: f.properties.mw };
      const k = key(cellOf(lng), cellOf(lat));
      const list = this.grid.get(k);
      if (list) list.push(w);
      else this.grid.set(k, [w]);
    }
  }

  /** An OSM plant or generator at a point. Returns true when WRI plants got hidden by it. */
  addPoint(lng: number, lat: number, osmClass: FuelClass | undefined): boolean {
    let changed = false;
    const cx = cellOf(lng), cy = cellOf(lat);
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
      for (const w of this.grid.get(key(x, y)) ?? []) {
        if (this.hidden.has(w.id)) continue;
        const d = km(lng, lat, w.lng, w.lat);
        const near = osmClass !== undefined && sameClass(w.fuel, osmClass) ? d <= radiusKm(w.mw) : d <= ANY_CLASS_KM;
        if (near) (this.hidden.add(w.id), (changed = true));
      }
    }
    return changed;
  }

  /** An OSM area (e.g. a wind park) as its bounding box [west, south, east, north]; WRI plants of the same class inside are hidden. */
  addArea(bbox: [number, number, number, number], osmClass: FuelClass | undefined): boolean {
    const [w0, s0, e0, n0] = bbox;
    const west = w0 - AREA_MARGIN, south = s0 - AREA_MARGIN, east = e0 + AREA_MARGIN, north = n0 + AREA_MARGIN;
    if ((east - west) / CELL > 60 || (north - south) / CELL > 60) return false; // implausibly large: bad data
    let changed = false;
    for (let x = cellOf(west); x <= cellOf(east); x++) for (let y = cellOf(south); y <= cellOf(north); y++) {
      for (const w of this.grid.get(key(x, y)) ?? []) {
        if (this.hidden.has(w.id) || w.lng < west || w.lng > east || w.lat < south || w.lat > north) continue;
        if (osmClass === undefined || sameClass(w.fuel, osmClass)) (this.hidden.add(w.id), (changed = true));
      }
    }
    return changed;
  }
}
