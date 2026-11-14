import { describe, expect, it } from 'vitest';
import type { TrackObject } from '../../render/tracks';
import { preferFirst } from './adsbview';

const t = (id: string, lng: number): TrackObject => ({ id, lng, lat: 0, props: {} }) as unknown as TrackObject;

describe('preferFirst', () => {
  it('keeps all of the primary list and adds the others by id', () => {
    const out = preferFirst([t('a', 1), t('b', 1)], [t('b', 2), t('c', 2)]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(out.find((x) => x.id === 'b')!.lng).toBe(1);
  });
  it('does not change its inputs and copes with empty lists', () => {
    const a = [t('a', 1)];
    expect(preferFirst([], a)).toEqual(a);
    expect(preferFirst(a, [])).toEqual(a);
    expect(preferFirst(a, [t('a', 9)])).toHaveLength(1);
    expect(a).toHaveLength(1);
  });
});
