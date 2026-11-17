// Power plants and storage from the OpenInfraMap power tiles (OSM): vector parts and inspector card for `kraftwerke` (option "OSM").
// Includes wind farm areas (power_plant polygons) and individual generators (wind turbines, solar panels) from zoom 9.
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { formatNumber } from '../core/format';
import { multiValues } from '../layers/multi';
import type { InspectCard } from '../layers/types';
import type { AnyFeature } from '../render/common';
import type { VtPart } from '../render/vectortiles';
import { num, osmUrl, str } from './openinframap';

const expr = (e: unknown) => e as ExpressionSpecification;
const flt = (e: unknown) => e as FilterSpecification;

export const OSM_SOURCES: Record<string, { label: string; color: string }> = {
  coal: { label: 'Kohle', color: '#C9CED6' }, gas: { label: 'Gas', color: '#F29B1D' }, oil: { label: 'Öl', color: '#E5533D' }, diesel: { label: 'Öl', color: '#E5533D' },
  nuclear: { label: 'Kern', color: '#D98BFF' }, hydro: { label: 'Wasser', color: '#3E8BFF' }, wind: { label: 'Wind', color: '#2BC48A' }, solar: { label: 'Solar', color: '#F5E642' },
  biomass: { label: 'Biomasse', color: '#B98A5A' }, biogas: { label: 'Biomasse', color: '#B98A5A' }, waste: { label: 'Müll', color: '#B98A5A' },
  geothermal: { label: 'Erdwärme', color: '#FF7AA2' }, battery: { label: 'Batterie', color: '#5EE6E6' }, tidal: { label: 'Gezeiten', color: '#3E8BFF' },
};
const OTHER = '#7C8697';
const sourceColor = expr(['match', ['get', 'source'], ...Object.entries(OSM_SOURCES).flatMap(([k, v]) => [k, v.color]), OTHER]);
const mw = expr(['coalesce', ['to-number', ['get', 'output'], 0], 0]);

const STORAGE_METHODS = ['water-pumped-storage', 'battery', 'flywheel', 'compressed_air', 'gravity'];
const storage = ['any', ['in', ['get', 'method'], ['literal', STORAGE_METHODS]], ['==', ['get', 'source'], 'battery'], ['has', 'storage']];
const active = ['all', ['!=', ['get', 'disused'], true], ['!=', ['get', 'construction'], true]];
const radius = expr(['interpolate', ['linear'], ['zoom'], 2, ['max', 2, ['min', 7, ['*', 0.25, ['sqrt', mw]]]], 8, ['max', 3.5, ['min', 14, ['*', 0.5, ['sqrt', mw]]]], 13, ['max', 5, ['min', 22, ['*', 0.8, ['sqrt', mw]]]]]);

/** Filter value of the `fuel` option -> OSM `source` values (the keys of WRI's classes). */
const FUEL_SOURCES: Record<string, string[]> = {
  wind: ['wind'], solar: ['solar'], hydro: ['hydro', 'tidal'], nuclear: ['nuclear'], coal: ['coal'], gas: ['gas'], oil: ['oil', 'diesel'], biomass: ['biomass', 'biogas', 'waste'],
};
const KNOWN = [...new Set([...Object.values(FUEL_SOURCES).flat(), 'geothermal', 'battery'])];

/** One value of the `fuel` option as a condition ('other' and 'storage' have their own; null: unknown value). */
function fuelClause(fuel: string): unknown {
  if (fuel === 'storage') return storage;
  if (fuel === 'other') return ['all', ['!', ['in', ['get', 'source'], ['literal', KNOWN.filter((k) => k !== 'battery' && k !== 'geothermal')]]], ['!', storage]];
  if (FUEL_SOURCES[fuel]) return ['in', ['get', 'source'], ['literal', FUEL_SOURCES[fuel]]];
  return null;
}

/** `fuel`: option value ('all', or fuel classes, 'other' and 'storage' joined by commas, see layers/multi.ts); `minMw`: smallest output shown. */
export function osmPlantFilter(fuel: string, minMw: number): FilterSpecification {
  const parts: unknown[] = [active];
  if (minMw > 0) parts.push(['>=', mw, minMw]);
  const clauses = (multiValues(fuel) ?? []).map(fuelClause).filter((c) => c !== null);
  if (clauses.length === 1) parts.push(clauses[0]);
  else if (clauses.length > 1) parts.push(['any', ...clauses]);
  return flt(['all', ...parts]);
}

/** OpenInfraMap serves plants and substations only from this zoom on (lower tiles hold just power lines). */
export const OSM_PLANTS_MIN_ZOOM = 5;

export function osmPlantParts(filter: VtPart['filter']): VtPart[] {
  return [
    { id: 'osm-flaeche', sourceLayer: 'power_plant', kind: 'fill', filter, color: sourceColor, minZoom: OSM_PLANTS_MIN_ZOOM },
    { id: 'osm-werk', sourceLayer: 'power_plant_point', kind: 'circle', filter, color: sourceColor, size: radius, sortKey: expr(['-', 0, mw]), minZoom: OSM_PLANTS_MIN_ZOOM },
    { id: 'osm-erzeuger', sourceLayer: 'power_generator', kind: 'circle', filter, color: sourceColor, size: expr(['interpolate', ['linear'], ['zoom'], 9, 1.6, 14, 4, 18, 8]), minZoom: 9 },
  ];
}

const METHOD: Record<string, string> = {
  'water-pumped-storage': 'Pumpspeicher', battery: 'Batteriespeicher', combustion: 'Verbrennung', fission: 'Kernspaltung', 'run-of-the-river': 'Laufwasser', 'water-storage': 'Speicherkraft',
  wind_turbine: 'Windkraftanlage', photovoltaic: 'Photovoltaik', anaerobic_digestion: 'Biogas', gasification: 'Vergasung', thermal: 'Thermisch',
};

export function describeOsmPlant(f: AnyFeature, part: VtPart): InspectCard {
  const p = f.properties as Record<string, unknown>;
  const src = OSM_SOURCES[str(p.source)];
  const out = num(p.output);
  const method = METHOD[str(p.method)] ?? '';
  const isStorage = STORAGE_METHODS.includes(str(p.method)) || str(p.source) === 'battery' || !!str(p.storage);
  const kind = isStorage ? 'Energiespeicher' : part.id === 'osm-erzeuger' ? 'Erzeugungsanlage' : 'Kraftwerk';
  const output = out ? (out >= 1000 ? `${formatNumber(out / 1000, 2)} GW` : `${formatNumber(out, out < 10 ? 1 : 0)} MW`) : '';
  return {
    title: str(p.name) || `${kind}${src ? ` (${src.label})` : ''}`, subtitle: `${kind} · OpenStreetMap`, icon: 'power', color: src?.color,
    facts: [
      ...(src ? [{ label: 'Energieträger', value: src.label, emphasis: true }] : []),
      ...(method ? [{ label: 'Verfahren', value: method }] : []),
      ...(output ? [{ label: 'Leistung', value: output, emphasis: true }] : []),
      ...(str(p.storage) && str(p.storage) !== 'yes' ? [{ label: 'Speicherkapazität', value: str(p.storage) }] : []),
      ...(str(p.operator) ? [{ label: 'Betreiber', value: str(p.operator) }] : []),
      ...(str(p.start_date) ? [{ label: 'In Betrieb seit', value: str(p.start_date) }] : []),
    ],
    links: [{ label: 'OpenStreetMap', url: osmUrl(p) }, ...(/^https?:\/\//.test(str(p.url)) ? [{ label: 'Website', url: str(p.url) }] : [])],
  };
}
