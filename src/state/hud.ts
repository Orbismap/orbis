// Desktop HUD: the left stack of two menus (main list + detail). Widths and visibility live here so that the map
// overlays (legend, timeline) can keep clear of the menus.
import { computed, effect, signal } from '@preact/signals';
import { getJSON, setJSON } from '../core/storage';
import { inspector, place, probe } from './selection';
import { isMobile, leftPanelOpen } from './ui';

/** Bumped to focus the search field of the main menu (Cmd+F). */
export const hudSearchFocus = signal(0);

export const HUD_EDGE = 8;
export const HUD_GAP = 8;
export const HUD_DETAIL_W = 290;
export const HUD_MAIN_MIN = 200;
export const HUD_MAIN_MAX = 480;
export const HUD_MAIN_DEFAULT = 222;
/** Height of the capsule that stays at the top left while the main menu is hidden. */
export const HUD_MINI_H = 40;

const clamp = (n: number) => Math.round(Math.min(HUD_MAIN_MAX, Math.max(HUD_MAIN_MIN, n)));
const validWidth = (raw: unknown): number | undefined => (typeof raw === 'number' && Number.isFinite(raw) ? clamp(raw) : undefined);

/** Width of the main menu, changed by dragging its right edge. */
export const hudMainWidth = signal<number>(getJSON('hud-main-w', 1, validWidth, HUD_MAIN_DEFAULT));
export const setHudMainWidth = (w: number) => (hudMainWidth.value = clamp(w));
effect(() => void setJSON('hud-main-w', 1, hudMainWidth.value));

/** The detail menu was opened for the active Karte (click on a Karte, `k=` in the link). Closed at start. */
export const detailOpen = signal(false);

/** "Orte" pages of the main menu shown in the detail menu: saved places or the route planner. */
export type OrteView = 'places' | 'routes';
export const orteView = signal<OrteView | null>(null);
// picking an object or a place on the map replaces the Orte page (route and saved places stay in their state)
effect(() => {
  if ((inspector.value || probe.value || place.value) && orteView.peek()) orteView.value = null;
});

/** The detail menu shows: a map selection, an Orte page, or the active Karte while it is open. */
export const detailVisible = computed(() => !isMobile.value && (!!inspector.value || !!probe.value || !!orteView.value || detailOpen.value));

/** Right edge of the menu stack plus one gap: where map overlays may start. */
export const hudMapLeft = computed(() => {
  let x = 0;
  if (leftPanelOpen.value) x += hudMainWidth.value + HUD_GAP;
  if (detailVisible.value) x += HUD_DETAIL_W + HUD_GAP;
  return HUD_EDGE + x;
});

/** Closes the Karte detail. The active layers stay on; they are switched off in the main menu. */
export function closeKarteDetail(): void {
  detailOpen.value = false;
}
