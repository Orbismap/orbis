import * as THREE from 'three';

// Flat-shaded procedural geometry with vertex colours: what the low-poly models (power towers, wind turbines) are built from.

export type V = [number, number, number];

export const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
export const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Collects flat-shaded triangles with a colour each. */
export class Mesh {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];

  tri(a: V, b: V, c: V, color: THREE.Color) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(color.r, color.g, color.b);
    }
  }

  quad(a: V, b: V, c: V, d: V, color: THREE.Color) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /** A flat strip of width `w` from `p0` to `p1`, lying in the plane that faces `facing`: bracing, thin and cheap. */
  strut(p0: V, p1: V, w: number, facing: V, color: THREE.Color) {
    const side = mul(norm(cross(sub(p1, p0), facing)), w / 2);
    this.quad(sub(p0, side), add(p0, side), add(p1, side), sub(p1, side), color);
  }

  /** A tapered prism with `sides` faces from `p0` (radius r0) to `p1` (radius r1), open at the ends. */
  prism(p0: V, p1: V, r0: number, r1: number, sides: number, color: THREE.Color, capEnd = false) {
    const dir = norm(sub(p1, p0));
    const u = norm(cross(dir, Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    const v = cross(dir, u);
    const ring = (i: number, c: V, r: number): V => {
      const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
      return add(c, add(mul(u, Math.cos(a) * r), mul(v, Math.sin(a) * r)));
    };
    for (let i = 0; i < sides; i++) this.quad(ring(i, p0, r0), ring(i + 1, p0, r0), ring(i + 1, p1, r1), ring(i, p1, r1), color);
    if (capEnd) for (let i = 0; i < sides; i++) this.tri(ring(i, p1, r1), ring(i + 1, p1, r1), p1, color);
  }

  box(c: V, s: V, color: THREE.Color) {
    const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const p = (sx: number, sy: number, sz: number): V => [c[0] + sx * hx, c[1] + sy * hy, c[2] + sz * hz];
    this.quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1), color);
    this.quad(p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1), color);
    this.quad(p(1, 1, -1), p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), color);
    this.quad(p(-1, 1, -1), p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), color);
    this.quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), color);
    this.quad(p(-1, 1, -1), p(1, 1, -1), p(1, -1, -1), p(-1, -1, -1), color);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}
