import { describe, expect, it } from 'vitest';
import { WindTurbineStore, type RawWindTurbine } from './windturbines';

const raw = (id: string, lng: number, props: Record<string, unknown> = {}): RawWindTurbine => ({ id, lng, lat: 54, props });

describe('wind turbine store', () => {
  it('keeps one entry per turbine and reads the power from the tile strings', () => {
    const s = new WindTurbineStore();
    s.add([raw('1', 8, { output: '4.2000000000000000' }), raw('1', 8, { output: '4.2000000000000000' }), raw('2', 8.1, { output: '0' }), raw('3', 8.2)]);
    expect(s.size).toBe(3);
    expect(s.samples(8).map((t) => t.outputMw)).toEqual([4.2, undefined, undefined]);
  });

  it('puts longitudes next to the view', () => {
    const s = new WindTurbineStore();
    s.add([raw('1', -179.9)]);
    expect(s.samples(179.9)[0]!.lng).toBeCloseTo(180.1);
  });

  it('drops the farthest ones beyond the limit', () => {
    const s = new WindTurbineStore(2);
    s.add([raw('far', 20), raw('a', 8), raw('b', 8.1)]);
    s.prune(8, 54);
    expect(s.samples(8).map((t) => t.id).sort()).toEqual(['a', 'b']);
  });
});
