import type { Call, Journey, Leg } from '../data/types';
import type { MapMarker, MapRoute } from './NetMap';

const VAR: Record<string, string> = { fern: 'fern', regio: 'regio', sbahn: 'sbahn', ubahn: 'ubahn', tram: 'tram', bus: 'bus', fernbus: 'fernbus', faehre: 'faehre', fuss: 'fuss', sonst: 'fuss' };
/** CSS-Farbe (Variable) eines Verkehrsmittels für Streifen und Zeitleiste. */
export const modeColor = (mode: string): string => `var(--m-${VAR[mode] ?? 'fuss'})`;

/** Wie `modeColor`, aber als echter Farbwert, weil MapLibre keine CSS-Variablen kennt. */
function resolved(mode: string): string {
  const name = `--m-${VAR[mode] ?? 'fuss'}`;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#8a93a8';
}

const lonlat = (c: Call): [number, number] | null => (c.lat != null && c.lng != null ? [c.lng, c.lat] : null);
const path = (l: Leg): [number, number][] => [l.from, ...l.via, l.to].flatMap((c) => { const p = lonlat(c); return p ? [p] : []; });

/** Die Strecke einer Verbindung als Linien auf der Karte (Fußwege gestrichelt). */
export const journeyRoutes = (j: Journey): MapRoute[] =>
  j.legs.map((l) => ({ coords: path(l), color: resolved(l.mode), dashed: l.mode === 'fuss' }));

/** Start- und Zielmarker einer Verbindung. */
export function journeyEnds(j: Journey): MapMarker[] {
  const first = j.legs[0]!.from;
  const last = j.legs[j.legs.length - 1]!.to;
  return [first, last].flatMap((c, i) => { const p = lonlat(c); return p ? [{ id: String(i), lng: p[0], lat: p[1], kind: i === 0 ? 'start' : 'end' } as MapMarker] : []; });
}
