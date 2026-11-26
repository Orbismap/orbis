// Geometrie des Blatts auf dem Handy: drei Rasten, in denen es zur Ruhe kommt.
import { signal } from '@preact/signals';

export type Detent = 'peek' | 'half' | 'full';

/** Rast der obersten Seite (setzt `Screen`, ändert der Nutzer durch Ziehen). */
export const detent = signal<Detent>('half');
/** Höhe (px), um die das Blatt die Karte verdeckt; die Karte hält ihren Mittelpunkt darüber. 0 am Desktop. */
export const sheetCover = signal(0);

/** Sichtbare Höhe des Blatts in der kleinen Rast: Griff und Kopf. */
export const PEEK_PX = 148;
/** So viel Karte bleibt in der vollen Rast sichtbar (px). */
const FULL_GAP = 8;
const FLICK = 0.4; // px/ms

/** Oberkante des Blatts je Rast in einem Bereich der Höhe `height`. */
export function sheetTops(height: number): Record<Detent, number> {
  const half = Math.round(height * 0.46);
  return { full: FULL_GAP, half, peek: Math.max(half, height - PEEK_PX) };
}

const ORDER: Detent[] = ['full', 'half', 'peek'];

/** Wohin das losgelassene Blatt geht: ein Wisch zur nächsten Rast in seiner Richtung, sonst zur nächstgelegenen. */
export function snap(top: number, velocity: number, tops: Record<Detent, number>): Detent {
  if (Math.abs(velocity) > FLICK) {
    const ahead = velocity < 0 ? [...ORDER].reverse().find((d) => tops[d] < top) : ORDER.find((d) => tops[d] > top);
    return ahead ?? (velocity < 0 ? 'full' : 'peek');
  }
  return ORDER.reduce((best, d) => (Math.abs(tops[d] - top) < Math.abs(tops[best] - top) ? d : best), ORDER[0]!);
}

/** Tipp auf den Griff: klein → halb → voll → halb. */
export const tapped = (current: Detent): Detent => (current === 'half' ? 'full' : 'half');
