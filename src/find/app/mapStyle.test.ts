import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { FOUND_LAYERS, findStyle } from './mapStyle';

describe('map style', () => {
  it('is valid, so no layer is dropped for a name the base style already uses', () => {
    expect(validateStyleMin(findStyle).map((e) => e.message)).toEqual([]);
  });

  it('draws the found places above everything else', () => {
    expect(findStyle.layers.slice(-FOUND_LAYERS.length).map((l) => l.id)).toEqual(FOUND_LAYERS);
  });
});
