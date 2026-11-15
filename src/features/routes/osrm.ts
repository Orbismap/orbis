// Routing client (OSRM on routing.openstreetmap.de: car, bike and foot) and the German turn instructions.
import { formatNumber, NNBSP } from '../../core/format';

export type RouteMode = 'car' | 'bike' | 'foot';
export const MODES: { id: RouteMode; label: string }[] = [
  { id: 'car', label: 'Auto' },
  { id: 'bike', label: 'Rad' },
  { id: 'foot', label: 'Zu Fuß' },
];

export interface RouteStep { text: string; distance: number; duration: number; lng: number; lat: number; leg: number }
export interface RouteResult { distance: number; duration: number; coords: [number, number][]; steps: RouteStep[] }

const SIDE: Record<string, string> = {
  left: 'links',
  right: 'rechts',
  'slight left': 'leicht links',
  'slight right': 'leicht rechts',
  'sharp left': 'scharf links',
  'sharp right': 'scharf rechts',
  straight: 'geradeaus',
};

interface OsrmStep { distance: number; duration: number; name?: string; ref?: string; maneuver: { type: string; modifier?: string; location: [number, number]; exit?: number } }

/** "Abbiegen links auf Hauptstraße": the instruction line of one OSRM step. */
export function instruction(s: OsrmStep, last: boolean, leg: number, legs: number): string {
  const { type, modifier, exit } = s.maneuver;
  const name = s.name || s.ref;
  const on = name ? ` auf ${name}` : '';
  const side = modifier ? SIDE[modifier] : undefined;
  switch (type) {
    case 'depart':
      return `Starten${on}`;
    case 'arrive':
      return leg < legs - 1 ? 'Zwischenziel erreicht' : last ? `Ziel erreicht${side && side !== 'geradeaus' ? `, ${side}` : ''}` : 'Ziel erreicht';
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return exit ? `Im Kreisverkehr die ${exit}. Ausfahrt nehmen${on}` : `In den Kreisverkehr einfahren${on}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Kreisverkehr verlassen${on}`;
    case 'merge':
      return `Einfädeln${side ? ` ${side}` : ''}${on}`;
    case 'on ramp':
      return `Auffahrt nehmen${side ? ` ${side}` : ''}${on}`;
    case 'off ramp':
      return `Ausfahrt nehmen${side ? ` ${side}` : ''}${on}`;
    case 'fork':
      return `An der Gabelung ${side ?? 'geradeaus'} halten${on}`;
    case 'continue':
    case 'new name':
      return side && side !== 'geradeaus' ? `Weiter ${side}${on}` : `Weiter geradeaus${on}`;
    default:
      if (modifier === 'uturn') return `Wenden${on}`;
      if (!side || side === 'geradeaus') return `Geradeaus weiter${on}`;
      return `Abbiegen ${side}${on}`;
  }
}

interface OsrmJson { code?: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: { steps: OsrmStep[] }[] }[] }

type OsrmRoute = NonNullable<OsrmJson['routes']>[number];

function toResult(r: OsrmRoute): RouteResult {
  const steps: RouteStep[] = r.legs.flatMap((leg, li) =>
    leg.steps.map((s, si) => ({
      text: instruction(s, si === leg.steps.length - 1, li, r.legs.length),
      distance: s.distance,
      duration: s.duration,
      lng: s.maneuver.location[0],
      lat: s.maneuver.location[1],
      leg: li,
    })),
  );
  return { distance: r.distance, duration: r.duration, coords: r.geometry.coordinates, steps };
}

/** The route and its alternatives (up to three, fastest first). Throws when the response holds none. */
export function parseRoutes(j: OsrmJson): RouteResult[] {
  const rs = j.code === 'Ok' ? j.routes?.slice(0, 3) : undefined;
  if (!rs?.length) throw new Error(j.code === 'NoRoute' ? 'Keine Route gefunden' : 'Routenberechnung fehlgeschlagen');
  return rs.map(toResult);
}

export async function fetchRoutes(mode: RouteMode, pts: readonly { lng: number; lat: number }[], signal: AbortSignal): Promise<RouteResult[]> {
  const path = pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  // the bike and foot servers answer on the "driving" path too; the profile is chosen by the server.
  // Alternatives only exist for two waypoints.
  const alt = pts.length === 2 ? 'true' : 'false';
  const res = await fetch(`https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${path}?overview=full&geometries=geojson&steps=true&alternatives=${alt === 'true' ? 3 : 'false'}`, { signal });
  if (!res.ok && res.status !== 400 && res.status !== 404) throw new Error('Routenserver nicht erreichbar');
  return parseRoutes((await res.json()) as OsrmJson);
}

export function formatDistance(m: number): string {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)}${NNBSP}m`;
  return `${formatNumber(m / 1000, m < 10_000 ? 1 : 0)}${NNBSP}km`;
}

export function formatDuration(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min}${NNBSP}Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}${NNBSP}Std. ${m}${NNBSP}Min.` : `${h}${NNBSP}Std.`;
}
