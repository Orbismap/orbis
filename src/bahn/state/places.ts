import { signal } from '@preact/signals';
import { getJSON, setJSON } from '@/core/storage';
import type { Stop } from '../data/types';

/** Gemerkt wird eine Haltestelle oder eine Strecke. */
export type Saved = { kind: 'stop'; stop: Stop } | { kind: 'route'; from: Stop; to: Stop };

export const savedKey = (s: Saved): string => (s.kind === 'stop' ? `s|${s.stop.id}` : `r|${s.from.id}|${s.to.id}`);

const isStop = (v: unknown): v is Stop => {
  const s = v as Stop | null;
  return !!s && typeof s.id === 'string' && typeof s.name === 'string' && Number.isFinite(s.lat) && Number.isFinite(s.lng);
};
const validate = (raw: unknown): Saved[] | undefined =>
  Array.isArray(raw)
    ? raw.filter((e): e is Saved => (e?.kind === 'stop' && isStop(e.stop)) || (e?.kind === 'route' && isStop(e.from) && isStop(e.to)))
    : undefined;

function persisted(key: string, limit: number) {
  const list = signal<Saved[]>(getJSON(key, 1, validate, []));
  const write = (next: Saved[]) => {
    list.value = next.slice(0, limit);
    setJSON(key, 1, list.value);
  };
  return {
    list,
    has: (item: Saved) => list.value.some((e) => savedKey(e) === savedKey(item)),
    add: (item: Saved) => write([item, ...list.value.filter((e) => savedKey(e) !== savedKey(item))]),
    remove: (item: Saved) => write(list.value.filter((e) => savedKey(e) !== savedKey(item))),
    toggle(item: Saved) {
      if (this.has(item)) this.remove(item);
      else this.add(item);
    },
  };
}

/** Favoriten (Merkliste) und zuletzt Gesuchtes. */
export const favorites = persisted('bahn:favorites', 50);
export const recents = persisted('bahn:recents', 8);
