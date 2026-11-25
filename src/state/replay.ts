// Replay mode state: rewatch a past live event as a 3D animation. The playhead is seconds after the event's T-0.
// One loop (requestAnimationFrame) advances it and then calls the frame listeners synchronously, so the camera of the
// extension and the drawing of the stage always use the same instant.
import { computed, signal } from '@preact/signals';
import { autoSpeed, phaseAt } from '../replay/director';
import { findReplay } from '../replay/events';
import type { ReplayEvent } from '../replay/types';
import { clearSelection } from './selection';
import { mapEngine } from './ui';
import { camera, projection, setProjection } from './view';

export const replayEvent = signal<ReplayEvent | null>(null);
/** an event is being loaded */
export const replayLoading = signal(false);
export const replayError = signal<string | null>(null);
/** playhead, seconds after T-0 */
export const replayT = signal(0);
export const replayPlaying = signal(false);
/** manual speed (event seconds per real second) */
export const replaySpeed = signal(1);
/** the director picks the speed per phase */
export const replayAuto = signal(true);
/** counts jumps of the playhead (scrubbing, markers): the camera snaps instead of gliding */
export const replaySeeks = signal(0);
/** the speed in effect now (auto: eased) */
export const replayEffectiveSpeed = signal(1);
/** a vehicle the viewer picked to look at (actor id), null: the director's shot */
export const replayFocus = signal<string | null>(null);
export const setReplayFocus = (id: string | null) => { replayFocus.value = id; };
export const replayPhase = computed(() => {
  const ev = replayEvent.value;
  return ev ? phaseAt(ev, replayT.value) : null;
});

export const REPLAY_SPEEDS = [1, 10, 60, 600, 3600] as const;

type FrameListener = (t: number, dtReal: number) => void;
const listeners = new Set<FrameListener>();
/** Called after every step of the playhead (also when paused: once per frame, with dt 0 it is a no-op for most). Returns the remover. */
export function onReplayFrame(fn: FrameListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

let raf = 0;
let last = 0;
let loadToken = 0;
/** the projection before the replay forced the globe */
let projectionBefore: 'globe' | 'mercator' | null = null;
/** where the map was before the replay took the camera, to fly back to */
let cameraBefore: { lng: number; lat: number; zoom: number; bearing: number; pitch: number } | null = null;

function loop(now: number) {
  const ev = replayEvent.peek();
  if (!ev) { raf = 0; return; }
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (replayPlaying.peek()) {
    const t = replayT.peek();
    const speed = replayAuto.peek() ? autoSpeed(ev, t, replayEffectiveSpeed.peek(), dt) : replaySpeed.peek();
    replayEffectiveSpeed.value = speed;
    const next = Math.min(ev.end, t + dt * speed);
    replayT.value = next;
    if (next >= ev.end) replayPlaying.value = false;
  }
  for (const fn of [...listeners]) fn(replayT.peek(), dt);
}

/** Opens a replay (loads its data) and starts it from the beginning, or from `at` seconds. */
export async function openReplay(id: string, at?: number): Promise<void> {
  const listing = findReplay(id);
  if (!listing) { replayError.value = 'Dieses Ereignis kennen wir nicht.'; return; }
  const token = ++loadToken;
  replayLoading.value = true;
  replayError.value = null;
  try {
    const ev = await listing.load();
    if (token !== loadToken) return;
    if (projectionBefore === null) projectionBefore = projection.peek();
    if (cameraBefore === null) cameraBefore = { ...camera.peek() };
    setProjection('globe');
    replayFocus.value = null;
    replayEvent.value = ev;
    replayT.value = Math.min(ev.end, Math.max(ev.start, at ?? ev.start));
    replayEffectiveSpeed.value = 1;
    replaySeeks.value++;
    replayPlaying.value = true;
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
  } catch (e) {
    if (token !== loadToken) return;
    replayError.value = 'Das Ereignis konnte nicht geladen werden.';
    console.error('[replay] load failed', e);
  } finally {
    if (token === loadToken) replayLoading.value = false;
  }
}

/** Starts a replay from the UI (a card, a list): the card gives way to the animation. */
export function playReplay(id: string, at?: number): void {
  clearSelection();
  void openReplay(id, at);
}

export function closeReplay(): void {
  loadToken++;
  if (projectionBefore) setProjection(projectionBefore);
  projectionBefore = null;
  const back = cameraBefore;
  cameraBefore = null;
  if (back) mapEngine.peek()?.flyTo({ center: [back.lng, back.lat], zoom: back.zoom, bearing: back.bearing, pitch: back.pitch, duration: 1500 });
  replayEvent.value = null;
  replayFocus.value = null;
  replayPlaying.value = false;
  replayLoading.value = false;
  replayError.value = null;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

export function seekReplay(t: number): void {
  const ev = replayEvent.peek();
  if (!ev) return;
  replayT.value = Math.min(ev.end, Math.max(ev.start, t));
  replaySeeks.value++;
}

export function toggleReplay(): void {
  const ev = replayEvent.peek();
  if (!ev) return;
  // at the end, play starts again from the beginning
  if (!replayPlaying.peek() && replayT.peek() >= ev.end) seekReplay(ev.start);
  replayPlaying.value = !replayPlaying.peek();
}

export function setReplaySpeed(s: number): void {
  replaySpeed.value = s;
  replayAuto.value = false;
  replayEffectiveSpeed.value = s;
}

/** A link like `?replay=starship-flight-15` (or `#...&replay=`) opens the replay at start-up. */
export function startReplayFromUrl(): void {
  if (typeof window === 'undefined') return;
  const fromSearch = new URLSearchParams(window.location.search).get('replay');
  const fromHash = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('replay');
  const id = fromSearch ?? fromHash;
  if (id && /^[a-z0-9-]{1,60}$/.test(id) && findReplay(id)) void openReplay(id);
}
