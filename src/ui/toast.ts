// Toasts are for things without a place on the map (location denied, link copied). Everything else is shown in place.
import { signal } from '@preact/signals';

export interface Toast { id: number; text: string; kind: 'info' | 'ok' | 'error'; action?: { label: string; run(): void } }
export const toasts = signal<Toast[]>([]);
let next = 1;

export function dismissToast(id: number): void {
  toasts.value = toasts.peek().filter((t) => t.id !== id);
}

export function toast(text: string, opts: { kind?: Toast['kind']; action?: Toast['action']; ms?: number } = {}): number {
  const id = next++;
  toasts.value = [...toasts.peek().slice(-2), { id, text, kind: opts.kind ?? 'info', action: opts.action }];
  setTimeout(() => dismissToast(id), opts.ms ?? (opts.action ? 7000 : 4000));
  return id;
}
