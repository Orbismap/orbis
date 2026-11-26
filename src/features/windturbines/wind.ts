// The wind at the turbines: the 10 m wind of the ICON overview at the selected time, the same grids as the wind particles
// (layer `stroemung`) and shared with them. Loaded only between `start` and `stop`, i.e. while turbines are published.
import { bracketTime, sampleGrid } from '../../render/gl/grid';
import { followLatest } from '../../render/gl/latest';
import { acquireStore } from '../../render/gl/store';
import type { WindTurbineSample } from '../../ext/types';

type Held = ReturnType<typeof acquireStore>;
type Wind = NonNullable<WindTurbineSample['wind']>;

/** Speed and the direction the wind comes from (degrees from north) of a wind vector (u east, v north, m/s). */
export const windOf = (u: number, v: number): Wind => ({ speedMs: Math.hypot(u, v), fromDeg: ((Math.atan2(u, v) * 180) / Math.PI + 180) % 360 });

/** `changed`: the grids of a (new) model run have arrived. */
export function turbineWind(signal: AbortSignal, changed: () => void) {
  let stopFollowing: (() => void) | undefined;
  let held: Held | undefined;
  let pending: Held | undefined;
  let unsubscribe: (() => void) | undefined;

  // a new run replaces the old one only once its grids are there
  const use = (latest: Parameters<Parameters<typeof followLatest>[1]>[0]) => {
    unsubscribe?.();
    pending?.release();
    const next = (pending = acquireStore(latest, ['u', 'v'], 0));
    const ready = () => {
      if (pending !== next || !next.store.overview) return;
      pending = undefined;
      held?.release();
      held = next;
      changed();
    };
    unsubscribe = next.store.subscribe(ready);
    ready();
  };

  return {
    start() {
      stopFollowing ??= followLatest(signal, use, () => {});
    },
    stop() {
      stopFollowing?.();
      unsubscribe?.();
      pending?.release();
      held?.release();
      stopFollowing = unsubscribe = pending = held = undefined;
    },
    /** The wind at a place at time `t` (ms; outside the model run: its first or last step); undefined while nothing is loaded. */
    at(t: number, lng: number, lat: number): Wind | undefined {
      const overview = held?.store.overview;
      if (!held || !overview) return undefined;
      const br = bracketTime(held.store.latest.times, t);
      const [fu, fv] = overview.fields;
      const u = sampleGrid(fu!, br, lng, lat);
      const v = sampleGrid(fv!, br, lng, lat);
      return u === undefined || v === undefined ? undefined : windOf(u, v);
    },
  };
}
