// PEGELONLINE stations.json (timeseries W, current measurement, characteristic values) -> gauge points in Germany.
import type { Feature, FeatureCollection, Point } from 'geojson';

export type GaugeState = 'high' | 'normal' | 'low' | 'unknown';
export interface GaugeProps {
  id: string;
  name: string;
  water: string;
  /** km along the waterway */
  km?: number;
  /** water level, cm */
  level: number;
  /** measurement time, ms */
  time: number;
  state: GaugeState;
  /** characteristic values, cm */
  mw?: number;
  mnw?: number;
  mhw?: number;
  hsw?: number;
  /** level minus mean water (MW), cm */
  dev?: number;
  agency?: string;
}
export type GaugeCollection = FeatureCollection<Point, GaugeProps>;

/** Rough bounding box of Germany; the API also lists gauges of neighbouring countries. */
const inGermany = (lng: number, lat: number) => lng >= 5.8 && lng <= 15.2 && lat >= 47.2 && lat <= 55.1;

export const titleCase = (s: string): string => s.toLowerCase().replace(/(^|[\s\-(/.])\p{L}/gu, (m) => m.toUpperCase());

interface RawStation {
  number?: string;
  longname?: string;
  km?: number;
  agency?: string;
  longitude?: number;
  latitude?: number;
  water?: { longname?: string };
  timeseries?: {
    shortname?: string;
    unit?: string;
    currentMeasurement?: { timestamp?: string; value?: number; stateMnwMhw?: string; stateNswHsw?: string };
    characteristicValues?: { shortname?: string; value?: number }[];
  }[];
}

function stateOf(a?: string, b?: string): GaugeState {
  if (a === 'high' || b === 'high') return 'high';
  if (a === 'low' || b === 'low') return 'low';
  if (a === 'normal' || b === 'normal') return 'normal';
  return 'unknown';
}

export function pegelStations(raw: unknown): GaugeCollection {
  const features: Feature<Point, GaugeProps>[] = [];
  if (Array.isArray(raw)) {
    for (const s of raw as RawStation[]) {
      const { longitude: lng, latitude: lat } = s;
      if (typeof lng !== 'number' || typeof lat !== 'number' || !inGermany(lng, lat)) continue;
      const ts = s.timeseries?.find((t) => t.shortname === 'W');
      const m = ts?.currentMeasurement;
      if (!ts || ts.unit !== 'cm' || !m || typeof m.value !== 'number') continue;
      const time = Date.parse(m.timestamp ?? '');
      if (!Number.isFinite(time)) continue;
      const cv = (k: string) => ts.characteristicValues?.find((c) => c.shortname === k)?.value;
      const mw = cv('MW');
      const p: GaugeProps = {
        id: s.number ?? `${lng},${lat}`,
        name: titleCase(s.longname ?? 'Pegel'),
        water: titleCase(s.water?.longname ?? ''),
        level: m.value,
        time,
        state: stateOf(m.stateMnwMhw, m.stateNswHsw),
      };
      if (typeof s.km === 'number') p.km = s.km;
      if (s.agency) p.agency = titleCase(s.agency);
      if (mw !== undefined) { p.mw = mw; p.dev = Math.round(m.value - mw); }
      const mnw = cv('MNW'); if (mnw !== undefined) p.mnw = mnw;
      const mhw = cv('MHW'); if (mhw !== undefined) p.mhw = mhw;
      const hsw = cv('HSW'); if (hsw !== undefined) p.hsw = hsw;
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: p });
    }
  }
  return { type: 'FeatureCollection', features };
}
