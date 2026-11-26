import { describe, expect, it } from 'vitest';
import { POI_GLYPHS } from '@/render/poi-icon-paths';
import { BAKERY, BIKE_PARKING, KINDS, STATION, STOP, TOILETS } from './kinds';

describe('kinds', () => {
  it('has one id each and a sign the controls can draw', () => {
    expect(new Set(KINDS.map((k) => k.id)).size).toBe(KINDS.length);
    for (const k of KINDS) {
      if (k === BIKE_PARKING) continue;
      expect(POI_GLYPHS[k.glyph!], k.id).toBeDefined();
      expect(k.tiles).toEqual({ layer: 'poi', zoom: 14 });
      expect(k.add).toBeUndefined();
    }
  });

  it('takes its own places from the base map and names them', () => {
    expect(BAKERY.place({ class: 'bakery', subclass: 'bakery', name: 'Kamps' }, 8, 50, 41)).toEqual({ key: 'm41', lng: 8, lat: 50, title: 'Kamps', detail: 'Bäckerei' });
    expect(BAKERY.place({ class: 'toilets', subclass: 'toilets' }, 8, 50, 42)).toBeNull();
    expect(BAKERY.place({ subclass: 'toString' }, 8, 50)).toBeNull();
  });

  it('calls a nameless place by what it is', () => {
    expect(TOILETS.place({ subclass: 'toilets' }, 8, 50)).toEqual({ key: '8,50', lng: 8, lat: 50, title: 'Toilette', detail: '' });
  });

  it('tells stations of the railway from other stations, and gathers bus and tram stops', () => {
    expect(STATION.place({ class: 'railway', subclass: 'subway', name: 'Alexanderplatz' }, 8, 50, 1)?.detail).toBe('U-Bahn');
    expect(STATION.place({ class: 'aerialway', subclass: 'station' }, 8, 50, 2)).toBeNull();
    expect(STOP.place({ class: 'railway', subclass: 'tram_stop' }, 8, 50, 3)?.title).toBe('Straßenbahn');
  });
});
