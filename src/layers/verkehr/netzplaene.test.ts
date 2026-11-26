// The expressions of the plan are only checked by MapLibre at run time: mount the layer on a stand-in map and validate
// what it adds against the style spec.
import { signal } from '@preact/signals';
import { validateStyleMin, type LayerSpecification, type SourceSpecification, type StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it, vi } from 'vitest';
import { composeStyle } from '../../map/basemaps';
import type { LayerContext, OptionValues } from '../types';
import netzplaene, { netzFile, netzplanCard } from './netzplaene';

vi.mock('../../data/osmfiles', () => ({ osmPmtilesUrl: async (set: string) => `https://osm.test/${set}-2026-12-01.pmtiles` }));
vi.mock('../../map/pmtiles-protocol', () => ({ ensurePmtilesProtocol: async () => {} }));

const settle = () => new Promise((r) => setTimeout(r, 0));

function stage(options: OptionValues) {
  const layers: LayerSpecification[] = [];
  const sources = new Map<string, SourceSpecification>();
  const ml = { getLayer: () => undefined, on: vi.fn(), off: vi.fn(), setFilter: vi.fn(), setLayoutProperty: vi.fn() };
  const map = {
    ml, addSource: (id: string, s: SourceSpecification) => sources.set(id, s), addLayer: (l: LayerSpecification) => layers.push(l), onPick: () => () => {},
    remove: (ids: { layers?: string[]; sources?: string[] }) => {
      for (const id of ids.layers ?? []) layers.splice(layers.findIndex((l) => l.id === id), 1);
      for (const id of ids.sources ?? []) sources.delete(id);
    },
  };
  const chosen = signal(options);
  const ctx = {
    id: 'netzplaene', map, signal: new AbortController().signal, opacity: signal(1), options: chosen, selection: signal(null),
    status: vi.fn(), select: vi.fn(),
  } as unknown as LayerContext;
  return { ctx, chosen, layers, sources };
}
const tilesOf = (sources: Map<string, SourceSpecification>) => [...sources.values()].flatMap((s) => (s.type === 'vector' ? s.tiles ?? [] : []));

describe('netzplaene', () => {
  it('names the file of the chosen network', () => {
    expect(netzFile({ netz: 'region', tram: true })).toBe('netz-region');
    expect(netzFile({ netz: 'stadt', tram: true })).toBe('netz-stadt-tram');
    expect(netzFile({ netz: 'stadt', tram: false })).toBe('netz-stadt');
  });

  it('adds only valid layers, swaps the file with the network and removes all of them again', async () => {
    const { ctx, chosen, layers, sources } = stage({ netz: 'stadt', tram: true, plan: true });
    const handle = await netzplaene.mount(ctx);
    await settle();
    const base = composeStyle({ basemap: 'orbis-light', labels: true, terminator: false, projection: 'mercator' });
    const style: StyleSpecification = { ...base, sources: { ...base.sources, ...Object.fromEntries(sources) }, layers: [...base.layers, ...layers] };
    expect(layers.length).toBeGreaterThan(5);
    expect(validateStyleMin(style).map((e) => e.message)).toEqual([]);
    expect(tilesOf(sources)).toEqual(['pmtiles://https://osm.test/netz-stadt-tram-2026-12-01.pmtiles/{z}/{x}/{y}']);

    const count = layers.length;
    chosen.value = { netz: 'region', tram: true, plan: true };
    await settle();
    expect(layers).toHaveLength(count);
    expect(tilesOf(sources)).toEqual(['pmtiles://https://osm.test/netz-region-2026-12-01.pmtiles/{z}/{x}/{y}']);

    handle.destroy();
    expect(layers).toEqual([]);
    expect(sources.size).toBe(0);
  });

  it('adds nothing when it is closed before the file name is known', async () => {
    const { ctx, layers, sources } = stage({ netz: 'stadt', tram: false, plan: true });
    (await netzplaene.mount(ctx)).destroy();
    await settle();
    expect(layers).toEqual([]);
    expect(sources.size).toBe(0);
  });

  it('describes lines and stations', () => {
    const f = (properties: Record<string, unknown>) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [0, 0] }, properties });
    const part = (id: string) => ({ id, sourceLayer: id, kind: 'line' as const, color: '#000' });
    expect(netzplanCard(f({ id: 1, refs: 'S1', mode: 'sbahn', color: '#008d4f' }), part('lines'))).toMatchObject({ title: 'S1', subtitle: 'S-Bahn / Vorortbahn' });
    expect(netzplanCard(f({ id: 42, name: 'Mitte', refs: 'S1 · U6', rank: 2 }), part('stations'))).toMatchObject({
      title: 'Mitte', subtitle: 'Umsteigebahnhof', links: [{ url: 'https://www.openstreetmap.org/node/42' }],
    });
  });
});
