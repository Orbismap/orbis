// User settings: units, theme, motion, API keys. Persisted; writes the unit choice into core/units.
import { computed, effect, signal } from '@preact/signals';
import { getJSON, setJSON } from '../core/storage';
import { DEFAULT_UNITS, setUnitPrefs, type UnitPrefs } from '../core/units';

export type Theme = 'auto' | 'dark' | 'light';
export type Motion = 'auto' | 'reduce' | 'full';

export interface Settings {
  units: UnitPrefs;
  theme: Theme;
  motion: Motion;
  /** Optional API keys by name (e.g. for keyed sources). Stored only in this browser. */
  keys: Record<string, string>;
}

const VERSION = 1;
export const DEFAULT_SETTINGS: Settings = { units: { ...DEFAULT_UNITS }, theme: 'dark', motion: 'auto', keys: {} };

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

export function validateSettings(raw: unknown): Settings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<Settings>;
  const u = (r.units ?? {}) as Partial<UnitPrefs>;
  const keys: Record<string, string> = {};
  if (r.keys && typeof r.keys === 'object') for (const [k, v] of Object.entries(r.keys)) if (typeof v === 'string') keys[k] = v;
  return {
    units: {
      temperature: pick(u.temperature, ['c', 'f'], 'c'),
      wind: pick(u.wind, ['kmh', 'ms', 'kn', 'bft'], 'kmh'),
      pressure: pick(u.pressure, ['hpa', 'inhg'], 'hpa'),
      precip: pick(u.precip, ['mm', 'in'], 'mm'),
      distance: pick(u.distance, ['km', 'mi'], 'km'),
    },
    theme: pick(r.theme, ['auto', 'dark', 'light'], 'dark'),
    motion: pick(r.motion, ['auto', 'reduce', 'full'], 'auto'),
    keys,
  };
}

export const settings = signal<Settings>(getJSON('settings', VERSION, validateSettings, DEFAULT_SETTINGS));

export function updateSettings(patch: Partial<Omit<Settings, 'units'>> & { units?: Partial<UnitPrefs> }): void {
  const cur = settings.value;
  settings.value = { ...cur, ...patch, units: { ...cur.units, ...patch.units } };
}

/** Wires settings to core/units, <html data-theme> and storage. Returns a dispose function. */
export function initSettings(): () => void {
  const stops = [
    effect(() => setUnitPrefs(settings.value.units)),
    effect(() => {
      const s = settings.value;
      setJSON('settings', VERSION, s);
      if (typeof document !== 'undefined') {
        const root = document.documentElement;
        if (s.theme === 'auto') root.removeAttribute('data-theme');
        else root.setAttribute('data-theme', s.theme);
        root.dataset.motion = s.motion;
      }
    }),
  ];
  return () => stops.forEach((s) => s());
}

/** True when animations should be reduced (setting or OS preference). */
export function reducedMotion(): boolean {
  const m = settings.value.motion;
  if (m !== 'auto') return m === 'reduce';
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const lightMq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : undefined;
const osLight = signal(!!lightMq?.matches);
lightMq?.addEventListener?.('change', (e) => (osLight.value = e.matches));

/** The theme the chrome really shows: explicit choice, or the OS scheme for 'auto'. */
export const effectiveTheme = computed<'dark' | 'light'>(() => {
  const t = settings.value.theme;
  return t === 'auto' ? (osLight.value ? 'light' : 'dark') : t;
});
