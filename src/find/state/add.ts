// Adding an object of the kind looked for: where it goes, what is known about it, what is mapped there already, and sending it.
import { signal } from '@preact/signals';
import type { LngLat } from '@/core/geo';
import { entryTags, type Existing, type Tags } from '../data/osmEdit';
import { metres } from '../data/places';
import { kind } from './finder';
import { LOOK_AROUND_M, SignedOut, createNode, fetchExisting, finishSignIn, signIn, token } from './osm';
import { addOwn } from './own';
import { manual, position } from './sensors';

export interface Draft { lng: number; lat: number; values: Tags }

/** The entry being made; null: none. */
export const draft = signal<Draft | null>(null);
/** What OpenStreetMap has around the draft right now. */
export const existing = signal<{ state: 'loading' | 'ready' | 'error'; list: Existing[] }>({ state: 'loading', list: [] });
export const sending = signal<{ state: 'idle' | 'sending' } | { state: 'error'; text: string } | { state: 'done'; id: number }>({ state: 'idle' });

let lookedAt: LngLat | undefined;
let looking: AbortController | undefined;

/** Reads what is mapped around the draft, anew once it has moved out of the middle of what was read. */
export function lookAround(again = false): void {
  const d = draft.peek(), add = kind.add;
  if (!d || !add) return;
  if (!again && lookedAt && metres(lookedAt, [d.lng, d.lat]) < LOOK_AROUND_M / 2) return;
  looking?.abort();
  const ctl = (looking = new AbortController());
  lookedAt = [d.lng, d.lat];
  existing.value = { state: 'loading', list: existing.peek().list };
  fetchExisting(lookedAt, add.tags, ctl.signal).then(
    (list) => { if (!ctl.signal.aborted) existing.value = { state: 'ready', list }; },
    () => {
      if (ctl.signal.aborted) return;
      lookedAt = undefined;
      existing.value = { state: 'error', list: [] };
    },
  );
}

function begin(next: Draft): void {
  lookedAt = undefined;
  existing.value = { state: 'loading', list: [] };
  sending.value = { state: 'idle' };
  draft.value = next;
}

/** Starts where one stands; without an own position there is nothing to add. */
export function startAdding(): void {
  const here = position.peek();
  if (here && manual.peek() === null && kind.add) begin({ lng: here.lng, lat: here.lat, values: {} });
}

export function stopAdding(): void {
  looking?.abort();
  draft.value = null;
}

export function moveDraft([lng, lat]: LngLat): void {
  const d = draft.peek();
  if (d) draft.value = { ...d, lng, lat };
}

export function setValue(key: string, value: string): void {
  const d = draft.peek();
  if (d) draft.value = { ...d, values: { ...d.values, [key]: value } };
}

/** Signs in first if needed; the draft comes along and is sent with a further tap. */
export async function submit(): Promise<void> {
  const d = draft.peek(), add = kind.add;
  if (!d || !add || sending.peek().state === 'sending') return;
  sending.value = { state: 'sending' };
  try {
    if (!token.peek()) return await signIn(d);
    const tags = entryTags(add.tags, d.values);
    const id = await createNode([d.lng, d.lat], tags, add.comment);
    addOwn({ set: kind.set, lng: d.lng, lat: d.lat, properties: add.properties(tags, id), at: Date.now() });
    sending.value = { state: 'done', id };
  } catch (error) {
    sending.value = { state: 'error', text: error instanceof SignedOut ? 'Die Anmeldung ist abgelaufen. Melde dich neu an.' : 'Das hat nicht geklappt. Prüfe auf der Karte, ob der Eintrag schon da ist.' };
    lookAround(true);
  }
}

/** On start: back from signing in, the draft is open again. */
export async function resumeAdding(): Promise<void> {
  const back = await finishSignIn();
  const carried = back?.carry as Draft | undefined;
  if (!back || !carried || !Number.isFinite(carried.lng) || !Number.isFinite(carried.lat)) return;
  begin(carried);
  if (!back.signedIn) sending.value = { state: 'error', text: 'Die Anmeldung wurde nicht abgeschlossen.' };
}
