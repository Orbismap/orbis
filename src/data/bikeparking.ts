// Bicycle parking from OpenStreetMap (fahrradparken.pmtiles of the data repo: layer `fahrradparken` with every parking as a
// point, `fahrradparken_flaechen` with the outlines of those mapped as areas, below zoom 10 `fahrradparken_cluster` with counted
// clusters). Pure: properties, filters, cluster counters, card texts.
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { formatInt } from '../core/format';
import type { InspectCard, OptionValues } from '../layers/types';

/** Properties of a feature; the data repo leaves missing values out. */
export interface BikeParkingProps {
  id: number;
  /** '' for nodes (left out), 'w' / 'r' for parkings mapped as an area. */
  osm?: 'w' | 'r';
  /** `bicycle_parking=*` */
  type?: string;
  capacity?: number;
  covered?: 'yes' | 'no' | 'partial';
  access?: string;
  fee?: 'yes' | 'no';
  lit?: 'yes' | 'no';
  /** 1: has places for cargo bikes */
  cargo?: number;
  operator?: string;
  name?: string;
}

/** The minimum numbers of places offered as a filter; the clusters count exactly these (data repo: PARKING_STEPS). */
export const PARKING_STEPS = [5, 10, 20, 50];

export const PARKING_COLORS = { covered: '#38BDF8', open: '#F59E0B', unknown: '#A8B3C5' };

/** Types that are roofed by their nature: they count as covered unless `covered` says otherwise. */
const ROOFED = ['building', 'shed', 'lockers'];
/** `access` values (and '' = not tagged) with which anybody may park. */
const PUBLIC = ['', 'yes', 'public', 'permissive', 'designated'];

const TYPES: Record<string, string> = {
  stands: 'Anlehnbügel', wide_stands: 'Breite Anlehnbügel', staple: 'Anlehnbügel', wall_loops: 'Felgenhalter',
  safe_loops: 'Vorderradhalter mit Anschließbügel', rack: 'Reihenständer', bollard: 'Poller', 'two-tier': 'Doppelstockparker',
  shed: 'Fahrradschuppen', building: 'Fahrradparkhaus', lockers: 'Fahrradboxen', anchors: 'Anschließösen', ground_slots: 'Bodenschlitze',
  handlebar_holder: 'Lenkerhalter', saddle_holder: 'Sattelhalter', floor: 'Stellfläche ohne Ständer', informal: 'Wildes Abstellen',
};
const ACCESS: Record<string, string> = {
  yes: 'Öffentlich', public: 'Öffentlich', permissive: 'Geduldet', designated: 'Öffentlich', customers: 'Nur für Kundschaft',
  private: 'Privat', permit: 'Mit Berechtigung', members: 'Nur für Mitglieder', no: 'Gesperrt',
};
const COVERED = { yes: 'Ja', no: 'Nein', partial: 'Teilweise' };

const isCovered = ['any',
  ['==', ['get', 'covered'], 'yes'],
  ['all', ['!', ['has', 'covered']], ['in', ['coalesce', ['get', 'type'], ''], ['literal', ROOFED]]],
] as unknown as ExpressionSpecification;

/** Paint colour: covered, open air, or not known (also "partial"). */
export const parkingColor = ['case',
  isCovered, PARKING_COLORS.covered,
  ['==', ['get', 'covered'], 'no'], PARKING_COLORS.open,
  PARKING_COLORS.unknown,
] as unknown as ExpressionSpecification;

/** Map filter of the layer options `covered`, `public` (toggles) and `capacity` (least number of places); undefined: show all. */
export function parkingFilter(o: OptionValues): FilterSpecification | undefined {
  const all: unknown[] = [];
  if (o.covered === true) all.push(isCovered);
  if (o.public === true) all.push(['in', ['coalesce', ['get', 'access'], ''], ['literal', PUBLIC]]);
  const least = Number(o.capacity) || 0;
  // parkings without a stated capacity do not pass a minimum
  if (least > 0) all.push(['>=', ['coalesce', ['get', 'capacity'], 0], least]);
  return all.length ? (['all', ...all] as unknown as FilterSpecification) : undefined;
}

/**
 * The counter of a cluster that matches the layer options: `n`, then `c` (covered), `p` (public) and the least number of places
 * (`ncp10`). The data repo counts with the same rules (collectors/osm-themes.mjs, parkingKeys): change both together.
 */
export function parkingCountKey(o: OptionValues): string {
  const least = Number(o.capacity) || 0;
  return `n${o.covered === true ? 'c' : ''}${o.public === true ? 'p' : ''}${least > 0 ? least : ''}`;
}

/** Roofed: tagged `covered=yes`, or a roofed type without that tag (the same rule as the filter expression). */
export const isCoveredParking = (p: Pick<BikeParkingProps, 'covered' | 'type'>): boolean => p.covered === 'yes' || (p.covered === undefined && !!p.type && ROOFED.includes(p.type));
/** Anybody may park here. */
export const isPublicParking = (p: Pick<BikeParkingProps, 'access'>): boolean => PUBLIC.includes(p.access ?? '');
/** The dot colour of a parking, as `parkingColor` paints it. */
export const parkingDotColor = (p: Pick<BikeParkingProps, 'covered' | 'type'>): string =>
  isCoveredParking(p) ? PARKING_COLORS.covered : p.covered === 'no' ? PARKING_COLORS.open : PARKING_COLORS.unknown;

export const parkingType = (type: string | undefined): string => (type ? TYPES[type] ?? type.replace(/[_;]/g, ' ') : 'Fahrradparkplatz');

export function parkingOsmUrl(p: Pick<BikeParkingProps, 'id' | 'osm'>): string {
  const kind = p.osm === 'w' ? 'way' : p.osm === 'r' ? 'relation' : 'node';
  return `https://www.openstreetmap.org/${kind}/${p.id}`;
}

export function parkingCard(p: BikeParkingProps): InspectCard {
  const covered = p.covered ?? (isCoveredParking(p) ? 'yes' : undefined);
  const fact = (label: string, value: string | undefined, emphasis?: boolean) => (value ? [{ label, value, ...(emphasis ? { emphasis } : {}) }] : []);
  return {
    title: p.name || 'Fahrradständer',
    subtitle: parkingType(p.type),
    icon: 'bike',
    color: parkingDotColor(p),
    facts: [
      ...fact('Stellplätze', p.capacity ? formatInt(p.capacity) : undefined, true),
      ...fact('Überdacht', covered && COVERED[covered]),
      ...fact('Zugang', p.access && (ACCESS[p.access] ?? p.access)),
      ...fact('Gebühr', p.fee && (p.fee === 'yes' ? 'Gebührenpflichtig' : 'Kostenlos')),
      ...fact('Beleuchtet', p.lit && (p.lit === 'yes' ? 'Ja' : 'Nein')),
      ...fact('Lastenräder', p.cargo ? 'Eigene Plätze' : undefined),
      ...fact('Betreiber', p.operator),
    ],
    links: [{ label: 'OpenStreetMap', url: parkingOsmUrl(p) }],
  };
}
