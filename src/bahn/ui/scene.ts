import { signal } from '@preact/signals';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import type { MapMarker, MapRoute } from './NetMap';

/** Ab dieser Breite gilt das Desktop-Layout (Leiste, Panel, Karte nebeneinander). Muss zu app.css passen. */
export const DESKTOP_QUERY = '(min-width: 960px)';
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(DESKTOP_QUERY) : null;
export const isDesktop = signal(!!mq?.matches);
mq?.addEventListener('change', (e) => { isDesktop.value = e.matches; });

/**
 * Was die Karte gerade zeigt. Auf dem Handy rendert jeder Bildschirm seine eigene Karte (im ziehbaren Blatt); auf dem
 * Desktop gibt es eine einzige Karte neben dem Panel, und die Bildschirme beschreiben nur ihre Szene.
 */
export interface Scene {
  center?: [number, number];
  zoom?: number;
  me?: [number, number] | null;
  markers?: MapMarker[];
  routes?: MapRoute[];
  fit?: boolean;
  /** Nur Handy: Karte im Blatt bedienbar (Start) oder nur zur Ansicht. */
  interactive?: boolean;
  onMarker?: (id: string) => void;
}

export const scene = signal<Scene>({});

/**
 * Meldet die Szene des Bildschirms an die Desktop-Karte; auf dem Handy ohne Wirkung. Der Marker-Handler wird über
 * eine stabile Funktion weitergereicht, damit eine neue Funktion pro Render nicht jedes Mal die Szene ersetzt.
 */
export function useScene(next: Scene): void {
  const latest = useRef(next.onMarker);
  latest.current = next.onMarker;
  const onMarker = useCallback((id: string) => latest.current?.(id), []);
  const key = JSON.stringify([next.center, next.zoom, next.me, next.markers, next.routes, next.fit]);
  useEffect(() => {
    if (isDesktop.value) scene.value = { ...next, onMarker: next.onMarker ? onMarker : undefined };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, !!next.onMarker, isDesktop.value]);
}
