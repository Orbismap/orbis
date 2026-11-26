import { formatTime } from '@/core/format';
import { MINUTE } from '@/core/time';
import type { Time } from '../data/types';

export const clock = (t: number): string => formatTime(t);

/** "23 min" / "1 h 05 min" */
export function duration(ms: number): string {
  const m = Math.max(0, Math.round(ms / MINUTE));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** "jetzt", "in 5 min", "in 1 h 05" für die Abfahrtsliste. */
export function inMinutes(t: number, now = Date.now()): string {
  const m = Math.round((t - now) / MINUTE);
  if (m <= 0) return 'jetzt';
  return m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** "+4" / "−2" / "" – Verspätung nur, wenn sie bekannt und nicht null ist. */
export function delayText(time: Time): string {
  const d = time.delayMin;
  if (d == null || d === 0) return '';
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`;
}

/** Wert für Farbe: late (ab 2 min), ok (pünktlich bei bekannter Echtzeit), unknown. */
export function delayState(time: Time): 'late' | 'ok' | 'unknown' {
  const d = time.delayMin;
  if (d == null) return 'unknown';
  return d >= 2 ? 'late' : 'ok';
}

/** Entfernung "320 m" / "1,4 km" (Meter auf 10 gerundet). */
export function distance(km: number): string {
  return km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km.toFixed(1).replace('.', ',')} km`;
}
