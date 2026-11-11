// Per-layer view of the engine: remembers which map layers/sources a layer added, so that the runtime can reorder
// them inside slots and clean up after a failed mount.
import type { CustomLayerInterface, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { MapEngine, SlotId } from './types';

export interface ScopeRecord {
  layers: { id: string; slot: SlotId }[];
  sources: string[];
}

export function scopeEngine(engine: MapEngine, rec: ScopeRecord): MapEngine {
  const scoped = Object.create(engine) as MapEngine;
  scoped.addSource = (id: string, spec: SourceSpecification) => {
    engine.addSource(id, spec);
    if (!rec.sources.includes(id)) rec.sources.push(id);
  };
  scoped.addLayer = (spec: LayerSpecification, slot: SlotId) => {
    engine.addLayer(spec, slot);
    if (!rec.layers.some((l) => l.id === spec.id)) rec.layers.push({ id: spec.id, slot });
  };
  scoped.addCustomLayer = (layer: CustomLayerInterface, slot: SlotId) => {
    engine.addCustomLayer(layer, slot);
    if (!rec.layers.some((l) => l.id === layer.id)) rec.layers.push({ id: layer.id, slot });
  };
  scoped.remove = (ids) => {
    engine.remove(ids);
    if (ids.layers) rec.layers = rec.layers.filter((l) => !ids.layers!.includes(l.id));
    if (ids.sources) rec.sources = rec.sources.filter((s) => !ids.sources!.includes(s));
  };
  return scoped;
}
