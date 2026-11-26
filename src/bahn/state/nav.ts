import { computed, signal } from '@preact/signals';
import type { Journey, JourneyOptions, ModeGroup, Stop } from '../data/types';
import { myLocation } from './location';

export type TabId = 'start' | 'abfahrten' | 'merkliste';
export type Screen =
  | { kind: 'search'; target: 'from' | 'to' | 'stop' }
  | { kind: 'journeys' }
  | { kind: 'journey'; journey: Journey }
  | { kind: 'stop'; stop: Stop }
  | { kind: 'trip'; tripId: string; line: string; mode: ModeGroup; headsign: string; /** Haltestelle, von der aus der Lauf geöffnet wurde */ at?: string };
/** Eine geöffnete Seite; `key` hält ihren Zustand, solange sie im Stapel liegt. */
export type Entry = Screen & { key: number };

export const tab = signal<TabId>('start');
export const stack = signal<Entry[]>([]);
let nextKey = 1;
const entry = (screen: Screen): Entry => ({ ...screen, key: nextKey++ });

/**
 * Zurück-Taste und Wischgeste: Jeder geöffnete Bildschirm bekommt einen Eintrag in der Browser-Historie
 * (`state.bn` = Tiefe des Stapels). Zurück im Browser schließt also den obersten Bildschirm.
 * `skip` zählt Historienwechsel, die wir selbst ausgelöst haben und die der Handler nicht noch einmal auswerten soll.
 */
let skip = 0;
const canHistory = typeof window !== 'undefined' && !!window.history;
if (canHistory) {
  history.replaceState({ bn: 0 }, '');
  window.addEventListener('popstate', (e) => {
    if (skip > 0) {
      skip--;
      return;
    }
    const depth = Math.min((e.state as { bn?: number } | null)?.bn ?? 0, stack.value.length);
    stack.value = stack.value.slice(0, depth);
  });
}

export const push = (screen: Screen) => {
  stack.value = [...stack.value, entry(screen)];
  if (canHistory) history.pushState({ bn: stack.value.length }, '');
};
/** Oberster Bildschirm zu: wie die Zurück-Taste. */
export const pop = () => {
  if (!stack.value.length) return;
  stack.value = stack.value.slice(0, -1);
  if (canHistory) {
    skip++;
    history.back();
  }
};
/** Oberster Bildschirm wird durch einen anderen ersetzt (kein zusätzlicher Historieneintrag). */
export const replaceTop = (screen: Screen) => {
  stack.value = [...stack.value.slice(0, -1), entry(screen)];
  if (canHistory) history.replaceState({ bn: stack.value.length }, '');
};
export const goTab = (next: TabId) => {
  const depth = stack.value.length;
  stack.value = [];
  tab.value = next;
  if (canHistory && depth > 0) {
    skip++;
    history.go(-depth);
  }
};

/** Start und Ziel der Suche. Start null = Gerätestandort (wenn bekannt). */
export const from = signal<Stop | null>(null);
export const to = signal<Stop | null>(null);
export const origin = computed<Stop | null>(() => from.value ?? myLocation.value);

/** Zeit und Filter der Verbindungssuche. `time` null = jetzt. */
export const when = signal<{ time: number | null; arriveBy: boolean }>({ time: null, arriveBy: false });
export const modes = signal<ModeGroup[]>([]);
export const journeyOptions = (): JourneyOptions => ({
  time: when.value.time ?? Date.now(),
  arriveBy: when.value.arriveBy,
  modes: modes.value.length ? modes.value : undefined,
});

/** Seite der Haltestelle öffnen. Eine Suche darüber wird durch sie ersetzt. */
export function openStop(stop: Stop) {
  const top = stack.value[stack.value.length - 1];
  if (top?.kind === 'search') replaceTop({ kind: 'stop', stop });
  else if (!(top?.kind === 'stop' && top.stop.id === stop.id)) push({ kind: 'stop', stop });
}

/** Verbindungen zeigen; fehlt der Start oder das Ziel, vorher danach fragen. */
export function openConnections() {
  if (!origin.value) push({ kind: 'search', target: 'from' });
  else if (!to.value) push({ kind: 'search', target: 'to' });
  else push({ kind: 'journeys' });
}

export function swapEnds() {
  const o = origin.value;
  const d = to.value;
  from.value = d;
  to.value = o && o.name !== 'Mein Standort' ? o : null;
}
