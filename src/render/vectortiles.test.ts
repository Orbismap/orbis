import { signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import { validateStyleMin, type StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { LayerContext } from '../layers/types';
import { osmPlantFilter, osmPlantParts } from '../data/oimPlants';
import { vectorTileLayer } from './vectortiles';
import stromnetz from '../layers/infrastruktur/stromnetz';
import telekomnetz from '../layers/infrastruktur/telekomnetz';
import vermittlungsstellen from '../layers/infrastruktur/vermittlungsstellen';
import oelgasleitungen from '../layers/infrastruktur/oelgasleitungen';
import wassernetz from '../layers/infrastruktur/wassernetz';

/** Mounts a layer against a recording fake engine and returns what it would add to the map. */
async function specsOf(def: Pick<typeof stromnetz, 'id' | 'options' | 'mount'>) {
  const sources: Record<string, unknown> = {};
  const layers: Record<string, unknown>[] = [];
  const ml = { getLayer: () => undefined, setFilter() {}, on() {}, off() {}, getSource: () => undefined };
  const engine = {
    ml, addSource: (id: string, s: unknown) => { sources[id] = s; }, addLayer: (l: Record<string, unknown>) => { layers.push(l); },
    remove() {}, onPick: () => () => {},
  };
  const ctx = {
    id: def.id, map: engine, signal: new AbortController().signal, opacity: signal(1), options: signal(Object.fromEntries((def.options ?? []).map((o) => [o.id, o.default]))),
    time: signal(0), status() {}, selection: signal(null), select() {},
  } as unknown as LayerContext;
  const handle = await def.mount(ctx);
  handle.destroy();
  return { sources, layers };
}

describe('OpenInfraMap layers', () => {
  for (const def of [stromnetz, telekomnetz, vermittlungsstellen, oelgasleitungen, wassernetz]) {
    it(`${def.id}: layer specs are a valid style`, async () => {
      const { sources, layers } = await specsOf(def);
      expect(layers.length).toBeGreaterThan(1);
      const style = { version: 8, sources: sources as StyleSpecification['sources'], layers: layers as StyleSpecification['layers'] } as StyleSpecification;
      expect(validateStyleMin(style).map((e) => e.message)).toEqual([]);
    });
  }
  for (const fuel of ['all', 'wind', 'solar', 'hydro', 'biomass', 'other', 'storage']) {
    it(`kraftwerke (OSM, Energieträger ${fuel}): plant parts are a valid style`, async () => {
      const def = {
        id: 'kw', options: undefined,
        mount: (ctx: LayerContext) => vectorTileLayer(ctx, { tiles: 'https://x/{z}/{x}/{y}.pbf', attribution: 'x', parts: osmPlantParts(osmPlantFilter(fuel, 5)), describe: () => ({ title: 'x', facts: [] }) }),
      };
      const { sources, layers } = await specsOf(def);
      const style = { version: 8, sources: sources as StyleSpecification['sources'], layers: layers as StyleSpecification['layers'] } as StyleSpecification;
      expect(layers.length).toBeGreaterThan(3);
      expect(validateStyleMin(style).map((e) => e.message)).toEqual([]);
    });
  }
});
