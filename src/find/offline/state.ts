// The offline maps of this device and the download that is running.
import { signal } from '@preact/signals';
import type { Box } from './area';
import { idbStore, type Region } from './db';
import { download, removeRegion, sweep, TooLarge, type Order } from './download';
import { downloadSource, forgetTemplate } from './sources';

export const regions = signal<Region[]>([]);
/** The database cannot be used (private mode of some browsers). */
export const storageBroken = signal(false);
export interface Job { name: string; replaces?: string; done: number; total: number }
export const job = signal<Job | null>(null);
/** How the last download ended, for the screens to show. */
export const result = signal<{ ok: boolean; text: string } | null>(null);
/** Which screen of the offline maps is open. */
export const offlineView = signal<'download' | 'manage' | null>(null);
/** What the main map shows, so that the choice of an area starts there. */
export const lastView = signal<Box | null>(null);

const LOCK = 'find-offline';
/** Only one tab writes at a time, so that clearing leftovers never meets a running download. */
async function locked(task: () => Promise<unknown>, ifFree = false): Promise<void> {
  if (!navigator.locks) await task();
  else await navigator.locks.request(LOCK, { ifAvailable: ifFree }, async (lock) => { if (lock) await task(); });
}

export async function loadRegions(): Promise<void> {
  try {
    regions.value = (await idbStore.regions()).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  } catch {
    storageBroken.value = true;
  }
}

export async function initOffline(): Promise<void> {
  await loadRegions();
  if (!storageBroken.peek() && !job.peek()) await locked(() => sweep(idbStore), true).catch(() => {});
}

let running: AbortController | undefined;
export const cancelDownload = () => running?.abort();

const explain = (e: unknown): string => {
  if (e instanceof TooLarge) return e.message;
  if (e instanceof DOMException && e.name === 'QuotaExceededError') return 'Der Speicher des Geräts reicht nicht.';
  return 'Download fehlgeschlagen. Prüfe deine Verbindung und versuche es noch einmal.';
};

/** Starts a download; it goes on while the person does something else in the app. */
export async function startDownload(order: Order): Promise<void> {
  if (job.peek()) return;
  const ctl = (running = new AbortController());
  const base = { name: order.name, replaces: order.replaces?.id };
  job.value = { ...base, done: 0, total: 1 };
  result.value = null;
  // asks the browser not to clear the maps when space runs short
  void navigator.storage?.persist?.().catch(() => false);
  forgetTemplate();
  try {
    await locked(() => download(order, idbStore, downloadSource, { signal: ctl.signal, onProgress: (done, total) => (job.value = { ...base, done, total }) }));
    result.value = { ok: true, text: `„${order.name}“ ist jetzt offline verfügbar.` };
  } catch (e) {
    const kept = order.replaces ? ' Die bisherige Karte bleibt erhalten.' : '';
    result.value = { ok: false, text: (ctl.signal.aborted ? 'Download abgebrochen.' : explain(e)) + kept };
  } finally {
    job.value = null;
    await loadRegions();
  }
}

export async function deleteRegion(region: Region): Promise<void> {
  try {
    await removeRegion(region, idbStore);
  } catch {
    result.value = { ok: false, text: 'Löschen fehlgeschlagen.' };
  }
  await loadRegions();
}
