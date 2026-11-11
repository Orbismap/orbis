// EMSC (SeismicPortal) FDSN GeoJSON, as mirrored in events/emsc-europe.json -> slim quake collection.
import type { QuakeCollection, QuakeFeature } from './quakes';

interface EmscFeature {
  id?: string;
  geometry?: { coordinates?: number[] };
  properties?: { unid?: string; mag?: number | null; depth?: number; time?: string; flynn_region?: string; lat?: number; lon?: number; evtype?: string };
}

/** "DODECANESE IS.-TURKEY BORDER REG" -> "Dodecanese Is.-Turkey Border Reg" (region names arrive in capitals). */
export function titleCaseRegion(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-.(/])([a-zà-ÿ])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

export function emscQuakes(raw: unknown): QuakeCollection {
  const features: QuakeFeature[] = [];
  const list = (raw as { features?: EmscFeature[] } | null)?.features;
  if (!Array.isArray(list)) return { type: 'FeatureCollection', features };
  for (const f of list) {
    const p = f.properties;
    if (!p || p.mag == null) continue;
    const c = f.geometry?.coordinates;
    const lng = c?.[0] ?? p.lon;
    const lat = c?.[1] ?? p.lat;
    const time = p.time ? Date.parse(p.time) : NaN;
    const id = p.unid ?? f.id;
    if (lng === undefined || lat === undefined || Number.isNaN(time) || !id) continue;
    features.push({
      type: 'Feature',
      id: `emsc:${id}`,
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        id: `emsc:${id}`,
        mag: p.mag,
        depth: Math.abs(p.depth ?? c?.[2] ?? 0),
        place: p.flynn_region ? titleCaseRegion(p.flynn_region) : 'Unbekannte Region',
        time,
        url: `https://www.seismicportal.eu/eventdetails.html?unid=${encodeURIComponent(id)}`,
        tsunami: false,
        src: 'emsc',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
