// Open-Meteo Marine multi-location response (current block) -> samples for the ocean grid (render/ocean).
// Ocean current velocity is km/h, "direction it flows towards"; wave directions are bearings the waves come FROM.
// Land points answer with null values and are dropped.

export interface MarineSample {
  lat: number;
  lon: number;
  /** [cu, cv, wh, wdx, wdy, wp, sh, sdx, sdy, sp]; u/v in m/s east/north, wh/sh in m, wdx/wdy and sdx/sdy unit vector of the from-bearing, wp/sp in s; NaN = missing */
  v: number[];
}

export interface MarineSamples {
  /** model time of the first sample, ms */
  time: number;
  samples: MarineSample[];
}

/** Variables requested from the API, in the order the parser expects them in `current`. */
export const MARINE_CURRENT_VARS = [
  'ocean_current_velocity', 'ocean_current_direction', 'wave_height', 'wave_direction', 'wave_period',
  'swell_wave_height', 'swell_wave_direction', 'swell_wave_period',
] as const;

type Cur = Partial<Record<(typeof MARINE_CURRENT_VARS)[number], number | null>> & { time?: string };
interface Row { latitude?: number; longitude?: number; current?: Cur }

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : NaN);

export function marineSamples(raw: unknown): MarineSamples {
  const rows: Row[] = Array.isArray(raw) ? (raw as Row[]) : raw && typeof raw === 'object' ? [raw as Row] : [];
  const samples: MarineSample[] = [];
  let time = NaN;
  for (const r of rows) {
    const c = r.current;
    if (!c || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue;
    const vel = num(c.ocean_current_velocity);
    const dir = num(c.ocean_current_direction);
    const rad = (dir * Math.PI) / 180;
    const ms = vel / 3.6;
    const wd = num(c.wave_direction);
    const sd = num(c.swell_wave_direction);
    const v = [
      ms * Math.sin(rad), ms * Math.cos(rad),
      num(c.wave_height), Math.sin((wd * Math.PI) / 180), Math.cos((wd * Math.PI) / 180), num(c.wave_period),
      num(c.swell_wave_height), Math.sin((sd * Math.PI) / 180), Math.cos((sd * Math.PI) / 180), num(c.swell_wave_period),
    ];
    if (v.every((x) => Number.isNaN(x))) continue;
    if (Number.isNaN(time) && c.time) time = Date.parse(`${c.time}Z`);
    samples.push({ lat: r.latitude, lon: r.longitude, v });
  }
  return { time: Number.isFinite(time) ? time : Date.now(), samples };
}
