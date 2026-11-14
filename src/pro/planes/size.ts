/** From this zoom on, the models keep their full minimum size on screen; further out they shrink. */
export const FULL_SIZE_ZOOM = 9;
/** the smallest share of that size (an airliner is then about 8-9 px long) */
export const MIN_SIZE_SCALE = 0.35;
/** the size falls by this power of two per zoom step below the full size zoom */
const OCTAVES_PER_ZOOM = 0.6;

/** How much of the minimum on-screen size of a model is kept at this zoom: 1 from zoom 9 up, then falling gently, never less than 0.35. */
export function sizeScale(zoom: number): number {
  return Math.max(MIN_SIZE_SCALE, Math.min(1, 2 ** ((zoom - FULL_SIZE_ZOOM) * OCTAVES_PER_ZOOM)));
}

/** The selected aircraft is drawn this much larger. */
export const SELECTED_SCALE = 1.5;
/** how long the growing or shrinking takes (ms) */
export const GROW_MS = 200;

/** Progress 0..1 of the growth, moved by `dtMs` towards 1 (selected) or 0. Infinite `dtMs`: jumps. */
export function stepGrow(progress: number, selected: boolean, dtMs: number, durationMs = GROW_MS): number {
  const d = Math.min(1, dtMs / durationMs);
  return Math.max(0, Math.min(1, progress + (selected ? d : -d)));
}

/** The selected aircraft's own size curve (before SELECTED_SCALE): it keeps about 80 % of its size even far out. */
export function selectedSizeScale(zoom: number): number {
  return Math.max(0.8, Math.min(1, 2 ** ((zoom - FULL_SIZE_ZOOM) * 0.15)));
}

/** Factor on the size of an aircraft at this zoom and growth progress: from the normal curve (0) to the selected one (1), eased. */
export function growScale(zoom: number, progress: number): number {
  const e = progress * progress * (3 - 2 * progress);
  const normal = sizeScale(zoom);
  return (normal + (selectedSizeScale(zoom) * SELECTED_SCALE - normal) * e) / normal;
}
