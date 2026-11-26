import { formatAge } from '@/core/format';

/** Hinweis über gespeicherten Daten: wie alt sie sind. */
export function SavedNote({ at, now }: { at: number; now?: number }) {
  return <p class="bn-small bn-warn" role="status">Gespeicherte Daten · {formatAge(at, now)}</p>;
}
