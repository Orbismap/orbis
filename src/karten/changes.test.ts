import { describe, expect, it } from 'vitest';
import { discardModifications, isModified } from './changes';
import type { Karte } from './types';

const L = (id: string, visible = true, opacity = 1) => ({ id, visible, opacity });
const std: Karte = {
  id: 's', name: 'Std', icon: 'cloud', color: '#fff', builtin: true, basemap: 'orbis-dark', labels: true, terminator: false,
  layers: [L('a'), L('b', false), L('c', false, 0.8)],
  themes: [{ id: 't', title: 'T', icon: 'layers', layers: ['a', 'b', 'c', 'd'] }],
};
const edit = (p: Partial<Karte>): Karte => ({ ...structuredClone(std), ...p });

describe('isModified', () => {
  it('ignores what a view remembers silently', () => {
    expect(isModified(structuredClone(std), std)).toBe(false);
    const k = edit({ layers: [L('d'), L('a', false), L('b', true), { ...L('c', true, 0.8), options: { m: 1 } }], view: { center: [1, 2], zoom: 3 } });
    expect(isModified(k, std)).toBe(false);
  });
  it('counts a rebuild', () => {
    expect(isModified(edit({ layers: [...std.layers, L('x')] }), std)).toBe(true);
    expect(isModified(edit({ layers: [L('b', false), L('a'), L('c', false, 0.8)] }), std)).toBe(true);
    expect(isModified(edit({ layers: [L('a', true, 0.5), L('b', false), L('c', false, 0.8)] }), std)).toBe(true);
    expect(isModified(edit({ basemap: 'satellite' }), std)).toBe(true);
    expect(isModified(edit({ labels: false }), std)).toBe(true);
    expect(isModified(edit({ name: 'Anders' }), std)).toBe(true);
  });
  it('discard removes only the rebuild', () => {
    const k = edit({ basemap: 'satellite', layers: [L('x'), L('d', true, 0.4), L('b', true, 0.3), L('a', false), L('c', false, 0.8)] });
    const d = discardModifications(k, std);
    expect(isModified(d, std)).toBe(false);
    expect(d.layers.map((l) => [l.id, l.visible, l.opacity])).toEqual([['d', true, 1], ['a', false, 1], ['b', true, 1], ['c', false, 0.8]]);
  });
});
