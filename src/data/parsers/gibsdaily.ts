// Shared helper of the daily GIBS layers (not a parser, lives here because every file in a layer folder is a layer).
// Daily satellite products are complete one or two days after the overpass: `lag` is the newest day that is
// reliably there. The timeline offers the last 14 days ending at that day; "live" shows the newest one.
import { computed, effect, type ReadonlySignal } from '@preact/signals';
import { DAY, isoDate } from '../../core/time';
import type { LayerContext, LayerHandle, TimeSpec } from '../../layers/types';
import { gibsLayer, type GibsOptions } from '../../render/raster';

export const FRAME_DAYS = 14;

/** Timeline over the last `days` days, one frame per day, newest = today minus `lag` days. */
export const dailyTime = (lag: number, days = FRAME_DAYS): TimeSpec => ({
  mode: 'frames',
  range: () => ({
    start: -(lag + days - 1) * DAY,
    end: -lag * DAY,
    step: DAY,
    frames: Array.from({ length: days }, (_, k) => -(lag + days - 1 - k) * DAY),
  }),
});

/** ISO day (UTC) of the selected time, never newer than today minus `lag` days. */
export const dailyDate = (ctx: Pick<LayerContext, 'time'>, lag: number): ReadonlySignal<string> =>
  computed(() => isoDate(Math.min(ctx.time.value, Date.now() - lag * DAY)));

const dayFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
/** "9. Nov." for an ISO day. */
export const formatIsoDay = (iso: string): string => dayFmt.format(Date.parse(`${iso}T12:00:00Z`));

export interface GibsDailyOptions extends Omit<GibsOptions, 'date'> {
  lag: number;
  /** Text after "Stand 9. Nov.", e.g. "8-Tage-Mittel". */
  noteSuffix?: string;
}

/** gibsLayer driven by the timeline; reports the observation day in the status note. */
export function gibsDaily(ctx: LayerContext, o: GibsDailyOptions): LayerHandle {
  const { lag, noteSuffix, ...rest } = o;
  const date = dailyDate(ctx, lag);
  const handle = gibsLayer(ctx, { ...rest, date });
  const stop = effect(() => ctx.status({ state: 'ready', note: `Stand ${formatIsoDay(date.value)}${noteSuffix ? ` · ${noteSuffix}` : ''}` }));
  return {
    probe: handle.probe,
    destroy() {
      stop();
      handle.destroy();
    },
  };
}
