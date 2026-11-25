// Selected time, live flag, playback and the time range (union of the TimeSpec of all visible layers).
import { computed, effect, signal } from '@preact/signals';
import type { TimeSpec } from '../layers/types';
import { HOUR, MINUTE, clampTime } from '../core/time';
import { nextActive, skipRest, timeTracks } from './time-tracks';

export interface TimeRange { start: number; end: number; step: number; frames?: number[] }

const DEFAULT_REL = { start: -24 * HOUR, end: 72 * HOUR, step: HOUR };

/** Wall clock, ticks every 30 s once startClock() ran. */
export const now = signal(Date.now());
export const live = signal(true);
const picked = signal(Date.now());
export const playing = signal(false);
/** Specs of visible layers, written by layers/runtime. */
export const timeSources = signal<TimeSpec[]>([]);

/** Time the data should show: now while live, otherwise the picked time. */
export const time = computed(() => (live.value ? now.value : picked.value));
export const hasTimeLayers = computed(() => timeSources.value.length > 0);

export const range = computed<TimeRange>(() => {
  const n = now.value;
  const specs = timeSources.value.map((s) => s.range());
  if (!specs.length) return { start: n + DEFAULT_REL.start, end: n + DEFAULT_REL.end, step: DEFAULT_REL.step };
  const frames = [...new Set(specs.flatMap((s) => s.frames ?? []))].sort((a, b) => a - b).map((f) => n + f);
  return {
    start: n + Math.min(...specs.map((s) => s.start)),
    end: n + Math.max(...specs.map((s) => s.end)),
    step: Math.min(...specs.map((s) => s.step ?? HOUR)),
    frames: frames.length ? frames : undefined,
  };
});

export function setTime(t: number): void {
  const r = range.value;
  picked.value = clampTime(t, r.start, r.end);
  live.value = false;
}
export function goLive(): void {
  live.value = true;
  pause();
}
/** Moves one step (dir = ±1); frames win over the regular step. Leaves live mode. */
export function step(dir: 1 | -1): void {
  const r = range.value;
  const cur = time.value;
  let next: number;
  if (r.frames?.length) {
    next = (dir > 0 ? r.frames.find((f) => f > cur + 1) : [...r.frames].reverse().find((f) => f < cur - 1)) ?? (dir > 0 ? r.frames[r.frames.length - 1]! : r.frames[0]!);
  } else next = cur + dir * r.step;
  setTime(next);
}

let playTimer: ReturnType<typeof setInterval> | undefined;
export function play(intervalMs = 450): void {
  if (playing.value) return;
  playing.value = true;
  if (live.value) picked.value = range.value.start;
  live.value = false;
  playTimer = setInterval(() => {
    const r = range.value;
    if (time.value >= r.end - 1) picked.value = r.start;
    else {
      step(1);
      // Ruhe überspringen: liegt die Zeit in einer Pause aller Spuren, geht es zum nächsten Geschehen
      if (skipRest.peek() && timeTracks.peek().length) {
        const to = nextActive(picked.peek());
        if (to !== undefined && to > picked.peek()) picked.value = clampTime(to, r.start, r.end);
      }
    }
  }, intervalMs);
}
export function pause(): void {
  playing.value = false;
  if (playTimer) clearInterval(playTimer);
  playTimer = undefined;
}

let clock: ReturnType<typeof setInterval> | undefined;
/** Starts the 30 s wall clock (idempotent). */
export function startClock(): () => void {
  if (!clock) {
    clock = setInterval(() => (now.value = Date.now()), 30_000);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => !document.hidden && (now.value = Date.now()));
  }
  return () => {
    if (clock) clearInterval(clock);
    clock = undefined;
  };
}

/** Keep the picked time inside the range when layers (and with them the range) change. */
export function watchRange(): () => void {
  return effect(() => {
    const r = range.value;
    const p = picked.peek();
    if (!live.peek() && (p < r.start - MINUTE || p > r.end + MINUTE)) picked.value = clampTime(p, r.start, r.end);
  });
}

// Without a layer that has a time axis there is no timeline: a time picked earlier (arrow keys, link) must not linger
// in the URL and in the next layer. Back to live when the last such layer goes away.
let hadTimeLayers = false;
effect(() => {
  const has = hasTimeLayers.value;
  if (hadTimeLayers && !has) goLive();
  hadTimeLayers = has;
});
