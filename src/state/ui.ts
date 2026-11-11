// UI state: breakpoint, panels, sheet.
import { computed, signal } from '@preact/signals';
import type { MapEngine } from '../map/types';

export type Breakpoint = 'desktop' | 'mobile';
export type SheetDetent = 'peek' | 'half' | 'full';
export type LeftView = 'layers' | 'catalog' | 'settings';

export const BREAKPOINT_PX = 900;

const initial = (): Breakpoint => (typeof window !== 'undefined' && window.innerWidth < BREAKPOINT_PX ? 'mobile' : 'desktop');
export const breakpoint = signal<Breakpoint>(initial());
export const isMobile = computed(() => breakpoint.value === 'mobile');

export const leftPanelOpen = signal(true);
export const leftView = signal<LeftView>('layers');
export type LeftTab = 'layers' | 'feed';
/** Tab inside the left panel / sheet while the view is 'layers'. */
export const leftTab = signal<LeftTab>('layers');
export const searchOpen = signal(false);
export const shortcutsOpen = signal(false);
/** The running map engine, set by the app shell once the map exists. */
export const mapEngine = signal<MapEngine | null>(null);
export const settingsOpen = signal(false);
export const sheetDetent = signal<SheetDetent>('peek');

/** Follows the 900 px media query; call once at start. */
export function initUi(): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(`(max-width: ${BREAKPOINT_PX - 1}px)`);
  const apply = () => (breakpoint.value = mq.matches ? 'mobile' : 'desktop');
  apply();
  mq.addEventListener('change', apply);
  return () => mq.removeEventListener('change', apply);
}

/** Map position under the mouse pointer (null when it left the map or on touch). Written by app/MapView, throttled. */
export const pointerLngLat = signal<{ lng: number; lat: number } | null>(null);
