import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { composeStyle } from './basemaps';

// An invalid style stops the whole map ("Style is not done loading"): every basemap in both projections must validate.
describe('composeStyle', () => {
  for (const basemap of ['orbis-dark', 'orbis-light', 'orbis-karte', 'satellite'] as const) {
    for (const projection of ['globe', 'mercator'] as const) {
      it(`${basemap} (${projection}) is a valid style`, () => {
        const errors = validateStyleMin(composeStyle({ basemap, labels: true, terminator: true, projection, buildings: true }) as never);
        expect(errors.map((e) => e.message)).toEqual([]);
      });
    }
  }
});
