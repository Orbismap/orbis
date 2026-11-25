// Spuren unter der Zeitleiste: eine Ebene meldet je Gruppe (z. B. Tierart), wann sich etwas tut und wann Ruhe ist.
// Die Zeitleiste zeigt sie als dünne Streifen und kann die Ruhe beim Abspielen überspringen.
import { computed, signal } from '@preact/signals';

export interface TimeSpan { start: number; end: number }
export interface TimeTrack {
  id: string;
  label: string;
  color: string;
  /** Zeiten, in denen etwas passiert (ms); dazwischen ist Ruhe. */
  active: TimeSpan[];
}

const byLayer = signal<Record<string, TimeTrack[]>>({});
export const timeTracks = computed(() => Object.values(byLayer.value).flat());

export function setTimeTracks(layerId: string, tracks: TimeTrack[] | null): void {
  const next = { ...byLayer.peek() };
  if (tracks) next[layerId] = tracks;
  else delete next[layerId];
  byLayer.value = next;
}

/** Ruhephasen beim Abspielen überspringen (nur wirksam, solange Spuren da sind). */
export const skipRest = signal(false);

/** Frühester Zeitpunkt ab `t`, an dem sich in irgendeiner Spur etwas tut (t selbst, wenn schon etwas passiert); undefined: nie mehr. */
export function nextActive(t: number): number | undefined {
  let best: number | undefined;
  for (const tr of timeTracks.peek()) {
    for (const s of tr.active) {
      if (s.end <= t) continue;
      const at = Math.max(s.start, t);
      if (best === undefined || at < best) best = at;
      break;
    }
  }
  return best;
}
