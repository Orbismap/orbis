import { describe, expect, it } from 'vitest';
import { parseTag, placeQuery } from './tags';

describe('tag search', () => {
  it('reads the kind and the query', () => {
    expect(parseTag('ort:Berlin')).toEqual({ tag: 'orte', rest: 'Berlin' });
    expect(parseTag('Orte: Bad Kleinen')).toEqual({ tag: 'orte', rest: 'Bad Kleinen' });
    expect(parseTag('ebene:wind')).toEqual({ tag: 'ebenen', rest: 'wind' });
    expect(parseTag('cmd:')).toEqual({ tag: 'befehle', rest: '' });
    expect(parseTag('karten:')).toEqual({ tag: 'karten', rest: '' });
  });
  it('names a Karte', () => {
    const p = parseTag('wetter:wind');
    expect(typeof p.tag).toBe('object');
    expect(p.rest).toBe('wind');
  });
  it('treats unknown words and coordinates as a plain query', () => {
    expect(parseTag('foo:bar')).toEqual({ rest: 'foo:bar' });
    expect(parseTag('52.5:13.4')).toEqual({ rest: '52.5:13.4' });
    expect(parseTag('berlin')).toEqual({ rest: 'berlin' });
  });
  it('searches places only without a tag or with ort:', () => {
    expect(placeQuery('berlin')).toBe('berlin');
    expect(placeQuery('ort:berlin')).toBe('berlin');
    expect(placeQuery('ebene:wind')).toBe('');
  });
});
