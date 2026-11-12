import { describe, expect, it } from 'vitest';
import { serializeHash } from '../core/url';
import { currentUrlState } from '../state/url-sync';
import { settings, validateSettings } from '../state/settings';
import { allKeys, getKeyDef, keysByGroup } from './index';
import { hasKey, keySignal, setKey } from './store';
import { buildKeyRegistry } from './registry';
import type { KeyDef } from './types';

const def = (id: string, extra: Partial<KeyDef> = {}): KeyDef => ({ id, name: id, group: 'dienste', unlocks: 'x', url: 'https://x.test', steps: ['a'], ...extra });

describe('key registry', () => {
  it('requires id === file name and rejects duplicates', () => {
    const errs: string[] = [];
    const reg = buildKeyRegistry({ './defs/a.ts': { default: def('a') }, './defs/b.ts': { default: def('zzz') }, './defs/c.ts': {} }, (m) => errs.push(m));
    expect([...reg.keys()]).toEqual(['a']);
    expect(errs).toHaveLength(2);
  });
  it('loads the example definitions and groups them', () => {
    expect(getKeyDef('aisstream')?.group).toBe('verkehr');
    expect(allKeys().length).toBeGreaterThan(0);
    expect(keysByGroup()[0]!.keys.length).toBeGreaterThan(0);
  });
});

describe('key storage', () => {
  it('stores, trims, removes and reacts', () => {
    const s = keySignal('aisstream');
    expect(s.value).toBeUndefined();
    setKey('aisstream', '  abc123  ');
    expect(s.value).toBe('abc123');
    expect(hasKey('aisstream')).toBe(true);
    setKey('aisstream', '');
    expect(s.value).toBeUndefined();
    expect(settings.value.keys.aisstream).toBeUndefined();
  });
  it('never ends up in the URL state', () => {
    setKey('aisstream', 'GEHEIM-SCHLUESSEL-123');
    const url = serializeHash(currentUrlState());
    expect(url).not.toContain('GEHEIM');
    expect(JSON.stringify(currentUrlState())).not.toContain('GEHEIM');
    setKey('aisstream', undefined);
  });
  it('validates the confirmed warnings of persisted settings', () => {
    expect(validateSettings({ confirmedWarnings: ['layer:a', 3] })!.confirmedWarnings).toEqual(['layer:a']);
    expect(validateSettings({})!.confirmedWarnings).toEqual([]);
  });
});
