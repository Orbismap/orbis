// USGS GeoJSON summary feed -> slim quake collection.
import type { QuakeCollection, QuakeFeature } from './quakes';

interface UsgsFeature {
  id?: string;
  geometry?: { type?: string; coordinates?: number[] };
  properties?: { mag?: number | null; place?: string | null; time?: number; url?: string; tsunami?: number; type?: string };
}

export function usgsQuakes(raw: unknown): QuakeCollection {
  const features: QuakeFeature[] = [];
  const list = (raw as { features?: UsgsFeature[] } | null)?.features;
  if (!Array.isArray(list)) return { type: 'FeatureCollection', features };
  for (const f of list) {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    if (!p || !c || c.length < 2 || p.mag == null || typeof p.time !== 'number' || !f.id) continue;
    if (p.type && p.type !== 'earthquake') continue;
    features.push({
      type: 'Feature',
      id: f.id,
      geometry: { type: 'Point', coordinates: [c[0]!, c[1]!] },
      properties: {
        id: f.id,
        mag: p.mag,
        depth: c[2] ?? 0,
        place: p.place ?? 'Unbekannte Region',
        time: p.time,
        url: p.url ?? `https://earthquake.usgs.gov/earthquakes/eventpage/${f.id}`,
        tsunami: p.tsunami === 1,
        src: 'usgs',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
