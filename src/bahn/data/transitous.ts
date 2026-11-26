import { fetchJson } from '@/data/http';
import { modeGroup, motisModes } from './modes';
import { dedupeStops, matchesQuery, rankStops } from './stops';
import type { Call, Departure, Journey, JourneyOptions, JourneyPage, Leg, Stop, Time, TransitProvider } from './types';

/** Transitous (MOTIS v5, ohne Schlüssel; Orte sind Haltestellen-IDs oder Koordinaten "lat,lng"): `/v1/geocode`, `/v1/reverse-geocode`, `/v5/plan`, `/v5/stoptimes`. */
const BASE = 'https://api.transitous.org/api';

// ---- Rohformat (nur die genutzten Felder) ------------------------------------

interface PlaceDto {
  name?: string;
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
  };
}

/** Abfahrt/Ankunft der Verbindung aus ihren Abschnitten (nach dem Einmischen neuer Zeiten neu berechnen). */
export function journeyOf(legs: Leg[], transfers: number, delaySource?: 'db'): Journey {
  return { departure: legs[0]!.from.time, arrival: legs[legs.length - 1]!.to.time, transfers, legs, delaySource };
}

export function parseJourneys(list: ItineraryDto[]): Journey[] {
  return list.filter((it) => it.legs.length > 0).map((it) => journeyOf(it.legs.map(parseLeg), it.transfers));
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
      return { journeys: parseJourneys(r.itineraries ?? []), earlier: r.previousPageCursor, later: r.nextPageCursor };
    },
  };
}
