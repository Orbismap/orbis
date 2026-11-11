import type { LayerDef } from './types';

/** Identity helper that gives layer files full type checking. */
export const defineLayer = (d: LayerDef): LayerDef => d;
