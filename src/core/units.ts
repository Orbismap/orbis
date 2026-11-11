// User-selectable units. The choice lives in `unitPrefs`; state/settings.ts writes it, everyone else reads it.
// Base units of all values inside the app: temperature °C, wind km/h, pressure hPa, precipitation mm, distance km.
import { signal } from '@preact/signals';

export type TemperatureUnit = 'c' | 'f';
export type WindUnit = 'kmh' | 'ms' | 'kn' | 'bft';
export type PressureUnit = 'hpa' | 'inhg';
export type PrecipUnit = 'mm' | 'in';
export type DistanceUnit = 'km' | 'mi';

export interface UnitPrefs {
  temperature: TemperatureUnit;
  wind: WindUnit;
  pressure: PressureUnit;
  precip: PrecipUnit;
  distance: DistanceUnit;
}
export type Quantity = keyof UnitPrefs;

export const DEFAULT_UNITS: UnitPrefs = { temperature: 'c', wind: 'kmh', pressure: 'hpa', precip: 'mm', distance: 'km' };

export const unitPrefs = signal<UnitPrefs>({ ...DEFAULT_UNITS });
export const setUnitPrefs = (p: Partial<UnitPrefs>) => {
  unitPrefs.value = { ...unitPrefs.peek(), ...p };
};

interface UnitDef { label: string; fromBase(v: number): number; toBase(v: number): number; digits: number }

const bftLimits = [0.5, 5.5, 11.5, 19.5, 28.5, 38.5, 49.5, 61.5, 74.5, 88.5, 102.5, 117.5]; // km/h upper bounds of Bft 0..11
const bftFromKmh = (v: number) => {
  const i = bftLimits.findIndex((l) => v < l);
  return i === -1 ? 12 : i;
};
const bftToKmh = (b: number) => (b <= 0 ? 0 : (bftLimits[Math.min(11, Math.round(b)) - 1] ?? 0) + 1);

export const UNITS: { [Q in Quantity]: Record<UnitPrefs[Q], UnitDef> } = {
  temperature: {
    c: { label: '°C', fromBase: (v) => v, toBase: (v) => v, digits: 0 },
    f: { label: '°F', fromBase: (v) => (v * 9) / 5 + 32, toBase: (v) => ((v - 32) * 5) / 9, digits: 0 },
  },
  wind: {
    kmh: { label: 'km/h', fromBase: (v) => v, toBase: (v) => v, digits: 0 },
    ms: { label: 'm/s', fromBase: (v) => v / 3.6, toBase: (v) => v * 3.6, digits: 1 },
    kn: { label: 'kn', fromBase: (v) => v / 1.852, toBase: (v) => v * 1.852, digits: 0 },
    bft: { label: 'Bft', fromBase: bftFromKmh, toBase: bftToKmh, digits: 0 },
  },
  pressure: {
    hpa: { label: 'hPa', fromBase: (v) => v, toBase: (v) => v, digits: 0 },
    inhg: { label: 'inHg', fromBase: (v) => v * 0.02953, toBase: (v) => v / 0.02953, digits: 2 },
  },
  precip: {
    mm: { label: 'mm', fromBase: (v) => v, toBase: (v) => v, digits: 1 },
    in: { label: 'in', fromBase: (v) => v / 25.4, toBase: (v) => v * 25.4, digits: 2 },
  },
  distance: {
    km: { label: 'km', fromBase: (v) => v, toBase: (v) => v, digits: 0 },
    mi: { label: 'mi', fromBase: (v) => v / 1.609344, toBase: (v) => v * 1.609344, digits: 0 },
  },
};

const def = (q: Quantity, prefs: UnitPrefs): UnitDef => (UNITS[q] as Record<string, UnitDef>)[prefs[q]]!;

/** Converts a base-unit value into the user's unit. */
export const convert = (q: Quantity, base: number, prefs: UnitPrefs = unitPrefs.value) => def(q, prefs).fromBase(base);
/** Converts a value in the user's unit back to the base unit. */
export const convertBack = (q: Quantity, v: number, prefs: UnitPrefs = unitPrefs.value) => def(q, prefs).toBase(v);

/** Label of the user's unit. `rate` appends "/h" (precipitation rates). */
export function unitLabel(q: Quantity, opts: { rate?: boolean; prefs?: UnitPrefs } = {}): string {
  const l = def(q, opts.prefs ?? unitPrefs.value).label;
  return opts.rate ? `${l}/h` : l;
}

/** "12 km/h" for a base-unit value, with narrow no-break space and de-DE decimals. */
export function formatQuantity(
  q: Quantity,
  base: number,
  opts: { digits?: number; rate?: boolean; prefs?: UnitPrefs } = {},
): string {
  const prefs = opts.prefs ?? unitPrefs.value;
  const d = def(q, prefs);
  const digits = opts.digits ?? d.digits;
  const text = new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(d.fromBase(base));
  return `${text} ${unitLabel(q, { rate: opts.rate, prefs })}`;
}

/** Units that need a rate suffix when shown as "per hour". */
export const KMH_PER_MS = 3.6;
