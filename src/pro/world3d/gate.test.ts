import { describe, expect, it } from 'vitest';
import { viewDrifted, type GateView } from './gate';

const view: GateView = { lng: 2.34, lat: 48.86, zoom: 16.4, bearing: 30, pitch: 60, width: 1440, height: 860, t: 0, exaggeration: 0 };
const moved = (d: Partial<GateView>) => viewDrifted(view, { ...view, ...d });
/** degrees of longitude that are `px` screen pixels wide at the view's zoom */
const lngOf = (px: number) => (px / (512 * 2 ** view.zoom)) * 360;

describe('view gate', () => {
  it('keeps the build while the view moves a little', () => {
    expect(moved({})).toBe(false);
    expect(moved({ lng: view.lng + lngOf(100), zoom: 16.5, bearing: 36, pitch: 62 })).toBe(false);
  });

  it('asks for a new build after a longer pan, a zoom, a turn, a tilt or a resize', () => {
    expect(moved({ lng: view.lng + lngOf(250) })).toBe(true);
    expect(moved({ zoom: 16.7 })).toBe(true);
    expect(moved({ bearing: 45 })).toBe(true);
    expect(moved({ pitch: 52 })).toBe(true);
    expect(moved({ width: 900 })).toBe(true);
    expect(moved({ exaggeration: 0.5 })).toBe(true);
  });

  it('measures the turn the short way round and the pan across the date line', () => {
    expect(viewDrifted({ ...view, bearing: 179 }, { ...view, bearing: -179 })).toBe(false);
    expect(viewDrifted({ ...view, lng: 180 - lngOf(20) }, { ...view, lng: -180 + lngOf(20) })).toBe(false);
  });

  it('rebuilds every frame while globe and flat map blend', () => {
    expect(viewDrifted({ ...view, t: 0.5 }, { ...view, t: 0.5 })).toBe(true);
    expect(viewDrifted({ ...view, t: 1 }, { ...view, t: 1 })).toBe(false);
    expect(moved({ t: 1 })).toBe(true);
  });
});
