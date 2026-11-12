// Keyed live camera feeds (user's own API key, fetched from the browser): the 511 portals on the IBI platform, OHGO,
// QLDTraffic, Trafikverket, NPS and Windy Webcams -> the slim points of `webcamFeed` (WebcamProps).
import type { Feature, Point } from 'geojson';
import type { WebcamCollection, WebcamProps } from './webcams';

const https = (u: unknown): string => (typeof u === 'string' && /^https:\/\//.test(u) ? u : '');
const okPos = (lon: unknown, lat: unknown) => Number.isFinite(Number(lon)) && Number.isFinite(Number(lat)) && Math.abs(Number(lat)) <= 90 && !(Number(lon) === 0 && Number(lat) === 0);

/** "Northbound", "EB", "N/B" ... -> heading, undefined when ambiguous (port of the old Orbis). */
export function directionToHeading(value: string | undefined): number | undefined {
  const text = String(value ?? '').trim().toUpperCase().replace(/\b([NSEW])\s*\/\s*B\b/g, '$1B')
    .replace(/\b(NORTH|SOUTH)[\s/-]?(EAST|WEST)\b/g, (_, a: string, b: string) => `${a[0]}${b[0]}`).replace(/(\b[NS])[-/]([EW]\b)/g, '$1$2');
  if (!text) return undefined;
  const tiers: [RegExp, number][][] = [
    [[/\bNORTHBOUND\b|\bNB\b/, 0], [/\bSOUTHBOUND\b|\bSB\b/, 180], [/\bEASTBOUND\b|\bEB\b/, 90], [/\bWESTBOUND\b|\bWB\b/, 270]],
    [[/\bNORTHEAST\b|\bNE\b/, 45], [/\bNORTHWEST\b|\bNW\b/, 315], [/\bSOUTHEAST\b|\bSE\b/, 135], [/\bSOUTHWEST\b|\bSW\b/, 225]],
    [[/\bNORTH\b|^N$/, 0], [/\bSOUTH\b|^S$/, 180], [/\bEAST\b|^E$/, 90], [/\bWEST\b|^W$/, 270]],
  ];
  for (const forms of tiers) {
    const hits = new Set(forms.filter(([re]) => re.test(text)).map(([, h]) => h));
    if (hits.size) return hits.size === 1 ? [...hits][0] : undefined;
  }
  return undefined;
}

const feature = (lon: number, lat: number, p: Partial<WebcamProps> & { id: string }): Feature<Point, WebcamProps> => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { title: 'Kamera', subtitle: '', image: '', hls: '', video: '', url: p.image ?? '', source: '', dir: -1, kind: 'road', ...p } as WebcamProps,
});
const fc = (features: Feature<Point, WebcamProps>[]): WebcamCollection => ({ type: 'FeatureCollection', features });

interface IbiCam { Id: string | number; Roadway?: string; Location?: string; Direction?: string; Latitude: number; Longitude: number; Views?: { Url: string; Status?: string }[] }
/** `/api/v2/get/cameras?format=json` of a 511 portal on the IBI platform. */
export function ibiCameras(raw: unknown, args: { id: string; name: string; source: string }): WebcamCollection {
  const out: Feature<Point, WebcamProps>[] = [];
  if (Array.isArray(raw)) for (const c of raw as IbiCam[]) {
    if (!okPos(c.Longitude, c.Latitude)) continue;
    const view = c.Views?.find((v) => v.Status !== 'Disabled') ?? c.Views?.[0];
    const image = https(view?.Url);
    if (!image) continue;
    out.push(feature(c.Longitude, c.Latitude, { id: `${args.id}-${c.Id}`, title: c.Location || c.Roadway || 'Kamera', subtitle: [`Verkehrskamera ${args.name}`, c.Roadway].filter(Boolean).join(' · '), image, url: image, source: args.source, dir: directionToHeading(c.Direction) ?? -1 }));
  }
  return fc(out);
}

type OhView = { direction?: string; smallUrl?: string; largeUrl?: string; SmallUrl?: string; LargeUrl?: string; Direction?: string };
type OhCam = { id?: string; Id?: string; latitude?: number; Latitude?: number; longitude?: number; Longitude?: number; location?: string; Location?: string; description?: string; Description?: string; cameraViews?: OhView[]; CameraViews?: OhView[] };
export function ohgoCameras(raw: unknown): WebcamCollection {
  const j = raw as { results?: OhCam[]; Results?: OhCam[] } | null;
  const out: Feature<Point, WebcamProps>[] = [];
  (j?.results ?? j?.Results ?? []).forEach((c, i) => {
    const lat = c.latitude ?? c.Latitude, lon = c.longitude ?? c.Longitude;
    const views = c.cameraViews ?? c.CameraViews ?? [];
    const v = views.find((x) => x.direction ?? x.Direction) ?? views[0];
    const image = https(v?.largeUrl ?? v?.LargeUrl ?? v?.smallUrl ?? v?.SmallUrl);
    if (!image || !okPos(lon, lat)) return;
    out.push(feature(Number(lon), Number(lat), { id: `ohgo-${c.id ?? c.Id ?? i}`, title: c.location ?? c.Location ?? c.description ?? c.Description ?? 'Kamera', subtitle: 'Verkehrskamera Ohio', image, url: image, source: 'Ohio DOT (OHGO)', dir: directionToHeading(v?.direction ?? v?.Direction) ?? -1 }));
  });
  return fc(out);
}

/** QLDTraffic GeoJSON: property names are not documented in detail, so image and link are found by their shape. */
export function qldCameras(raw: unknown): WebcamCollection {
  const out: Feature<Point, WebcamProps>[] = [];
  ((raw as { features?: { geometry?: { type: string; coordinates: number[] } | null; properties?: Record<string, unknown> | null }[] } | null)?.features ?? []).forEach((f, i) => {
    if (f.geometry?.type !== 'Point') return;
    const p = f.properties ?? {};
    const values = Object.values(p).filter((v): v is string => typeof v === 'string');
    const image = https(values.find((v) => /^https:\/\/.+\.(jpe?g|png|gif)(\?.*)?$/i.test(v)));
    const url = values.find((v) => /^https?:\/\//.test(v) && v !== image);
    const nameKey = Object.keys(p).find((k) => /name|desc|location|title/i.test(k) && typeof p[k] === 'string');
    const [lon, lat] = f.geometry.coordinates;
    if (!okPos(lon, lat) || (!image && !url)) return;
    out.push(feature(lon!, lat!, { id: `qld-${i}`, title: nameKey ? String(p[nameKey]) : 'Kamera', image, url: url ?? image, source: 'Queensland Department of Transport and Main Roads (QLDTraffic)' }));
  });
  return fc(out);
}

/** Trafikverket Open API answer (POST with an XML query) -> cameras with photo. */
export function trafikverketCameras(raw: unknown): WebcamCollection {
  const res = (raw as { RESPONSE?: { RESULT?: { Camera?: { Id: string; Name?: string; Direction?: number | string; Geometry?: { WGS84?: string }; PhotoUrl?: string; Location?: string; Type?: string }[]; error?: { MESSAGE?: string } }[] } } | null)?.RESPONSE?.RESULT?.[0];
  if (res?.error) throw new Error(`Trafikverket: ${res.error.MESSAGE ?? 'Fehler'}`);
  const out: Feature<Point, WebcamProps>[] = [];
  for (const c of res?.Camera ?? []) {
    const m = c.Geometry?.WGS84?.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)/);
    const image = https(c.PhotoUrl);
    if (!m || !image || !okPos(m[1], m[2])) continue;
    const dir = c.Direction != null && c.Direction !== '' ? Number(c.Direction) : -1;
    out.push(feature(Number(m[1]), Number(m[2]), { id: `tv-${c.Id}`, title: c.Name || c.Location || 'Kamera', subtitle: ['Straßenkamera Schweden', c.Type].filter(Boolean).join(' · '), image, url: image, source: 'Trafikverket (CC0)', dir: dir >= 0 && dir <= 360 ? dir : -1 }));
  }
  return fc(out);
}

export function npsCameras(raw: unknown): WebcamCollection {
  const out: Feature<Point, WebcamProps>[] = [];
  for (const w of (raw as { data?: { id: string; title: string; url?: string; latitude?: number | string; longitude?: number | string; images?: { url: string }[]; isStreaming?: boolean; status?: string; relatedParks?: { fullName?: string }[] }[] } | null)?.data ?? []) {
    if (w.status === 'Inactive' || !okPos(w.longitude, w.latitude)) continue;
    out.push(feature(Number(w.longitude), Number(w.latitude), { id: `nps-${w.id}`, title: w.title, subtitle: [w.relatedParks?.[0]?.fullName, w.isStreaming ? 'Livestream' : ''].filter(Boolean).join(' · '), image: https(w.images?.[0]?.url), url: /^https?:\/\//.test(w.url ?? '') ? w.url! : '', source: 'US National Park Service', kind: 'signed' }));
  }
  return fc(out);
}

interface WindyCam { webcamId: number; title: string; location?: { latitude: number; longitude: number; city?: string; country?: string }; images?: { current?: { preview?: string; thumbnail?: string } }; urls?: { detail?: string } }
/** Windy Webcams API v3. Image URLs expire after about ten minutes, so the feed is reloaded instead of cached. */
export function windyCameras(raw: unknown): WebcamCollection {
  const out: Feature<Point, WebcamProps>[] = [];
  for (const w of (raw as { webcams?: WindyCam[] } | null)?.webcams ?? []) {
    if (!w?.location || !okPos(w.location.longitude, w.location.latitude)) continue;
    out.push(feature(w.location.longitude, w.location.latitude, { id: `windy-${w.webcamId}`, title: w.title, subtitle: [w.location.city, w.location.country].filter(Boolean).join(', '), image: https(w.images?.current?.preview ?? w.images?.current?.thumbnail), url: w.urls?.detail ?? `https://www.windy.com/webcams/${w.webcamId}`, source: 'Windy.com Webcams', kind: 'windy' }));
  }
  return fc(out);
}

/** Corrections of the camera directory worker (`GET /dirs`): key `<feed id>@<lat 5>,<lon 5>` -> heading. */
export const camdirKey = (id: string, lon: number, lat: number): string => `${id}@${lat.toFixed(5)},${lon.toFixed(5)}`;
export function camdirMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries((raw as { dirs?: Record<string, { d?: number }> } | null)?.dirs ?? {})) if (typeof v?.d === 'number' && Number.isFinite(v.d)) out[k] = Math.round((((v.d % 360) + 360) % 360) * 10) / 10;
  return out;
}
/** Applies the corrections; `dirset` marks a corrected (not estimated) heading. */
export function applyCamdir(c: WebcamCollection, dirs: Record<string, number> | undefined): WebcamCollection {
  if (!dirs) return c;
  let changed = false;
  const features = c.features.map((f) => {
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const d = dirs[camdirKey(f.properties.id, lon, lat)];
    if (d === undefined) return f;
    changed = true;
    return { ...f, properties: { ...f.properties, dir: d, dirset: true } };
  });
  return changed ? { type: 'FeatureCollection', features } : c;
}
