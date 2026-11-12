import type { LayerDef } from '../../layers/types';

/** Up to this many own options still fit into the row itself. */
export const INLINE_MAX_OPTIONS = 2;

/**
 * Where the settings of a layer live: 'inline' unfolds opacity (plus at most two options) inside the row,
 * 'page' pushes a detail page. Layers with three or more options or a key move to the page automatically.
 */
export function settingsMode(def: Pick<LayerDef, 'options' | 'keys'>): 'inline' | 'page' {
  if (def.keys?.length) return 'page';
  return (def.options?.length ?? 0) > INLINE_MAX_OPTIONS ? 'page' : 'inline';
}
