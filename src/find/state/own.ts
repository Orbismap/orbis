// What one entered oneself, kept in this browser until the monthly extract of OpenStreetMap carries it.
import { signal } from '@preact/signals';
import type { OwnEntry } from '../data/places';
import { isTest } from './osm';

const KEY = `find.osm.own.${isTest ? 'test' : 'live'}`;
/** A month until the next extract, and room to spare. */
const KEEP_MS = 45 * 86_400_000;

function load(): OwnEntry[] {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as OwnEntry[]).filter((e) => Date.now() - e.at < KEEP_MS);
  } catch {
    return [];
  }
}

export const own = signal<OwnEntry[]>(load());

export function addOwn(entry: OwnEntry): void {
  own.value = [...own.peek(), entry];
  try {
    localStorage.setItem(KEY, JSON.stringify(own.peek()));
  } catch {
    /* without storage it is shown as long as the page lives */
  }
}
