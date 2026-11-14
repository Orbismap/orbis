// Desktop HUD: the left stack of two menus (main list + detail). Widths and visibility live here so that the map
// overlays (legend, timeline) can keep clear of the menus.
import { computed, effect, signal } from '@preact/signals';
import { getJSON, setJSON } from '../core/storage';
import { setLayerVisible } from '../karten/store';
import { inspector, probe } from './selection';
import { activeKarte } from './session';
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

/** The detail menu shows: a map selection, the catalog/settings view, or the active Karte while it is open. */
export const detailVisible = computed(() => !isMobile.value && (!!inspector.value || !!probe.value || detailOpen.value));

/** Right edge of the menu stack plus one gap: where map overlays may start. */
export const hudMapLeft = computed(() => {
  let x = 0;
  if (leftPanelOpen.value) x += hudMainWidth.value + HUD_GAP;
  if (detailVisible.value) x += HUD_DETAIL_W + HUD_GAP;
  return HUD_EDGE + x;
});

/** Closes the Karte detail and switches off the layers of the active Karte. */
export function closeKarteDetail(): void {
  const k = activeKarte.peek();
  for (const l of k.layers) if (l.visible) setLayerVisible(k.id, l.id, false);
  detailOpen.value = false;
}
