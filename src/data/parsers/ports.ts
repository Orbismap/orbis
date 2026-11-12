// public/data/ports.json (built from the NGA World Port Index, Pub. 150, plus the Upply seaport list / UN/LOCODE) -> points.
// Row: [lng, lat, name, UN/LOCODE, country, tier, type, channel depth m, pier depth m, max vessel length m, max draught m,
// pilotage (1 compulsory, 0 not, -1 n/a), shelter, facilities letters]. Rows of tier 5 (UN/LOCODE only) stop after the tier.
export type PortProps = {
  id: string; name: string; code: string; country: string; tier: number; size: string; type: string;
  channel: number; pier: number; length: number; draft: number; pilot: string; shelter: string; fac: string; wpi: boolean;
};
type Row = [number, number, string, string, string, number, string?, number?, number?, number?, number?, number?, string?, string?];

export const PORT_SIZE: Record<number, string> = { 1: 'Groß', 2: 'Mittel', 3: 'Klein', 4: 'Sehr klein', 5: 'Klein (nur UN/LOCODE)' };
const TYPE: Record<string, string> = {
  'Coastal (Natural)': 'Küste, natürlich geschützt', 'Coastal (Breakwater)': 'Küste, mit Wellenbrecher', 'River (Natural)': 'Fluss', 'River (Basins)': 'Fluss mit Hafenbecken',
  'River (Tide Gates)': 'Fluss mit Schleuse', 'Coastal (Tide Gates)': 'Küste mit Schleuse', 'Open Roadstead': 'offene Reede', 'Canal or Lake': 'Kanal oder See', 'Typhoon Harbor': 'Taifunhafen',
};
const SHELTER: Record<string, string> = { Excellent: 'ausgezeichnet', Good: 'gut', Fair: 'mäßig', Poor: 'schlecht', None: 'keiner' };
const FACILITY: Record<string, string> = { C: 'Container', R: 'Ro-Ro', S: 'Schüttgut', L: 'Flüssiggut', B: 'Stückgut', O: 'Öl', G: 'LNG' };

let regions: Intl.DisplayNames | undefined;
const countryName = (c: string): string => {
  if (c.length !== 2) return c;
  try { regions ??= new Intl.DisplayNames(['de'], { type: 'region' }); return regions.of(c.toUpperCase()) ?? c; } catch { return c; }
};

export function portsParse(raw: unknown): GeoJSON.FeatureCollection<GeoJSON.Point, PortProps> {
  const rows = (raw as { ports?: Row[] } | null)?.ports;
  const features: GeoJSON.Feature<GeoJSON.Point, PortProps>[] = [];
  if (!Array.isArray(rows)) return { type: 'FeatureCollection', features };
  rows.forEach((r, i) => {
    const [lng, lat, name, code, country, tier, type, channel, pier, length, draft, pilot, shelter, fac] = r;
    if (typeof lng !== 'number' || typeof lat !== 'number') return;
    features.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        id: `p${i}`, name, code, country: countryName(country), tier, size: PORT_SIZE[tier] ?? '', type: type ? (TYPE[type] ?? type) : '',
        channel: channel || 0, pier: pier || 0, length: length || 0, draft: draft || 0,
        pilot: pilot === undefined || pilot < 0 ? '' : pilot ? 'Pflicht' : 'nicht vorgeschrieben', shelter: shelter ? (SHELTER[shelter] ?? '') : '',
        fac: (fac ?? '').split('').map((c) => FACILITY[c]).filter(Boolean).join(', '), wpi: type !== undefined,
      },
    });
  });
  return { type: 'FeatureCollection', features };
}
