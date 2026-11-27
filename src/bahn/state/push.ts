// Push notifications for saved connections, taken over from the old Orbis Fahrplan. A web app cannot watch a train in the
// background, so the push worker (Orbismap/data, `workers/push`) does: the app hands it the trips, it checks the timetable
// every minute and sends a Web Push at the chosen minutes before the departure.
import { effect, signal } from '@preact/signals';
import { online } from '@/core/online';
import { getJSON, setJSON } from '@/core/storage';
import { DEFAULT_DELAYS_URL } from '../data/delays';
import { watched } from '../data/savedTrips';
import { trips } from './trips';

const BASE = ((import.meta.env.VITE_BAHN_PUSH_URL as string | undefined)?.trim() || DEFAULT_DELAYS_URL).replace(/\/+$/, '');
const TIMEOUT_MS = 15_000;

export type PushState = 'unsupported' | 'off' | 'denied' | 'ready';
export function pushState(): PushState {
  if (BASE === 'off') return 'off';
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return Notification.permission === 'denied' ? 'denied' : 'ready';
}

/** Whether the worker knows the current trips: `waiting` while there is no network or it cannot be reached. */
export const syncState = signal<'idle' | 'sending' | 'done' | 'waiting'>('idle');

/** What the worker was last told, so that a start without a network does not claim that something is missing. */
const SENT_KEY = 'bahn:push-sent';
const fingerprint = (list: ReturnType<typeof watched>) => JSON.stringify([...list].sort((a, b) => a.id.localeCompare(b.id)));
const tzNow = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const alreadySent = () => getJSON(SENT_KEY, 1, (raw) => (typeof raw === 'string' ? raw : undefined), '') === fingerprint(watched(trips.peek(), tzNow()));

const b64uDec = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
  if (!reg) throw new Error('Benachrichtigungen gehen nur in der veröffentlichten App.');
  return reg;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Push-Dienst: ${res.status}`);
  return (await res.json()) as T;
}

/** Asks for the permission (call from a tap) and subscribes. Throws with a readable message. */
export async function enablePush(): Promise<void> {
  const state = pushState();
  if (state === 'unsupported') throw new Error('Dieser Browser kann keine Push-Nachrichten. Auf dem iPhone die App zuerst zum Home-Bildschirm hinzufügen.');
  if (state === 'off') throw new Error('Der Push-Dienst ist abgeschaltet.');
  if (state === 'denied' || (await Notification.requestPermission()) !== 'granted') throw new Error('Benachrichtigungen sind blockiert. Erlaube sie in den Einstellungen.');
  const reg = await registration();
  if (await reg.pushManager.getSubscription()) return;
  try {
    const { key } = await call<{ key: string }>('/key');
    await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uDec(key) as BufferSource });
  } catch {
    throw new Error('Der Push-Dienst ist gerade nicht erreichbar.');
  }
}

async function send(): Promise<void> {
  if (pushState() !== 'ready' || Notification.permission !== 'granted') return;
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return;
  const tz = tzNow();
  const list = watched(trips.peek(), tz);
  syncState.value = 'sending';
  // the worker takes the whole list each time; without trips it forgets the device
  if (list.length) await call('/sync', { subscription: sub.toJSON(), tz, trips: list });
  else await call('/unsubscribe', { endpoint: sub.endpoint });
  setJSON(SENT_KEY, 1, fingerprint(list));
  syncState.value = 'done';
}

let queue: Promise<void> = Promise.resolve();
/** One transfer after the other, so that an older list never overtakes a newer one. */
export function syncPush(): Promise<void> {
  queue = queue.then(send).catch(() => {
    syncState.value = 'waiting';
  });
  return queue;
}

export async function testPush(): Promise<void> {
  await syncPush();
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) throw new Error('Noch nicht angemeldet.');
  await call('/test', { endpoint: sub.endpoint });
}

/** Keeps the worker up to date: at the start, after a change of what is watched, and when the network is back. */
export function startPushSync(): () => void {
  let last: string | undefined;
  let wasOnline = online.peek();
  return effect(() => {
    const key = JSON.stringify(trips.value.map((t) => [t.id, t.notify, t.commute]));
    const back = online.value && !wasOnline;
    wasOnline = online.value;
    if (key === last && !back) return;
    last = key;
    if (online.peek()) void syncPush();
    else if (trips.peek().some((t) => t.notify) && !alreadySent()) syncState.value = 'waiting';
  });
}
