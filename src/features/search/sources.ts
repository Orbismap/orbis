import { formatCoord } from '../../core/format';
import type { UiIconName } from '../../ui/icons/paths';

export interface Place { id: string; title: string; subtitle: string; lng: number; lat: number; bounds?: [number, number, number, number]; kind?: string }

/** "52.5, 13.4", "52,52 13,40", "52.5N 13.4E" -> lat/lng or null. */
export function parseCoordinate(q: string): { lat: number; lng: number } | null {
  const s = q.trim().replace(/°/g, '').replace(/,(?=\d)/g, '.').replace(/[;,]/g, ' ');
  const m = /^(-?\d+(?:\.\d+)?)\s*([NSns])?\s+(-?\d+(?:\.\d+)?)\s*([EOWeow])?$/.exec(s);
  if (!m) return null;
  let lat = parseFloat(m[1]!);
  let lng = parseFloat(m[3]!);
  if (/s/i.test(m[2] ?? '')) lat = -Math.abs(lat);
  if (/w/i.test(m[4] ?? '')) lng = -Math.abs(lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export const coordinateLabel = (c: { lat: number; lng: number }) => formatCoord(c.lat, c.lng, 4);

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { osm_id?: number; osm_type?: string; name?: string; street?: string; housenumber?: string; city?: string; state?: string; country?: string; countrycode?: string; district?: string; osm_value?: string; extent?: [number, number, number, number] };
}

/** Photon geocoder (Komoot). Throws on network errors; AbortError when superseded. */
export async function searchPlaces(q: string, signal: AbortSignal): Promise<Place[]> {
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=de&limit=6`, { signal });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const json = (await res.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const f of json.features ?? []) {
    const p = f.properties;
    const title = p.name ?? [p.street, p.housenumber].filter(Boolean).join(' ');
    if (!title) continue;
    const subtitle = [p.district, p.city !== p.name ? p.city : undefined, p.state, p.country].filter(Boolean).join(', ');
    const key = `${title}|${subtitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [lng, lat] = f.geometry.coordinates;
    const e = p.extent;
    out.push({ id: `${p.osm_type ?? ''}${p.osm_id ?? key}`, title, subtitle, lng, lat, bounds: e ? [e[0], e[3], e[2], e[1]] : undefined, kind: p.osm_value });
  }
  return out;
}

export type ResultGroup = 'Koordinate' | 'Befehle' | 'Ebenen' | 'Karten' | 'Orte';
export interface Result { id: string; group: ResultGroup; icon: UiIconName; title: string; subtitle?: string; hint?: string; color?: string; run(): void }
