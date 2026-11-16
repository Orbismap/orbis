import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curvatureLift, ecefToEnu, geodeticToEcef, proxyCamera } from './mapping';
import { FOV, H, W, frame } from '../world3d/testcamera';

const TOKYO: [number, number] = [139.75, 35.68];

describe('ecefToEnu', () => {
  const m = ecefToEnu(TOKYO[0], TOKYO[1], 0);
  const at = (lon: number, lat: number, h: number) => new THREE.Vector3(...geodeticToEcef(lon, lat, h)).applyMatrix4(m);

  it('puts the anchor at the origin', () => {
    const p = at(TOKYO[0], TOKYO[1], 0);
    expect(p.length()).toBeLessThan(1e-6);
  });
  it('100 m above the anchor is 100 m up', () => {
    const p = at(TOKYO[0], TOKYO[1], 100);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(100, 6);
  });
  it('a bit east and north lies east and north', () => {
    const p = at(TOKYO[0] + 0.01, TOKYO[1] + 0.01, 0);
    expect(p.x).toBeGreaterThan(800);
    expect(p.y).toBeGreaterThan(1000);
    expect(Math.abs(p.z)).toBeLessThan(0.2);
  });
  it('the ground sags away with the square of the distance', () => {
    const p = at(TOKYO[0] + 0.1, TOKYO[1], 0);
    expect(p.z).toBeCloseTo(-curvatureLift(Math.hypot(p.x, p.y)), 0);
  });
});

describe('curvatureLift', () => {
  it('is about 8 m at 10 km and nothing on the globe', () => {
    expect(curvatureLift(10_000)).toBeGreaterThan(7.5);
    expect(curvatureLift(10_000)).toBeLessThan(8);
    expect(curvatureLift(10_000, 0)).toBe(0);
  });
});

describe('proxyCamera', () => {
  for (const [name, t, zoom, pitch, bearing] of [['flat', 0, 16, 55, 30], ['globe', 1, 4, 0, 0], ['blend', 0.4, 9, 40, 0]] as const) {
    it(`sees the same pixels as the map (${name})`, () => {
      const f = frame(zoom, t, TOKYO[0], TOKYO[1], pitch, bearing);
      const cam = new THREE.PerspectiveCamera();
      const metre = f.basis(TOKYO[0], TOKYO[1]).east[0] ? Math.hypot(...f.basis(TOKYO[0], TOKYO[1]).east) : 1;
      proxyCamera(cam, f.proj, FOV, W, H, metre);
      const model = f.place(new THREE.Matrix4(), TOKYO[0], TOKYO[1], 0);
      for (const [x, y, z] of [[0, 0, 0], [100, 50, 20], [-80, 120, 0]] as const) {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(model);
        const a = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(f.proj);
        const b = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
        expect(b.x / b.w).toBeCloseTo(a.x / a.w, 4);
        expect(b.y / b.w).toBeCloseTo(a.y / a.w, 4);
      }
    });
  }
});
