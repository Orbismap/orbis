// Digitraffic Marine (Fintraffic, CC BY 4.0): AIS positions (`/api/ais/v1/locations`) and vessel master data (`/vessels`).
import type { TrackObject } from '../../render/tracks';

export const KN = 0.514444;

export type ShipClass = 'passenger' | 'cargo' | 'tanker' | 'fishing' | 'pleasure' | 'special' | 'other';

export const SHIP_CLASSES: { id: ShipClass; label: string; color: string }[] = [
  { id: 'passenger', label: 'Passagier / Fähre', color: '#ff9f6b' },
  { id: 'cargo', label: 'Fracht', color: '#4fc3f7' },
  { id: 'tanker', label: 'Tanker', color: '#ef5d4d' },
  { id: 'fishing', label: 'Fischerei', color: '#7bdc7b' },
  { id: 'pleasure', label: 'Segel / Sportboot', color: '#e8d44d' },
  { id: 'special', label: 'Schlepper / Spezial', color: '#b98bf0' },
  { id: 'other', label: 'Sonstige', color: '#9aa7b8' },
];

/** AIS ship-type code (0–99) -> display class. */
export function shipClass(code: number | undefined): ShipClass {
  if (code === undefined || !Number.isFinite(code)) return 'other';
  if (code === 30) return 'fishing';
  if (code === 36 || code === 37) return 'pleasure';
  if ((code >= 40 && code <= 49) || (code >= 60 && code <= 69)) return 'passenger';
  if (code >= 70 && code <= 79) return 'cargo';
  if (code >= 80 && code <= 89) return 'tanker';
  if ((code >= 31 && code <= 35) || (code >= 50 && code <= 59)) return 'special';
  return 'other';
}

const TYPE_NAMES: Record<number, string> = {
  30: 'Fischereifahrzeug', 31: 'Schlepper', 32: 'Schlepper (Schleppverband)', 33: 'Baggerschiff', 34: 'Tauchereinsatz', 35: 'Militär',
  36: 'Segelschiff', 37: 'Sportboot', 50: 'Lotsenboot', 51: 'Seenotretter', 52: 'Schlepper', 53: 'Hafentender', 54: 'Umweltschutz',
  55: 'Behördenschiff', 58: 'Sanitätsschiff', 59: 'Sondereinsatz',
};
export function shipTypeName(code: number | undefined): string {
  if (code === undefined || !Number.isFinite(code) || code === 0) return 'Unbekannt';
  if (TYPE_NAMES[code]) return TYPE_NAMES[code]!;
  const d = code >= 40 && code < 50 ? 'Schnellfahrzeug' : code >= 60 && code < 70 ? 'Passagierschiff' : code >= 70 && code < 80 ? 'Frachter' : code >= 80 && code < 90 ? 'Tanker' : code >= 90 ? 'Sonstiges Schiff' : 'Schiff';
  return d;
}

export type ShipEta = { month: number; day: number; hour: number; minute: number };
export type ShipVessel = { name: string; type: number; dest: string; draught: number; call: string; imo: number; len: number; wid: number; eta?: ShipEta | null };

/** AIS packs the ETA into 20 bits: month (4) | day (5) | hour (5) | minute (6). */
export function etaFromPacked(v: unknown): ShipEta | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const month = (n >> 16) & 15, day = (n >> 11) & 31, hour = (n >> 6) & 31, minute = n & 63;
  return month >= 1 && month <= 12 && day >= 1 && hour < 24 && minute < 60 ? { month, day, hour, minute } : null;
}

/** `/vessels` list -> map by MMSI as plain object. `draught` is converted from decimetres to metres. */
export function aisVessels(raw: unknown): Record<string, ShipVessel> {
  const out: Record<string, ShipVessel> = {};
  if (!Array.isArray(raw)) return out;
  for (const v of raw as Record<string, unknown>[]) {
    const mmsi = v.mmsi;
    if (typeof mmsi !== 'number') continue;
    const a = Number(v.referencePointA) || 0;
    const b = Number(v.referencePointB) || 0;
    const c = Number(v.referencePointC) || 0;
    const d = Number(v.referencePointD) || 0;
    out[String(mmsi)] = {
      name: String(v.name ?? '').trim(),
      type: Number(v.shipType) || 0,
      dest: String(v.destination ?? '').trim(),
      draught: (Number(v.draught) || 0) / 10,
      call: String(v.callSign ?? '').trim(),
      imo: Number(v.imo) || 0,
      len: a + b,
      wid: c + d,
      eta: etaFromPacked(v.eta),
    };
  }
  return out;
}

export type ShipProps = { mmsi: number; sog: number; cog: number; hdg: number; nav: number; moving: boolean };

/** `/locations` GeoJSON -> tracks. Heading is the course over ground while moving, else the true heading, else the course. */
export function aisLocations(raw: unknown): TrackObject[] {
  const list = (raw as { features?: Record<string, unknown>[] } | null)?.features;
  if (!Array.isArray(list)) return [];
  const out: TrackObject[] = [];
  for (const f of list) {
    const g = f.geometry as { coordinates?: number[] } | undefined;
    const p = f.properties as { sog: number; cog: number; heading: number; timestampExternal: number; navStat?: number; mmsi?: number } | undefined;
    const mmsi = (f.mmsi ?? p?.mmsi) as number | undefined;
    if (!g?.coordinates || !p || typeof mmsi !== 'number') continue;
    const [lng, lat] = g.coordinates as [number, number];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const sog = p.sog >= 0 && p.sog < 102 ? p.sog : 0; // 102.3 = not available
    const cog = p.cog >= 0 && p.cog < 360 ? p.cog : -1;
    const hdg = p.heading >= 0 && p.heading < 360 ? p.heading : -1;
    const moving = sog >= 0.5;
    const heading = moving && cog >= 0 ? cog : hdg >= 0 ? hdg : cog >= 0 ? cog : 0;
    out.push({
      id: String(mmsi),
      lng,
      lat,
      heading,
      speed: moving ? sog * KN : 0,
      t: p.timestampExternal,
      props: { mmsi, sog, cog, hdg, nav: p.navStat ?? 15, moving } satisfies ShipProps,
    });
  }
  return out;
}
