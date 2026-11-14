// UI-owned map overlays (probe crosshair, user position) through the public MapEngine API only.
import { effect, untracked, type ReadonlySignal } from '@preact/signals';
import type { LayerSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { mapEngine } from '../../state/ui';

type Specs = (source: string) => LayerSpecification[];

/** Keeps a GeoJSON source + layers (slot "top") in sync with a signal. Re-creates them on every change. */
export function mountOverlay(id: string, data: ReadonlySignal<Feature | FeatureCollection | null>, specs: Specs): () => void {
  const src = `ui-${id}-src`;
  let ids: string[] = [];
  return effect(() => {
    const engine = mapEngine.value;
    const f = data.value;
    if (!engine) return;
    untracked(() => {
      void engine.ready.then(() => {
        engine.remove({ layers: ids, sources: [src] });
        ids = [];
        if (!f) return;
        const fc: FeatureCollection = f.type === 'FeatureCollection' ? f : { type: 'FeatureCollection', features: [f] };
        engine.addSource(src, { type: 'geojson', data: fc });
        for (const l of specs(src)) {
          engine.addLayer(l, 'top');
          ids.push(l.id);
        }
      });
    });
  });
}
