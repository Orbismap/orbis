// OpenInfraMap vector tiles (openinframap.org/map/<set>/{z}/{x}/{y}.pbf, CORS open) and what the layers share:
// tile URLs, source line, voltage classes and the OSM link of a feature. Data © OpenStreetMap contributors (ODbL).
import type { ExpressionSpecification } from 'maplibre-gl';
import type { SourceRef } from '../layers/types';

export type OimSet = 'power' | 'telecoms' | 'petroleum' | 'water';
export const oimTiles = (set: OimSet) => `https://openinframap.org/map/${set}/{z}/{x}/{y}.pbf`;

export const OIM_ATTRIBUTION = '<a href="https://openinframap.org/" target="_blank" rel="noopener">OpenInfraMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende';
export const OIM_SOURCE: SourceRef = { name: 'OpenInfraMap-Kacheln, Daten: OpenStreetMap-Mitwirkende', url: 'https://openinframap.org/', license: 'ODbL 1.0' };

/** Voltage classes in kV, highest first: [from kV, colour, label]. */
export const VOLTAGE_CLASSES: [number, string, string][] = [
  [500, '#FF2E63', '500 kV und mehr'],
  [300, '#FF8A1F', '300 bis 500 kV (380 und 400 kV)'],
  [200, '#FFC400', '200 bis 300 kV (220 kV)'],
  [100, '#9BE564', '100 bis 200 kV (110 und 150 kV)'],
  [50, '#2EC4B6', '50 bis 100 kV'],
  [20, '#4FA3FF', '20 bis 50 kV'],
  [1, '#9AA7B8', 'unter 20 kV'],
];
export const VOLTAGE_UNKNOWN = '#7C8794';

/** Voltage in kV of a tile feature (power_line: number, substation: decimal string). */
export const kv: ExpressionSpecification = ['coalesce', ['to-number', ['get', 'voltage'], 0], 0] as unknown as ExpressionSpecification;
export const voltageColor: ExpressionSpecification = [
  'step', kv, VOLTAGE_UNKNOWN, ...[...VOLTAGE_CLASSES].reverse().flatMap(([from, color]) => [from, color]),
] as unknown as ExpressionSpecification;

export const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
export const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** osm_id is negative for relations; is_node tells nodes from ways. */
export function osmUrl(p: Record<string, unknown>): string {
  const id = num(p.osm_id);
  if (id === undefined) return 'https://www.openstreetmap.org/';
  const type = id < 0 ? 'relation' : p.is_node === true ? 'node' : 'way';
  return `https://www.openstreetmap.org/${type}/${Math.abs(id)}`;
}

/** "380" -> "380 kV"; accepts the decimal strings of the substation layer. */
export const kvLabel = (v: unknown): string => {
  const n = num(v);
  return n && n > 0 ? `${Number.isInteger(n) ? n : n.toFixed(1)} kV` : '';
};

/** Pipeline diameters come as "250", "DN400", "66 cm", "2m", "0.25" (m) …: shown as mm or m, unchanged when unparsable. */
export function diameterLabel(v: unknown): string {
  const raw = str(v);
  const m = /^(?:dn\s*)?([\d.,]+)\s*(mm|cm|m)?$/i.exec(raw);
  if (!m) return raw;
  const n = parseFloat(m[1]!.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return raw;
  const unit = (m[2] ?? '').toLowerCase();
  const mm = unit === 'm' ? n * 1000 : unit === 'cm' ? n * 10 : unit === '' && n < 10 ? n * 1000 : n;
  return mm >= 1000 ? `${Math.round(mm) / 1000} m` : `${Math.round(mm)} mm`;
}
