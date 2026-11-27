import * as THREE from 'three';
import type { Map as MlMap } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { loadedGroundAt } from '../world3d/terrain';
import { contactsOf, standOn, type Contact } from './ground';

/** A box from `y` up, `w` metres wide, around (x, z) of its parent. */
function box(x: number, y: number, z: number, w = 2, h = 2): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w));
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

describe('the points a landmark can touch the ground with', () => {
  it('are the lowest points across the plan, with the nodes of the file in their places', () => {
    const model = new THREE.Group().add(box(0, 0, 0), box(100, 5, 0));
    const contacts = contactsOf(model);
    const near = (x: number) => contacts.filter((c) => Math.abs(c[0] - x) <= 1.01).map((c) => c[1]);
    expect(Math.min(...near(0))).toBeCloseTo(0);
    expect(Math.min(...near(100))).toBeCloseTo(5);
    expect(contacts.every((c) => c[1] > -0.01)).toBe(true);
  });
  it('leave out what the file moves', () => {
    const wheel = new THREE.Group().add(box(0, -20, 0));
    wheel.name = 'wheel';
    const model = new THREE.Group().add(box(0, 0, 0), wheel);
    expect(Math.min(...contactsOf(model).map((c) => c[1]))).toBeCloseTo(-20);
    expect(Math.min(...contactsOf(model, new Set(['wheel'])).map((c) => c[1]))).toBeCloseTo(0);
  });
  it('are none for an empty model', () => {
    expect(contactsOf(new THREE.Group())).toEqual([]);
  });
});

describe('where a landmark stands', () => {
  const flat: Contact[] = Array.from({ length: 20 }, (_, i) => [i * 10, 0, 0]);

  it('is on the lowest ground under it, as a whole', () => {
    const ground = flat.map((_, i) => 400 + i);
    expect(standOn(flat, ground, false)).toEqual({ base: 400, byFeet: false });
  });
  it('does not take terrain that has not loaded for sea level', () => {
    const ground = flat.map((_, i) => (i < 5 ? NaN : 500 + i));
    expect(standOn(flat, ground, false)).toEqual({ base: 505, byFeet: false });
    expect(standOn(flat, flat.map(() => NaN), false)).toBeUndefined();
  });
  it('sets a structure built over the terrain by its feet', () => {
    // a coaster whose supports run down a slope: every foot 100 m of ground below its own height (y = ground - 100)
    const ground = flat.map((_, i) => 100 + i * 2);
    const feet: Contact[] = flat.map(([x], i) => [x, ground[i]! - 100, 0]);
    // the ground read under one foot is far off (a ditch the model was not built on): the model stays where its feet put it
    const read = ground.map((h, i) => (i === 3 ? h - 30 : h));
    const stand = standOn(feet, read, true)!;
    expect(stand.byFeet).toBe(true);
    expect(stand.base).toBeCloseTo(100);
  });
  it('puts a bridge built flat on the lowest ground', () => {
    // level footings over a ground that rises towards the ends: no terrain reading lines them up better
    const ground = flat.map((_, i) => (i < 12 ? 10 : 10 + (i - 11) * 4));
    expect(standOn(flat, ground, true)).toEqual({ base: 10, byFeet: false });
  });
});

describe('a ground height that is known', () => {
  const map = (terrain: unknown, query: number | null = null) => ({
    getTerrain: () => ({ source: 'dem', exaggeration: 0.5 }),
    getCenter: () => ({ lng: 0, lat: 0 }),
    getZoom: () => 15,
    queryTerrainElevation: () => query,
    terrain,
  }) as unknown as MlMap;
  const probe = (elevation: number, demState: string) => ({ getElevationAndDEMStateForLngLat: () => ({ elevation, demState }) });

  it('is the drawn height without the exaggeration, 0 m included', () => {
    expect(loadedGroundAt(map(probe(250, 'loaded')), 8, 47)).toBe(500);
    expect(loadedGroundAt(map(probe(0, 'loaded')), 8, 47)).toBe(0);
  });
  it('is unknown while the elevation tile is missing', () => {
    expect(loadedGroundAt(map(probe(0, 'loading')), 8, 47)).toBeUndefined();
    expect(loadedGroundAt(map(probe(0, 'none')), 8, 47)).toBeUndefined();
  });
  it('takes an exact 0 as unknown where MapLibre cannot be asked', () => {
    expect(loadedGroundAt(map(undefined, 0), 8, 47)).toBeUndefined();
    expect(loadedGroundAt(map(undefined, 100), 8, 47)).toBe(200);
  });
  it('is unknown without terrain', () => {
    expect(loadedGroundAt({ getTerrain: () => null } as unknown as MlMap, 8, 47)).toBeUndefined();
  });
});
