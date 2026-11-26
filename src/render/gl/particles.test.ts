import { signal } from '@preact/signals';
import type { Map as MlMap } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import type { LayerContext } from '../../layers/types';
import { shiftedMatrix } from './gl-util';
import { latToMerc, lngToMerc, mercToLat, mercToLng } from './grid';
import { ParticleCustomLayer } from './particles';
import type { FieldStore } from './store';

/** a wind of 4 m/s from the south-west everywhere: u = v = 4 / √2 */
const UV = 4 / Math.SQRT2;
const field = (value: number) => ({ data: new Int16Array(4 * 3).fill(Math.round(value * 1000)), header: { scale: 0.001, nodata: -32768 } });
const store = { latest: { times: [0] }, overview: { header: { nx: 4, ny: 3 }, fields: [field(UV), field(UV)] } } as unknown as FieldStore;

function fakeMap(zoom: number, lng: number, lat: number): MlMap {
  const world = 512 * 2 ** zoom;
  const unproject = ([x, y]: [number, number]) => ({ lng: mercToLng(lngToMerc(lng) + (x - 500) / world), lat: mercToLat(latToMerc(lat) + (y - 400) / world) });
  const nw = unproject([0, 0]);
  const se = unproject([1000, 800]);
  return {
    getCanvas: () => ({ clientWidth: 1000, clientHeight: 800 }),
    getBounds: () => ({ getWest: () => nw.lng, getEast: () => se.lng, getNorth: () => nw.lat, getSouth: () => se.lat }),
    getCenter: () => ({ lng, lat }),
    getZoom: () => zoom,
    getProjection: () => ({ type: 'mercator' }),
    unproject,
  } as unknown as MlMap;
}

describe('wind particles', () => {
  for (const zoom of [3, 14, 16, 19]) {
    it(`move with the wind at zoom ${zoom}`, () => {
      const layer = new ParticleCustomLayer('p', { time: signal(0) } as unknown as LayerContext, {});
      layer['map'] = fakeMap(zoom, 8.9, 54.75);
      layer.store = store;
      layer.updateView();
      layer['step'](1 / 60);
      const data = layer['data'];
      const life = layer['life'];
      const age = layer['age'];
      life[0] = 100;
      age[0] = 1;
      data[0] = data[1] = 0; // the head of the first particle: in the middle of the view
      for (let i = 0; i < 60; i++) layer['step'](1 / 60);
      // one second at 5 px/s per m/s, north-east (mercator y grows southwards)
      const px = 512 * 2 ** zoom;
      expect(data[0]! * px).toBeCloseTo(UV * 5, 1);
      expect(data[1]! * px).toBeCloseTo(-UV * 5, 1);
    });
  }
});

describe('wind particles on the globe', () => {
  // [view centre latitude, particle latitude]; at the same apparent globe size MapLibre's zoom value drops towards the poles
  for (const [centre, lat] of [[0, 0], [0, 60], [80, 80], [80, 45], [90, 60]] as const) {
    it(`keep their screen speed (centre ${centre}°, particle ${lat}°)`, () => {
      const cos = (d: number) => Math.cos((Math.min(d, 85.051129) * Math.PI) / 180);
      const zoom = 1 + Math.log2(cos(centre));
      const layer = new ParticleCustomLayer('p', { time: signal(0) } as unknown as LayerContext, {});
      layer['map'] = fakeMap(zoom, 0, centre);
      layer.store = store;
      layer.updateView();
      layer['step'](1 / 60, 1);
      const data = layer['data'];
      layer['life'][0] = 100;
      layer['age'][0] = 1;
      const y0 = latToMerc(lat) - layer['origin'][1];
      data[0] = 0;
      data[1] = y0;
      const [x0, startY] = [data[0]!, data[1]!];
      for (let i = 0; i < 6; i++) layer['step'](1 / 60, 1);
      // pixels per mercator unit on the globe at the particle's latitude
      const px = (512 * 2 ** zoom * cos(lat)) / cos(centre);
      expect(Math.hypot(data[0]! - x0, data[1]! - startY) * px).toBeCloseTo(4 * 5 * 0.1, 1);
    });
  }
});

describe('matrix for positions relative to an origin', () => {
  it('projects an offset like the matrix projects the absolute position', () => {
    // column-major: a scale of the size of a close zoom and a shift back to the middle of the screen
    const m = [8e6, 0, 0, 0, 0, -8e6, 0, 0, 0, 0, 1, 0, -8e6 * 0.52, 8e6 * 0.32, 0, 1];
    const s = new Float32Array(shiftedMatrix(m, 0.52, 0.32));
    const offset = Math.fround(1e-5);
    expect(s[0]! * offset + s[12]!).toBeCloseTo(80, 3);
    expect(s[5]! * offset + s[13]!).toBeCloseTo(-80, 3);
  });
});
