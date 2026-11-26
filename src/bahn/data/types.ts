/** Domänenmodell der Bus-&-Bahn-App. Unabhängig von der Datenquelle; jeder Anbieter liefert diese Formen.
 *  Alle Zeiten sind Epoch-Millisekunden. */

/** Verkehrsmittel-Gruppen der Oberfläche (Filter, Farben, Symbole). */
export type ModeGroup = 'fern' | 'regio' | 'sbahn' | 'ubahn' | 'tram' | 'bus' | 'fernbus' | 'faehre' | 'fuss' | 'sonst';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Stadt oder Gebiet, in dem die Haltestelle liegt. */
  area?: string;
  /** Verkehrsmittel, die hier halten (nur aus der Suche bekannt). */
  modes?: ModeGroup[];
  /** Gewicht der Haltestelle (Transitous): Hauptbahnhöfe haben große Werte, Bushaltestellen kleine. */
  importance?: number;
}

/** Eine Zeit mit Fahrplan- und Echtzeitwert. Ohne Echtzeit ist `actual` = `planned` und `delayMin` null. */
export interface Time {
  planned: number;
  actual: number;
  /** Minuten nach Fahrplan, null ohne Echtzeitdaten. */
  delayMin: number | null;
  /** Gesetzt, wenn die Verspätung aus den DB-Fahrplandaten stammt (sonst von der Basisquelle). */
  delaySource?: 'db';
}

/** Halt eines Fahrzeugs: Name, Gleis und Zeit. */
export interface Call {
  name: string;
  lat?: number;
  lng?: number;
  platform?: string;
  platformChanged?: boolean;
  time: Time;
}

export interface Leg {
  mode: ModeGroup;
  /** Linienname, z. B. "ICE 1601" oder "S 5"; leer bei Fußwegen. */
  line: string;
  headsign: string;
  from: Call;
  to: Call;
  /** Halte zwischen Start und Ziel. */
  via: Call[];
  agency?: string;
  /** Rufbus o. Ä.: muss vorher gebucht werden. */
  bookingRequired?: boolean;
  /** Länge in Metern, nur bei Fußwegen. */
  walkM?: number;
  cancelled: boolean;
}

export interface Journey {
  departure: Time;
  arrival: Time;
  transfers: number;
  legs: Leg[];
  /** Gesetzt, wenn DB-Echtzeitdaten eingemischt wurden. */
  delaySource?: 'db';
}

export interface Departure {
  mode: ModeGroup;
  line: string;
  headsign: string;
  platform?: string;
  platformChanged?: boolean;
  time: Time;
  cancelled: boolean;
}

export interface JourneyOptions {
  /** Abfahrts- bzw. mit `arriveBy` Ankunftszeit. */
  time: number;
  arriveBy: boolean;
  /** Erlaubte Verkehrsmittel, leer = alle. */
  modes?: ModeGroup[];
  maxTransfers?: number;
  /** Zusätzliche Minuten pro Umstieg. */
  extraTransferMin?: number;
  /** Längster Fußweg zur ersten bzw. von der letzten Haltestelle in Minuten. */
  maxWalkMin?: number;
  /** Stufenfreie Route. */
  wheelchair?: boolean;
}

export interface JourneyPage {
  journeys: Journey[];
  /** Cursor für frühere bzw. spätere Verbindungen. */
  earlier?: string;
  later?: string;
}

export interface TransitProvider {
  searchStops(query: string, signal?: AbortSignal): Promise<Stop[]>;
  /** Haltestellen um eine Position, nächste zuerst. */
  nearbyStops(lat: number, lng: number, signal?: AbortSignal): Promise<Stop[]>;
  departures(stop: Stop, opts?: { n?: number; time?: number }, signal?: AbortSignal): Promise<Departure[]>;
  journeys(from: Stop, to: Stop, opts: JourneyOptions, cursor?: string, signal?: AbortSignal): Promise<JourneyPage>;
}

/** Mischt bessere Echtzeitdaten (DB) nachträglich ein. Liefert die Eingabe unverändert, wenn nichts passt. */
export interface DelayEnricher {
  journeys(list: Journey[], signal?: AbortSignal): Promise<Journey[]>;
  departures(stop: Stop, list: Departure[], signal?: AbortSignal): Promise<Departure[]>;
}
