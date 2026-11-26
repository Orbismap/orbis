// Was die Karte gerade zeigt. Es gibt eine einzige Karte für die ganze App; die jeweils oberste Seite beschreibt ihre
// Szene, die Karte bewegt sich dorthin und meldet Tipps auf Strecken und Halte zurück.
import { createContext } from 'preact';
import { computed, signal } from '@preact/signals';
import { useContext, useEffect, useRef } from 'preact/hooks';
import type { Stop } from '../data/types';

/** Ab dieser Breite gilt das Desktop-Layout (Orbis-Menü, Seite daneben, Karte dahinter). Muss zu app.css passen. */
export const DESKTOP_QUERY = '(min-width: 960px)';
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(DESKTOP_QUERY) : null;
export const isDesktop = signal(!!mq?.matches);
mq?.addEventListener('change', (e) => { isDesktop.value = e.matches; });

/** Breiten am Desktop (px): Orbis-Menü, Seite daneben und der Abstand dazwischen. app.css bekommt sie als Variablen. */
export const DESKTOP = { menu: 222, panel: 360, gap: 8 } as const;
export const menuOpen = signal(true);
/** Die Seite neben dem Menü: am Desktop schließbar, jede Navigation holt sie zurück. */
export const panelOpen = signal(true);
/** Breite (px), um die Menü und Seite die Karte links verdecken; 0 auf dem Handy. */
export const sideCover = computed(() => {
  if (!isDesktop.value) return 0;
  return (menuOpen.value ? DESKTOP.gap + DESKTOP.menu : 0) + (panelOpen.value ? DESKTOP.gap + DESKTOP.panel : 0);
});

export interface MapRoute {
  id: string;
  coords: [number, number][];
  color: string;
  dashed?: boolean;
  /** Zurückgenommen, weil ein anderer Abschnitt hervorgehoben ist. */
  dim?: boolean;
}

export interface MapStop {
  stop: Stop;
  /** start/end: Anfang und Ziel; transfer: Umstieg; via: Zwischenhalt; selected: die geöffnete Haltestelle */
  kind: 'start' | 'end' | 'transfer' | 'via' | 'selected';
  color?: string;
}

export interface Scene {
  routes?: MapRoute[];
  stops?: MapStop[];
  /** Kameraziel: entweder alle Punkte in `fit` zeigen oder `center` mit `zoom`. Ohne beides bleibt der Ausschnitt. */
  fit?: [number, number][];
  center?: [number, number];
  zoom?: number;
  onRoute?: (id: string) => void;
}

export const scene = signal<Scene>({});

/** Wahr in der obersten Seite: Nur sie bestimmt Karte und Rast des Blatts. */
export const ActiveScreen = createContext(true);

/** Setzt die Szene, solange die Seite oben liegt. */
export function useScene(next: Scene): void {
  const active = useContext(ActiveScreen);
  const latest = useRef(next);
  latest.current = next;
  const key = JSON.stringify([next.routes, next.stops, next.fit, next.center, next.zoom]);
  useEffect(() => {
    if (!active) return;
    // der Handler läuft über die Referenz, damit eine neue Funktion pro Rendern die Szene nicht ersetzt
    scene.value = { ...latest.current, onRoute: (id) => latest.current.onRoute?.(id) };
  }, [active, key]);
}
