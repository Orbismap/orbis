import { signal } from '@preact/signals';

/** Layer ids whose row is expanded. */
export const expanded = signal<Set<string>>(new Set());

export function toggleExpanded(id: string): void {
  const next = new Set(expanded.peek());
  if (!next.delete(id)) next.add(id);
  expanded.value = next;
}
