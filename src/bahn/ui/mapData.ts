// Von Verbindungen und Linienläufen zu dem, was die Karte zeichnet.
import type { Call, Journey, Leg, Stop } from '../data/types';
import type { MapRoute, MapStop } from './scene';

/** Farbe eines Verkehrsmittels als echter Farbwert (MapLibre kennt keine CSS-Variablen). */
export type ModeColor = (mode: string) => string;

export const modeVar = (mode: string): string => `--m-${mode === 'sonst' ? 'fuss' : mode}`;

export const stopOfCall = (c: Call): Stop | null =>
  c.lat != null && c.lng != null ? { id: c.stopId ?? `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`, name: c.name, lat: c.lat, lng: c.lng } : null;

const calls = (l: Leg): Call[] => [l.from, ...l.via, l.to];

/** Verlauf eines Abschnitts: der echte Weg, sonst gerade von Halt zu Halt. */
export const legPoints = (l: Leg): [number, number][] =>
  l.path ?? calls(l).flatMap((c): [number, number][] => (c.lat != null && c.lng != null ? [[c.lng, c.lat]] : []));

export const legId = (i: number) => `leg-${i}`;
export const legIndex = (id: string) => Number(id.replace('leg-', ''));

const route = (l: Leg, i: number, color: ModeColor, dim: boolean): MapRoute =>
  ({ id: legId(i), coords: legPoints(l), color: color(l.mode), dashed: l.mode === 'fuss', ...(dim ? { dim } : {}) });

const mapStop = (c: Call, kind: MapStop['kind'], color?: string): MapStop[] => {
  const stop = stopOfCall(c);
  return stop ? [{ stop, kind, ...(color ? { color } : {}) }] : [];
};

/** Strecke einer Verbindung; `focus` hebt einen Abschnitt hervor und passt die Karte auf ihn ein. */
export function journeyMap(j: Journey, color: ModeColor, focus: number | null = null) {
  const routes = j.legs.map((l, i) => route(l, i, color, focus !== null && focus !== i));
  const last = j.legs.length - 1;
  const stops: MapStop[] = [
    // Zwischenhalte zuerst: Anfang, Ziel und Umstiege liegen darüber
    ...j.legs.flatMap((l, i) => (l.mode === 'fuss' || (focus !== null && focus !== i) ? [] : l.via.flatMap((c) => mapStop(c, 'via', color(l.mode))))),
    ...j.legs.flatMap((l, i) => (l.mode === 'fuss' ? [] : [
      ...(i === 0 ? [] : mapStop(l.from, 'transfer', color(l.mode))),
      ...(i === last ? [] : mapStop(l.to, 'transfer', color(l.mode))),
    ])),
    ...mapStop(j.legs[0]!.from, 'start'),
    ...mapStop(j.legs[last]!.to, 'end'),
  ];
  const shown = focus !== null && j.legs[focus] ? [j.legs[focus]!] : j.legs;
  return { routes, stops, fit: shown.flatMap(legPoints) };
}

/** Linienlauf einer Fahrt mit allen Halten; die Haltestelle `at` ist hervorgehoben. */
export function tripMap(leg: Leg, color: ModeColor, at?: string) {
  const c = color(leg.mode);
  const all = calls(leg);
  const stops = all.flatMap((call, i) => {
    const kind: MapStop['kind'] = at && call.stopId === at ? 'selected' : i === 0 ? 'start' : i === all.length - 1 ? 'end' : 'via';
    return mapStop(call, kind, c);
  });
  return { routes: [route(leg, 0, color, false)], stops, fit: legPoints(leg) };
}
