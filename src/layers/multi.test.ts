import { describe, expect, it } from 'vitest';
import { multiHas, multiValues, toggleMulti } from './multi';

const ALL = ['wind', 'solar', 'gas'];
describe('multi option', () => {
  it('reads all / lists', () => {
    expect(multiValues(undefined)).toBeNull();
    expect(multiValues('all')).toBeNull();
    expect(multiValues('')).toBeNull();
    expect(multiValues('wind,solar')).toEqual(['wind', 'solar']);
  });
  it('multiHas', () => {
    expect(multiHas('all', 'gas')).toBe(true);
    expect(multiHas('wind,solar', 'gas')).toBe(false);
    expect(multiHas('wind,solar', 'solar')).toBe(true);
  });
  it('toggles: first tap picks one, more add, last removal and full set go back to all', () => {
    expect(toggleMulti('all', 'wind', ALL)).toBe('wind');
    expect(toggleMulti('wind', 'solar', ALL)).toBe('wind,solar');
    expect(toggleMulti('wind,solar', 'wind', ALL)).toBe('solar');
    expect(toggleMulti('solar', 'solar', ALL)).toBe('all');
    expect(toggleMulti('wind,solar', 'gas', ALL)).toBe('all');
    expect(toggleMulti('wind', 'all', ALL)).toBe('all');
  });
});
