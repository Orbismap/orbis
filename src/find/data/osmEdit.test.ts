import { describe, expect, it } from 'vitest';
import { authorizeUrl, challengeOf, changesetXml, entryTags, existingIn, nearestOf, nodeXml, randomText, withinReach, type MapJson } from './osmEdit';

describe('request bodies', () => {
  it('names the app and what was done', () => {
    expect(changesetXml('Fahrradständer ergänzt')).toBe('<osm><changeset><tag k="created_by" v="Orbis Find"/><tag k="comment" v="Fahrradständer ergänzt"/></changeset></osm>');
  });

  it('places the node and escapes what was typed', () => {
    expect(nodeXml('12', [13.4132001234, 52.5219], { amenity: 'bicycle_parking', note: 'a "b" <c> & d' })).toBe(
      '<osm><node changeset="12" lat="52.5219000" lon="13.4132001"><tag k="amenity" v="bicycle_parking"/><tag k="note" v="a &#34;b&#34; &#60;c&#62; &#38; d"/></node></osm>',
    );
  });

  it('leaves empty fields out and keeps the tags of the kind', () => {
    expect(entryTags({ amenity: 'bicycle_parking' }, { covered: '', capacity: ' 6 ', amenity: 'bench' })).toEqual({ amenity: 'bicycle_parking', capacity: '6' });
  });
});

describe('sign-in', () => {
  it('asks for editing only, with PKCE', () => {
    const url = new URL(authorizeUrl('https://osm.example', 'id', 'http://127.0.0.1:5183/find/oauth.html', 's', 'c'));
    expect(url.pathname).toBe('/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({ response_type: 'code', client_id: 'id', redirect_uri: 'http://127.0.0.1:5183/find/oauth.html', scope: 'write_api', state: 's', code_challenge: 'c', code_challenge_method: 'S256' });
  });

  it('derives the challenge of the specification', async () => {
    // the example of RFC 7636
    expect(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(randomText()).toMatch(/^[\w-]{43}$/);
  });
});

describe('what is there', () => {
  const base = { amenity: 'bicycle_parking' };
  const json: MapJson = {
    elements: [
      { type: 'node', id: 1, lat: 50, lon: 8, tags: { amenity: 'bicycle_parking' } },
      { type: 'node', id: 2, lat: 50, lon: 8.001 },
      { type: 'node', id: 3, lat: 50.001, lon: 8.001 },
      { type: 'node', id: 4, lat: 50.5, lon: 8, tags: { amenity: 'bench' } },
      { type: 'way', id: 5, nodes: [2, 3, 2], tags: { amenity: 'bicycle_parking', capacity: '4' } },
      { type: 'relation', id: 6, tags: { amenity: 'bicycle_parking' } },
    ],
  };

  it('are the nodes and areas of the same kind', () => {
    expect(existingIn(json, base)).toEqual([{ key: 'n1', lng: 8, lat: 50 }, { key: 'w5', lng: 8.001, lat: 50.0005 }]);
    expect(existingIn({}, base)).toEqual([]);
  });

  it('measures how close the nearest is', () => {
    const list = existingIn(json, base);
    expect(nearestOf(list, [8, 50.00003])).toBeCloseTo(3.3, 0);
    expect(nearestOf([], [8, 50])).toBe(Infinity);
  });
});

describe('reach', () => {
  it('is wider with a poor position, but not without bound', () => {
    expect(withinReach(100, 0)).toBe(true);
    expect(withinReach(101, 0)).toBe(false);
    expect(withinReach(120, 25)).toBe(true);
    expect(withinReach(151, 5000)).toBe(false);
  });
});
