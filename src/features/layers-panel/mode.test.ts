import { describe, expect, it } from 'vitest';
import type { OptionSpec } from '../../layers/types';
import { settingsMode } from './mode';

const opt = (id: string): OptionSpec => ({ id, label: id, type: 'toggle', default: false });

describe('settingsMode', () => {
  it('keeps layers without or with up to two options inline', () => {
    expect(settingsMode({})).toBe('inline');
    expect(settingsMode({ options: [] })).toBe('inline');
    expect(settingsMode({ options: [opt('a'), opt('b')] })).toBe('inline');
  });
  it('moves three or more options to the page', () => {
    expect(settingsMode({ options: [opt('a'), opt('b'), opt('c')] })).toBe('page');
  });
  it('moves layers with a key to the page', () => {
    expect(settingsMode({ keys: [{ id: 'k', required: false }] })).toBe('page');
  });
});
