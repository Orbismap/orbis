import { decodePolyline } from '@/core/polyline';
import { fetchJson } from '@/data/http';
import { modeGroup, motisModes } from './modes';
import { clusterStops, dedupeStops, matchesQuery, rankStops } from './stops';
import type { Call, Departure, Journey, JourneyOptions, JourneyPage, Leg, Stop, Time, TransitProvider } from './types';

/** Transitous (MOTIS v5, ohne Schlüssel; Orte sind Haltestellen-IDs oder Koordinaten "lat,lng"): `/v1/geocode`, `/v1/reverse-geocode`, `/v5/plan`, `/v5/stoptimes`. */
const BASE = 'https://api.transitous.org/api';

// ---- Rohformat (nur die genutzten Felder) ------------------------------------

interface PlaceDto {
  name?: string;
  stopId?: string;
  lat?: number;
  lon?: number;
  departure?: string;
  scheduledDeparture?: string;
  arrival?: string;
  scheduledArrival?: string;
  track?: string;
  scheduledTrack?: string;
  cancelled?: boolean;
}

interface LegDto {
  mode: string;
  from: PlaceDto;
  to: PlaceDto;
  startTime: string;
  endTime: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  realTime?: boolean;
  headsign?: string;
  routeShortName?: string;
  displayName?: string;
  agencyName?: string;
  reservation?: string;
  cancelled?: boolean;
  distance?: number;
  intermediateStops?: PlaceDto[];
  tripId?: string;
  legGeometry?: { points: string; precision?: number };
}

export interface ItineraryDto {
  startTime: string;
  endTime: string;
  transfers: number;
  legs: LegDto[];
}

export interface StopTimeDto {
  place: PlaceDto;
  mode: string;
  realTime?: boolean;
  headsign?: string;
  routeShortName?: string;
  displayName?: string;
  cancelled?: boolean;
  tripId?: string;
}

/** Haltestelle im Kartenausschnitt (`/v1/map/stops`). */
export interface MapStopDto {
  name: string;
  stopId?: string;
  lat: number;
  lon: number;
  importance?: number;
  modes?: string[];
}

export interface GeocodeDto {
  type: string;
  id: string;
  name: string;
  lat: number;
  lon: number;
  importance?: number;
  modes?: string[];
  areas?: { name: string; default?: boolean; adminLevel?: number }[];
}

// ---- Parser (rein, ohne Netz) ----------------------------------------------------

const ms = (iso?: string): number => (iso ? Date.parse(iso) : NaN);

/** Zeit aus Echtzeit- und Fahrplanwert; ohne Echtzeit bleibt die Verspätung unbekannt (null). */
export function makeTime(actual?: string, planned?: string, realTime?: boolean): Time {
  const a = ms(actual);
  const p = ms(planned ?? actual);
  const delayMin = realTime && Number.isFinite(a) && Number.isFinite(p) ? Math.round((a - p) / 60000) : null;
  return { planned: p, actual: realTime && Number.isFinite(a) ? a : p, delayMin };
}

const changed = (p: PlaceDto): boolean => !!p.track && !!p.scheduledTrack && p.track !== p.scheduledTrack;
const lineName = (d: { displayName?: string; routeShortName?: string }): string => (d.displayName ?? d.routeShortName ?? '').trim();

export function parseStops(list: GeocodeDto[]): Stop[] {
  return list
    .filter((m) => m.type === 'STOP')
    .map((m) => {
      const areas = m.areas ?? [];
      const byLevel = areas.filter((a) => a.adminLevel != null).sort((a, b) => (b.adminLevel ?? 0) - (a.adminLevel ?? 0));
      const modes = [...new Set((m.modes ?? []).map(modeGroup))];
      return { id: m.id, name: m.name, lat: m.lat, lng: m.lon, area: (areas.find((a) => a.default) ?? byLevel[0])?.name, modes: modes.length ? modes : undefined, importance: m.importance };
    });
}

/** `depart` = Abfahrt an dieser Stelle (Start/Zwischenhalt), sonst Ankunft. */
function call(p: PlaceDto, leg: LegDto, kind: 'dep' | 'arr'): Call {
  const [actual, planned] = kind === 'dep' ? [p.departure, p.scheduledDeparture] : [p.arrival, p.scheduledArrival];
  return {
    name: p.name ?? '',
    stopId: p.stopId,
    lat: p.lat,
    lng: p.lon,
    platform: p.track ?? p.scheduledTrack,
    platformChanged: changed(p) || undefined,
    time: makeTime(actual ?? (kind === 'dep' ? leg.startTime : leg.endTime), planned ?? (kind === 'dep' ? leg.scheduledStartTime : leg.scheduledEndTime), leg.realTime),
  };
}

export function parseLeg(l: LegDto): Leg {
  const mode = modeGroup(l.mode);
  const foot = mode === 'fuss';
  const from = call(l.from, l, 'dep');
  const to = call(l.to, l, 'arr');
  // Start- und Endzeit des Abschnitts gelten, auch wenn der Ort sie nicht einzeln nennt.
  from.time = makeTime(l.startTime, l.scheduledStartTime ?? l.from.scheduledDeparture, l.realTime);
  to.time = makeTime(l.endTime, l.scheduledEndTime ?? l.to.scheduledArrival, l.realTime);
  return {
    mode,
    line: foot ? '' : lineName(l),
    headsign: (l.headsign ?? '').trim(),
    from,
    to,
    via: (l.intermediateStops ?? []).filter((s) => s.name).map((s) => call(s, l, 'arr')),
    agency: l.agencyName,
    bookingRequired: l.reservation === 'COMPULSORY' || undefined,
    walkM: foot && l.distance != null ? Math.round(l.distance) : undefined,
    cancelled: !!l.cancelled,
    tripId: l.tripId,
    path: l.legGeometry ? pathOf(l.legGeometry.points, l.legGeometry.precision) : undefined,
  };
}

function pathOf(points: string, precision = 6): [number, number][] | undefined {
  const xy = decodePolyline(points, precision);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xy.length; i += 2) out.push([xy[i]!, xy[i + 1]!]);
  return out.length > 1 ? out : undefined;
}

/** Der Lauf einer Fahrt als ein Abschnitt; durchgebundene Teilstücke werden aneinandergehängt. */
export function parseTrip(it: { legs?: LegDto[] }): Leg | undefined {
  const [first, ...rest] = (it.legs ?? []).map(parseLeg).filter((l) => l.mode !== 'fuss');
  if (!first) return undefined;
  return rest.reduce((a, b) => ({
    ...a, to: b.to, via: [...a.via, a.to, ...b.via], path: a.path && b.path ? [...a.path, ...b.path] : undefined, cancelled: a.cancelled || b.cancelled,
  }), first);
}

export function parseMapStops(list: MapStopDto[]): Stop[] {
  return clusterStops(list.filter((s) => s.stopId).map((s) => {
    const modes = [...new Set((s.modes ?? []).map(modeGroup))];
    return { id: s.stopId!, name: s.name, lat: s.lat, lng: s.lon, modes: modes.length ? modes : undefined, importance: s.importance };
  }));
}

/** Abfahrt/Ankunft der Verbindung aus ihren Abschnitten (nach dem Einmischen neuer Zeiten neu berechnen). */
export function journeyOf(legs: Leg[], transfers: number, delaySource?: 'db'): Journey {
  return { departure: legs[0]!.from.time, arrival: legs[legs.length - 1]!.to.time, transfers, legs, delaySource };
}

export function parseJourneys(list: ItineraryDto[]): Journey[] {
  return list.filter((it) => it.legs.length > 0).map((it) => journeyOf(it.legs.map(parseLeg), it.transfers));
}

/** Startet oder endet die Suche an Koordinaten, heißen die Orte in der Antwort "START" und "END". */
export function named(j: Journey, from: string, to: string): Journey {
  const rename = (c: Call): Call => (c.name === 'START' ? { ...c, name: from } : c.name === 'END' ? { ...c, name: to } : c);
  return journeyOf(j.legs.map((l) => ({ ...l, from: rename(l.from), to: rename(l.to) })), j.transfers, j.delaySource);
}

export function parseDepartures(list: StopTimeDto[]): Departure[] {
  return list
    .map((s): Departure => ({
      mode: modeGroup(s.mode),
      line: lineName(s),
      headsign: (s.headsign ?? '').trim(),
      platform: s.place.track ?? s.place.scheduledTrack,
      platformChanged: changed(s.place) || undefined,
      time: makeTime(s.place.departure ?? s.place.arrival, s.place.scheduledDeparture ?? s.place.scheduledArrival, s.realTime),
      cancelled: !!s.cancelled || !!s.place.cancelled,
      tripId: s.tripId,
    }))
    .filter((d) => Number.isFinite(d.time.planned));
}

// ---- Anbieter ----------------------------------------------------------------------

export function createTransitous(base = BASE): TransitProvider {
  const get = async <T>(path: string, q: URLSearchParams, timeout: number, signal?: AbortSignal): Promise<T> =>
    (await fetchJson<T>(`${base}${path}?${q}`, { timeout, signal })).data;

  return {
    searchStops: async (text, signal) => {
      const find = async (q: string) => parseStops(await get<GeocodeDto[]>('/v1/geocode', new URLSearchParams({ text: q, type: 'STOP', language: 'de' }), 12000, signal));
      // Bei einem Ortsnamen steht der Hauptbahnhof oft nicht unter den ersten Treffern: zusätzlich "<Ort> Hbf" fragen.
      const wantsStation = !/\b(hbf|bf|bahnhof|hauptbahnhof)\b/i.test(text) && text.trim().split(/\s+/).length <= 2;
      const [base, extra] = await Promise.all([find(text), wantsStation ? find(`${text.trim()} Hbf`).catch(() => []) : Promise.resolve([])]);
      const known = new Set(base.map((s) => s.id));
      return rankStops([...base, ...extra.filter((s) => !known.has(s.id) && matchesQuery(s.name, text))], text);
    },

    nearbyStops: async (lat, lng, signal) =>
      dedupeStops(parseStops(await get<GeocodeDto[]>('/v1/reverse-geocode', new URLSearchParams({ place: `${lat.toFixed(5)},${lng.toFixed(5)}`, type: 'STOP', language: 'de' }), 12000, signal))),

    trip: async (tripId, signal) => {
      const leg = parseTrip(await get<{ legs?: LegDto[] }>('/v5/trip', new URLSearchParams({ tripId, language: 'de' }), 20000, signal));
      if (!leg) throw new Error('Zu dieser Fahrt gibt es keinen Linienlauf.');
      return leg;
    },

    stopsIn: async ([west, south, east, north], signal) => {
      const q = new URLSearchParams({ min: `${south.toFixed(5)},${west.toFixed(5)}`, max: `${north.toFixed(5)},${east.toFixed(5)}`, language: 'de' });
      return parseMapStops(await get<MapStopDto[]>('/v1/map/stops', q, 15000, signal));
    },

    departures: async (stop, opts = {}, signal) => {
      const q = new URLSearchParams({ stopId: stop.id, n: String(opts.n ?? 25), time: new Date(opts.time ?? Date.now()).toISOString(), language: 'de' });
      const r = await get<{ stopTimes?: StopTimeDto[] }>('/v5/stoptimes', q, 20000, signal);
      return parseDepartures(r.stopTimes ?? []);
    },

    journeys: async (from, to, o: JourneyOptions, cursor, signal): Promise<JourneyPage> => {
      const q = new URLSearchParams({
        fromPlace: from.id,
        toPlace: to.id,
        time: new Date(o.time).toISOString(),
        arriveBy: String(o.arriveBy),
        numItineraries: '6',
        language: 'de',
      });
      if (o.maxTransfers != null) q.set('maxTransfers', String(o.maxTransfers));
      if (o.modes?.length) q.set('transitModes', motisModes(o.modes).join(','));
      if (o.extraTransferMin) q.set('additionalTransferTime', String(o.extraTransferMin));
      if (o.maxWalkMin != null) {
        q.set('maxPreTransitTime', String(o.maxWalkMin * 60));
        q.set('maxPostTransitTime', String(o.maxWalkMin * 60));
      }
      if (o.wheelchair) q.set('pedestrianProfile', 'WHEELCHAIR');
      if (cursor) q.set('pageCursor', cursor);
      const r = await get<{ itineraries?: ItineraryDto[]; previousPageCursor?: string; nextPageCursor?: string }>('/v5/plan', q, 30000, signal);
      return { journeys: parseJourneys(r.itineraries ?? []).map((j) => named(j, from.name, to.name)), earlier: r.previousPageCursor, later: r.nextPageCursor };
    },
  };
}
