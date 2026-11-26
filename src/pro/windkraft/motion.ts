// How a turbine reacts to the wind (pure): the wind at hub height, the rotor speed it runs at, and the slow turn of the
// nacelle and the rotor towards new values.

/** below this wind at hub height (m/s) the rotor stands */
export const CUT_IN_MS = 3;
/** from this wind on the turbine is switched off */
export const CUT_OUT_MS = 25;
/** the rotor reaches its rated speed here */
const RATED_MS = 11;
/** slowest speed of a running rotor, as a share of the rated one */
const MIN_SHARE = 0.45;
/** exponent of the wind profile (the usual 1/7 power law) */
const SHEAR = 1 / 7;

/** The wind at hub height from the model's wind 10 m above the ground. */
export const hubWind = (speed10Ms: number, hubM: number) => speed10Ms * (Math.max(10, hubM) / 10) ** SHEAR;

/** Rated revolutions per minute: large rotors turn slowly (about 70 m/s at the blade tips). */
export const ratedRpm = (rotorM: number) => Math.min(28, Math.max(7, 1300 / rotorM));

/** Revolutions per minute in a wind at hub height: rising with the wind up to the rated speed, none in a calm or a storm. */
export function rotorRpm(rotorM: number, windMs: number): number {
  if (windMs < CUT_IN_MS || windMs >= CUT_OUT_MS) return 0;
  return ratedRpm(rotorM) * Math.min(1, Math.max(MIN_SHARE, windMs / RATED_MS));
}

/** The shorter way from one direction to another (degrees, -180..180). */
const wayTo = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

/** How far apart two directions are (degrees, 0..180). */
export const angleBetween = (a: number, b: number) => Math.abs(wayTo(a, b));

/** `from` moved by the share `k` of the shorter way to `to` (degrees, result 0..360). */
export function turnTowards(from: number, to: number, k: number): number {
  return (((from + wayTo(from, to) * k) % 360) + 360) % 360;
}
