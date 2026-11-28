import type { ModeGroup, Vehicle } from './types';

/** Filter-Gruppen der Oberfläche und die MOTIS-Modi, für die sie stehen. */
export const MODE_GROUPS: { id: ModeGroup; label: string; motis: string[] }[] = [
  { id: 'fern', label: 'Fernverkehr', motis: ['HIGHSPEED_RAIL', 'LONG_DISTANCE', 'NIGHT_RAIL'] },
  { id: 'regio', label: 'Regionalverkehr', motis: ['REGIONAL_FAST_RAIL', 'REGIONAL_RAIL', 'RAIL'] },
  { id: 'sbahn', label: 'S-Bahn', motis: ['SUBURBAN'] },
  { id: 'ubahn', label: 'U-Bahn', motis: ['SUBWAY', 'METRO'] },
  { id: 'tram', label: 'Straßenbahn', motis: ['TRAM'] },
  { id: 'bus', label: 'Bus', motis: ['BUS', 'ODM', 'FLEX'] },
  { id: 'fernbus', label: 'Fernbus', motis: ['COACH'] },
  { id: 'faehre', label: 'Fähre', motis: ['FERRY'] },
];

const FOOT = new Set(['WALK', 'BIKE', 'CAR', 'RENTAL']);
const byMotis = new Map(MODE_GROUPS.flatMap((g) => g.motis.map((m) => [m, g.id] as const)));

export const modeGroup = (motis: string): ModeGroup => (FOOT.has(motis) ? 'fuss' : (byMotis.get(motis) ?? 'sonst'));
export const motisModes = (groups: ModeGroup[]): string[] => MODE_GROUPS.filter((g) => groups.includes(g.id)).flatMap((g) => g.motis);

/** Züge: Nur für sie gibt es DB-Echtzeitdaten. */
export const isRail = (mode: ModeGroup): boolean => mode === 'fern' || mode === 'regio' || mode === 'sbahn';

const BY_MOTIS: Record<string, Vehicle> = {
  HIGHSPEED_RAIL: 'schnellzug', NIGHT_RAIL: 'nachtzug', ODM: 'rufbus', FLEX: 'rufbus', RIDE_SHARING: 'mitfahrt',
  FUNICULAR: 'standseil', CABLE_CAR: 'standseil', AERIAL_LIFT: 'seilbahn', AREAL_LIFT: 'seilbahn', AIRPLANE: 'flug',
};

/**
 * Der Sonderfall einer Fahrt, sonst undefined. Für Ersatzverkehr, Sammeltaxi und Schwebebahn gibt es keine eigene
 * Verkehrsart: Sie werden nur erkannt, wenn der Linienname es sagt.
 */
export function vehicleOf(motis: string, line: string): Vehicle | undefined {
  if (/schwebebahn/i.test(line)) return 'schwebebahn';
  if (motis === 'BUS' && (/\bSEV\b/.test(line) || /ersatzverkehr/i.test(line))) return 'ersatz';
  if ((motis === 'ODM' || motis === 'FLEX') && (/\bAST\b/.test(line) || /sammeltaxi/i.test(line))) return 'taxi';
  if (motis === 'LONG_DISTANCE' && /^(ICE|TGV)\b/.test(line)) return 'schnellzug';
  return BY_MOTIS[motis];
}
