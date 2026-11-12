// Key storage: `settings.keys` in localStorage only. Never part of the URL state, never logged.
import { computed, type ReadonlySignal } from '@preact/signals';
import { settings, updateSettings } from '../state/settings';

const cache = new Map<string, ReadonlySignal<string | undefined>>();

/** Reactive value of a key; undefined while unset. */
export function keySignal(id: string): ReadonlySignal<string | undefined> {
  let s = cache.get(id);
  if (!s) cache.set(id, (s = computed(() => settings.value.keys[id] || undefined)));
  return s;
}

/** Stores (trimmed) or removes (undefined or empty) a key. */
export function setKey(id: string, value: string | undefined): void {
  const keys = { ...settings.peek().keys };
  const v = value?.trim();
  if (v) keys[id] = v;
  else delete keys[id];
  updateSettings({ keys });
}

export const hasKey = (id: string): boolean => !!settings.value.keys[id];
