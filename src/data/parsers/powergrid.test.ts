import { describe, expect, it } from 'vitest';
import { buildPowerSamples, PowerGridStore } from './powergrid';

const line = (id: string, points: [number, number][], props: Record<string, unknown> = {}) => ({ id, points, props: { voltage: 110, type: 'line', location: 'overhead', ...props } });

describe('power channel samples', () => {
  const pts: [number, number][] = [[13, 52], [13.01, 52]];

  it('keeps towers once and passes their tags on', () => {
    const t = { id: '1', lng: 13, lat: 52, props: { structure: 'lattice' } };
    const out = buildPowerSamples([t, t], [], 13);
    expect(out).toEqual([{ kind: 'tower', id: '1', lng: 13, lat: 52, tags: { structure: 'lattice' } }]);
  });

  it('drops buried, disused and unfinished lines and towers', () => {
    const out = buildPowerSamples(
      [{ id: '1', lng: 13, lat: 52, props: { disused: true } }],
      [line('a', pts, { location: 'underground' }), line('b', pts, { type: 'cable' }), line('c', pts, { construction: true }), line('d', pts, { line: 'busbar' })],
    );
    expect(out).toEqual([]);
  });

  it('carries voltage and circuits, and drops the copy of a way a second tile holds', () => {
    const out = buildPowerSamples([], [line('a', pts, { circuits: 2 }), line('a', pts, { circuits: 2 }), line('a', [pts[0]!, [13.005, 52]])]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: 'line', id: 'a', voltageKv: 110, color: '#9BE564', circuits: 2 });
  });

  it('puts longitudes next to the viewport, across the date line', () => {
    const out = buildPowerSamples([{ id: '1', lng: -179.9, lat: 0, props: {} }], [line('a', [[179.9, 0], [-179.9, 0]])], 180);
    expect(out[0]).toMatchObject({ lng: 180.1 });
    expect((out[1] as { points: [number, number][] }).points).toEqual([[179.9, 0], [180.1, 0]]);
  });
});

describe('power grid store', () => {
  const tower = (id: string, lng: number) => ({ id, lng, lat: 52, props: {} });
  const way = (id: string, a: number, b: number) => line(id, [[a, 52], [b, 52]]);

  it('keeps what an earlier scan saw when the tiles are gone', () => {
    const store = new PowerGridStore();
    store.add([tower('1', 13), tower('2', 13.01)], [way('w', 13, 13.01)]);
    store.add([tower('2', 13.01), tower('3', 13.02)], [way('w', 13.01, 13.02)]);
    const out = store.samples(13);
    expect(out.filter((s) => s.kind === 'tower').map((s) => s.id).sort()).toEqual(['1', '2', '3']);
    expect(out.filter((s) => s.kind === 'line')).toHaveLength(2);
  });

  it('drops what lies farthest from the view first, when over the limit', () => {
    const store = new PowerGridStore(2, 1);
    store.add([tower('near', 13), tower('mid', 13.1), tower('far', 14)], [way('a', 13, 13.01), way('b', 14, 14.01)]);
    store.prune(13, 52);
    const out = store.samples(13);
    expect(out.filter((s) => s.kind === 'tower').map((s) => s.id).sort()).toEqual(['mid', 'near']);
    expect(out.filter((s) => s.kind === 'line').map((s) => s.id)).toEqual(['a']);
  });

  it('forgets everything on clear', () => {
    const store = new PowerGridStore();
    store.add([tower('1', 13)], [way('w', 13, 13.01)]);
    store.clear();
    expect(store.samples(13)).toEqual([]);
  });
});
