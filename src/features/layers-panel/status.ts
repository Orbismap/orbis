import { formatAge, formatCompact } from '../../core/format';
import { HOUR, MINUTE } from '../../core/time';
import type { Cadence, LayerStatus } from '../../layers/types';

/** How old data may get before the age is flagged (amber): a few cycles of the layer's cadence. */
const STALE: Record<Cadence, number> = { live: 3 * MINUTE, minutes: 30 * MINUTE, hourly: 3 * HOUR, daily: 36 * HOUR, static: Infinity };

export interface RowStatus { count?: string; age?: string; stale?: boolean; state: LayerStatus['state'] | 'idle'; label: string }

export function rowStatus(st: LayerStatus | undefined, cadence: Cadence, now: number): RowStatus {
  if (!st) return { state: 'idle', label: '' };
  const age = st.updatedAt ? formatAge(st.updatedAt, now) : undefined;
  const stale = st.updatedAt ? now - st.updatedAt > STALE[cadence] : false;
  if (st.state === 'loading') return { state: 'loading', label: 'lädt', age, stale };
  if (st.state === 'error') return { state: 'error', label: 'Fehler', age, stale };
  if (st.state === 'empty') return { state: 'empty', label: 'leer', age, stale };
  const count = st.count !== undefined ? formatCompact(st.count) : undefined;
  return { state: 'ready', count, age, stale, label: [count, age].filter(Boolean).join(', ') };
}
