import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../layers/registry';
import { validateKarte } from './store';

describe('registry', () => {
  it('checks id === file name', () => {
    const errors: string[] = [];
    const def = (id: string) => ({ default: { id, category: 'gefahren' } as never });
    const reg = buildRegistry({ './gefahren/erdbeben.ts': def('erdbeben'), './gefahren/falsch.ts': def('anders'), './erde/leer.ts': {} }, (m) => errors.push(m));
    expect([...reg.keys()]).toEqual(['erdbeben']);
    expect(errors).toHaveLength(2);
  });
});

describe('validateKarte', () => {
  const known = (id: string) => id === 'a' || id === 'b';
  it('drops unknown layers, duplicates and repairs fields', () => {
    const k = validateKarte({ id: 'x', name: 'Test', basemap: 'nope', layers: [{ id: 'a', visible: true, opacity: 3 }, { id: 'zzz' }, { id: 'a' }, { id: 'b', visible: false, opacity: 0.4, options: { m: 3 } }], view: { center: [1, 2], zoom: 3 } }, known)!;
    expect(k.basemap).toBe('orbis-dark');
    expect(k.layers).toEqual([{ id: 'a', visible: true, opacity: 1 }, { id: 'b', visible: false, opacity: 0.4, options: { m: 3 } }]);
    expect(k.view).toEqual({ center: [1, 2], zoom: 3 });
  });
  it('rejects junk', () => {
    expect(validateKarte(null, known)).toBeUndefined();
    expect(validateKarte({ id: 1 }, known)).toBeUndefined();
  });
});
