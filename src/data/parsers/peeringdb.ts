// PeeringDB facilities (live query, never mirrored: PeeringDB acceptable use) and their merge with the OSM data centres.
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { DatacenterCollection } from './datacenters';
import type { Resource, ResourceSpec } from '../resource';

export type FacProps = { id: string; fid: number; src: 'pdb'; name: string; org: string; city: string; country: string; nets: number; ixs: number; carriers: number };
export type FacCollection = FeatureCollection<Point, FacProps>;
export type DcProps = { id: string; src: 'pdb' | 'osm'; name: string; operator: string; city: string; country: string; nets: number; ixs: number; carriers: number; fid: number };
export type DcCollection = FeatureCollection<Point, DcProps>;

/** Shared request of rechenzentren and internetknoten (identical URL and key = one fetch). */
export const PDB_FAC_URL = 'https://www.peeringdb.com/api/fac?status=ok&fields=id,name,org_name,city,country,latitude,longitude,net_count,ix_count,carrier_count&depth=0&limit=10000';

interface RawFac { id: number; name?: string; org_name?: string; city?: string; country?: string; latitude: number | null; longitude: number | null; net_count?: number; ix_count?: number; carrier_count?: number }

export function peeringdbFacilities(raw: unknown): FacCollection {
  const features: Feature<Point, FacProps>[] = [];
  const rows = (raw as { data?: RawFac[] } | null)?.data;
  if (Array.isArray(rows)) {
    for (const f of rows) {
      if (typeof f.latitude !== 'number' || typeof f.longitude !== 'number' || (f.latitude === 0 && f.longitude === 0)) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [+f.longitude.toFixed(5), +f.latitude.toFixed(5)] },
        properties: {
          id: `pdb-${f.id}`, fid: f.id, src: 'pdb', name: f.name ?? '', org: f.org_name && f.org_name !== f.name ? f.org_name : '',
          city: f.city ?? '', country: f.country ?? '', nets: f.net_count ?? 0, ixs: f.ix_count ?? 0, carriers: f.carrier_count ?? 0,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** PeeringDB sites plus the OSM points that are not within `metres` of one (same site). */
export function mergeDatacenters(pdb: FacCollection | undefined, osm: DatacenterCollection | undefined, metres = 300): DcCollection {
  const cell = (lon: number, lat: number) => `${Math.round(lon * 100)}:${Math.round(lat * 100)}`;
  const grid = new Map<string, [number, number][]>();
  const features: Feature<Point, DcProps>[] = [];
  for (const f of pdb?.features ?? []) {
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const k = cell(lon, lat);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push([lon, lat]);
    features.push({ type: 'Feature', geometry: f.geometry, properties: { ...f.properties, operator: f.properties.org, name: f.properties.name } as DcProps });
  }
  const near = (lon: number, lat: number) => {
    const kx = Math.cos((lat * Math.PI) / 180);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const [x, y] of grid.get(cell(lon + dx / 100, lat + dy / 100)) ?? []) if (Math.hypot((x - lon) * kx, y - lat) * 111_320 < metres) return true;
    return false;
  };
  for (const f of osm?.features ?? []) {
    const [lon, lat] = f.geometry.coordinates as [number, number];
    if (near(lon, lat)) continue;
    const p = f.properties;
    features.push({ type: 'Feature', geometry: f.geometry, properties: { id: `osm-${p.id}`, src: 'osm', name: p.name, operator: p.operator, city: p.city, country: '', nets: 0, ixs: 0, carriers: 0, fid: 0 } });
  }
  return { type: 'FeatureCollection', features };
}

// ---- main-thread helper shared by the two layers -------------------------------------------------------------

let memory: FacCollection | undefined;

/**
 * Spec of the shared facilities request. Same key and URL in both layers = one request (the resource registry
 * shares it). The last result stays in memory: when PeeringDB answers 429, the fallback serves it.
 */
export function pdbFacSpec(): ResourceSpec<FacCollection> {
  return {
    key: 'peeringdb:fac',
    url: PDB_FAC_URL,
    timeout: 45_000,
    parse: (raw) => (memory = peeringdbFacilities(raw)),
    fallback: async () => {
      if (memory) return memory;
      throw new Error('PeeringDB antwortet nicht (Abrufgrenze erreicht)');
    },
  };
}

/** Wraps `status` so that a failed required resource ends in `error` instead of `loading` forever. */
export function failFast<S extends { state: string; note?: string }>(status: (s: S) => void, resources: Resource<unknown>[]): (s: S) => void {
  return (s) => {
    const bad = resources.find((r) => r.state.peek() === 'error');
    status(s.state === 'loading' && bad ? { ...s, state: 'error', note: bad.error.peek() } : s);
  };
}
