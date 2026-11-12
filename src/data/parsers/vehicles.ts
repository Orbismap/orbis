// Shared vehicle model of the train and local transport layers: every feed (Transitous, Digitraffic, Amtraker,
// Entur, MBTA, SEPTA, GTFS-RT …) is normalised to a `VehicleFix`; type -> colour/label lives here once.
import type { TrackObject } from '../../render/tracks';
import type { BBox } from '../../core/geo';

export type VehicleKind = 'fern' | 'regio' | 'sbahn' | 'ubahn' | 'tram' | 'bus' | 'faehre' | 'andere';

export const KINDS: Record<VehicleKind, { label: string; color: string; rail: boolean; size: number }> = {
  fern: { label: 'Fernzug', color: '#ff5d4a', rail: true, size: 1 },
  regio: { label: 'Regionalzug', color: '#8fe05a', rail: true, size: 0.9 },
  sbahn: { label: 'S-Bahn', color: '#19b7a0', rail: true, size: 0.85 },
  ubahn: { label: 'U-Bahn', color: '#4a90ff', rail: false, size: 0.8 },
  tram: { label: 'Tram', color: '#ff55a8', rail: false, size: 0.75 },
  bus: { label: 'Bus', color: '#b57bff', rail: false, size: 0.7 },
  faehre: { label: 'Fähre', color: '#3fc4f5', rail: false, size: 0.8 },
  andere: { label: 'Sonstige', color: '#9aa3b2', rail: false, size: 0.65 },
};
export const KIND_IDS = Object.keys(KINDS) as VehicleKind[];
/** Trains (long distance, regional, S-Bahn) belong to the train layer, the rest to the local transport layer. */
export const isTrainKind = (k: VehicleKind) => KINDS[k].rail;

export const isTrainFix = (v: VehicleFix) => v.train ?? isTrainKind(v.kind);

/** Transitous / MOTIS mode names -> kind. */
export function kindOfMode(mode: string): VehicleKind {
  switch (mode) {
    case 'HIGHSPEED_RAIL': case 'LONG_DISTANCE': case 'NIGHT_RAIL': return 'fern';
    case 'REGIONAL_FAST_RAIL': case 'REGIONAL_RAIL': case 'RAIL': return 'regio';
    case 'SUBURBAN': return 'sbahn';
    case 'SUBWAY': case 'METRO': return 'ubahn';
    case 'TRAM': case 'CABLE_CAR': case 'FUNICULAR': return 'tram';
    case 'BUS': case 'COACH': case 'ODM': case 'FLEX': return 'bus';
    case 'FERRY': return 'faehre';
    default: return 'andere';
  }
}

/** One vehicle position from any feed. `speed` in m/s, `delay` in minutes (undefined: no real-time data). */
export interface VehicleFix {
  id: string;
  lng: number;
  lat: number;
  heading?: number;
  speed?: number;
  /** ms since epoch of the fix */
  t: number;
  kind: VehicleKind;
  /** line / train number as shown to people */
  line: string;
  op?: string;
  from?: string;
  to?: string;
  next?: string;
  delay?: number;
  /** feed label, e.g. "MBTA (Boston)" */
  src: string;
  /** Transitous trip id / Digitraffic `date/number`, for the detail card */
  trip?: string;
  /** belongs to the train layer regardless of its kind (e.g. Finnish freight) */
  train?: boolean;
}

export type VehicleProps = {
  kind: VehicleKind; line: string; op: string; from: string; to: string; next: string; delay: number; src: string; trip: string; kmh: number; hd: boolean;
};
export const NO_DELAY = -999;

export function toTrack(v: VehicleFix): TrackObject {
  const kmh = v.speed !== undefined ? v.speed * 3.6 : -1;
  const props: VehicleProps = {
    kind: v.kind, line: v.line, op: v.op ?? '', from: v.from ?? '', to: v.to ?? '', next: v.next ?? '',
    delay: v.delay ?? NO_DELAY, src: v.src, trip: v.trip ?? '', kmh, hd: v.heading !== undefined,
  };
  return { id: v.id, lng: v.lng, lat: v.lat, heading: v.heading, speed: v.speed, t: v.t, props: props as unknown as TrackObject['props'] };
}

/** A feed that delivers vehicle positions for a region. `load` is only called while the view intersects `bbox`. */
export interface VehicleFeed {
  id: string;
  label: string;
  bbox: BBox;
  /** poll interval in ms */
  every: number;
  /** key id in the key registry; the feed is inactive without it */
  key?: string;
  /** whether the feed takes a bounding box (otherwise it delivers the whole network) */
  bounded?: boolean;
  /** Transitous feed id prefixes (`fi-`, `no-`) to hide while this feed delivers the same vehicles */
  covers?: string[];
  load(c: { bbox: BBox; key?: string; signal: AbortSignal }): Promise<VehicleFix[]>;
}

/** Feed id of a Transitous trip id ("20261111_09:02_de-DELFI_3478806042" -> "de-DELFI"). */
export const transitousFeedOf = (tripId: string): string => tripId.split('_')[2] ?? '';

/** Colour for MapLibre expressions: `['match', ['get','kind'], …]`. */
export const kindColorExpr = ['match', ['get', 'kind'], ...KIND_IDS.slice(0, -1).flatMap((k) => [k, KINDS[k].color]), KINDS.andere.color];
