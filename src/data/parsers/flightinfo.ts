// Route (adsbdb), aircraft record (adsbdb) and photo (planespotters.net) of a selected aircraft: pure parsers plus the
// great-circle line origin -> aircraft -> destination. adsbdb is community data, no flight plan.
import { DEG, RAD } from '../../core/geo';

export type RouteAirport = { icao: string; iata: string; name: string; city: string; country: string; lng: number; lat: number };
export type FlightRoute = { callsign: string; airline: string; origin: RouteAirport; destination: RouteAirport };

const airport = (a: Record<string, unknown> | undefined): RouteAirport | undefined => {
  if (!a || typeof a.latitude !== 'number' || typeof a.longitude !== 'number') return undefined;
  return {
    icao: String(a.icao_code ?? ''), iata: String(a.iata_code ?? ''), name: String(a.name ?? ''), city: String(a.municipality ?? ''),
    country: String(a.country_name ?? ''), lng: a.longitude, lat: a.latitude,
  };
};

/** `/v0/callsign/<cs>` response; unknown callsigns answer with a string instead of an object. */
export function parseRoute(raw: unknown): FlightRoute | null {
  const fr = (raw as { response?: { flightroute?: Record<string, unknown> } } | null)?.response?.flightroute;
  if (!fr || typeof fr !== 'object') return null;
  const origin = airport(fr.origin as Record<string, unknown> | undefined);
  const destination = airport(fr.destination as Record<string, unknown> | undefined);
  if (!origin || !destination) return null;
  return { callsign: String(fr.callsign ?? ''), airline: String((fr.airline as { name?: string } | null)?.name ?? ''), origin, destination };
}

export type AircraftRecord = { type: string; icaoType: string; manufacturer: string; registration: string; owner: string; country: string };

/** `/v0/aircraft/<hex>` response. */
export function parseAircraftRecord(raw: unknown): AircraftRecord | null {
  const a = (raw as { response?: { aircraft?: Record<string, unknown> } } | null)?.response?.aircraft;
  if (!a || typeof a !== 'object') return null;
  return {
    type: String(a.type ?? ''), icaoType: String(a.icao_type ?? ''), manufacturer: String(a.manufacturer ?? ''),
    registration: String(a.registration ?? ''), owner: String(a.registered_owner ?? ''), country: String(a.registered_owner_country_name ?? ''),
  };
}

export type AircraftPhoto = { src: string; link: string; photographer: string };

/** planespotters.net `/pub/photos/hex|reg/<x>`; the terms ask for the photographer's name and a link to the photo page. */
export function parsePhoto(raw: unknown): AircraftPhoto | null {
  const p = (raw as { photos?: { thumbnail?: { src?: string }; thumbnail_large?: { src?: string }; link?: string; photographer?: string }[] } | null)?.photos?.[0];
  const src = p?.thumbnail_large?.src ?? p?.thumbnail?.src;
  if (!p || !src || !/^https:\/\//.test(src)) return null;
  return { src, link: p.link && /^https:\/\//.test(p.link) ? p.link : 'https://www.planespotters.net/', photographer: p.photographer || 'Planespotters.net' };
}

/** Points along the great circle a -> b (lng/lat degrees), `n` segments; longitudes are unwrapped so the line is continuous. */
export function greatCircle(a: [number, number], b: [number, number], n = 48): [number, number][] {
  const [l1, p1] = [a[0] * RAD, a[1] * RAD];
  const [l2, p2] = [b[0] * RAD, b[1] * RAD];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (!(d > 1e-9)) return [a, b];
  const out: [number, number][] = [];
  let prev = a[0];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    let lng = Math.atan2(y, x) * DEG;
    while (lng - prev > 180) lng -= 360;
    while (lng - prev < -180) lng += 360;
    prev = lng;
    out.push([lng, Math.atan2(z, Math.hypot(x, y)) * DEG]);
  }
  return out;
}

/** Dashed route: origin -> aircraft (flown part, `part: 'flown'`) and aircraft -> destination (`'ahead'`). */
export function routeFeatures(route: Pick<FlightRoute, 'origin' | 'destination'>, pos: [number, number]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const o: [number, number] = [route.origin.lng, route.origin.lat];
  const d: [number, number] = [route.destination.lng, route.destination.lat];
  const flown = greatCircle(o, pos, 40);
  // the destination leg continues on the same side of the antimeridian as the aircraft
  const last = flown[flown.length - 1]![0];
  const ahead = greatCircle(pos, [d[0] + Math.round((last - d[0]) / 360) * 360, d[1]], 40);
  const f = (part: string, coordinates: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> => ({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: { id: part, part } });
  return { type: 'FeatureCollection', features: [f('flown', flown), f('ahead', ahead)] };
}
