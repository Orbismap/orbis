// Flow particles over the sea (currents, wave direction). Same principle as render/gl/particles.ts (CPU advection in
// typed arrays, each particle a short tapering trail, drawn through MapLibre's projectTile, no framebuffer feedback),
// but fed with an arbitrary FlowField and a land mask: a particle that touches land or leaves the data dies and is
// respawned on open water. The wind engine itself is bound to the OWX store, hence this sibling.
//
// Loop: MapLibre renders -> render() steps the simulation -> triggerRepaint(). The chain breaks when the tab is hidden,
// the layer is invisible, motion is reduced or the layer is removed: idle means no frames at all.
import { effect } from '@preact/signals';
import type { CustomLayerInterface, Map as MlMap } from 'maplibre-gl';
import type { LayerContext } from '../../layers/types';
import { reducedMotion, settings } from '../../state/settings';
import { Cleanup } from '../common';
import { createLutTexture, ProgramCache, setProjectionUniforms, type RenderArgs } from '../gl/gl-util';
import { latToMerc, lngToMerc, mercToLat } from '../gl/grid';
import { NX, NY, RES, type FlowField } from './grid';
import { isOceanMerc, type LandMask } from './landmask';

export interface FlowOptions {
  name?: string;
  /** screen speed in px/s for a flow speed (field units, "m/s") */
  speedPx?: (speed: number) => number;
  /** premultiplied RGBA table (width = entries) the trail colour is looked up in by the field's t */
  lut: () => Uint8Array;
  maxCount?: number;
  /** visible px² per particle at full density */
  areaPerParticle?: number;
  alpha?: number;
}

const HIST = 9;
const STRIDE = HIST * 2 + 2;
const SEG = HIST - 1;
const TRAIL_SEC = 1.2;
const SAMPLE_DT = TRAIL_SEC / SEG;
const POOL = 2048;

const VERT = `
in vec2 p0; in vec2 p1; in vec2 p2; in vec2 p3; in vec2 p4; in vec2 p5; in vec2 p6; in vec2 p7; in vec2 p8;
in vec2 a_info;
uniform vec2 u_viewport;
uniform float u_phase;
uniform float u_width;
uniform float u_copy;
out float v_alpha;
out float v_side;
out float v_t;
vec2 P(int k) {
  vec2 r = p0;
  if (k == 1) r = p1; else if (k == 2) r = p2; else if (k == 3) r = p3; else if (k == 4) r = p4;
  else if (k == 5) r = p5; else if (k == 6) r = p6; else if (k == 7) r = p7; else if (k == 8) r = p8;
  return vec2(r.x + u_copy, r.y);
}
vec2 toPx(vec4 c) { return c.xy / c.w * 0.5 * u_viewport; }
void main() {
  int k = gl_VertexID >> 1;
  float side = (gl_VertexID & 1) == 0 ? -1.0 : 1.0;
  vec4 c = projectTile(P(k));
  int kp = k == 0 ? 0 : k - 1;
  int kn = k == 0 ? 2 : (k >= ${SEG} ? ${SEG} : k + 1);
  vec2 a = toPx(projectTile(P(kp)));
  vec2 b = toPx(projectTile(P(kn)));
  vec2 d = b - a;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float age = k == 0 ? 0.0 : float(k - 1) + u_phase;
  float f = clamp(1.0 - age / ${SEG}.0, 0.0, 1.0);
  float w = u_width * (0.35 + 0.65 * f);
  vec2 off = nrm * side * w * 2.0 / u_viewport * c.w;
  gl_Position = vec4(c.xy + off, c.z, c.w);
  v_alpha = pow(f, 1.3) * a_info.y;
  v_side = side;
  v_t = a_info.x;
}`;

const FRAG = `
uniform sampler2D u_lut;
uniform float u_alpha;
uniform float u_halo;
in float v_alpha;
in float v_side;
in float v_t;
out vec4 fragColor;
void main() {
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(v_side));
  float a = v_alpha * edge;
  if (u_halo > 0.5) {
    float h = a * 0.3 * u_alpha;
    fragColor = vec4(vec3(0.01, 0.03, 0.07) * h, h);
    return;
  }
  vec4 c = texture(u_lut, vec2(clamp(v_t, 0.0, 1.0) * 0.998 + 0.001, 0.5));
  // the table carries the field's own alpha ramp; trails stay visible even where the field is faint
  float al = a * u_alpha;
  vec3 rgb = c.a > 0.01 ? c.rgb / c.a : vec3(0.8, 0.9, 1.0);
  rgb = mix(rgb, vec3(1.0), 0.35);
  fragColor = vec4(rgb * al, al * 0.95);
}`;

const ATTRIBS: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3, p4: 4, p5: 5, p6: 6, p7: 7, p8: 8, a_info: 9 };
const isPhone = () => typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600);

/** Bilinear lookup of vx, vy, t at mercator (x, y); false where any corner has no data. */
export function sampleFlow(f: FlowField, x: number, y: number, out: Float32Array): boolean {
  const gx = (x - Math.floor(x)) * NX;
  let gy = ((90 - mercToLat(y)) / RES);
  if (gy < 0) gy = 0;
  else if (gy > NY - 1.0001) gy = NY - 1.0001;
  const x0 = gx | 0;
  const y0 = gy | 0;
  const fx = gx - x0;
  const fy = gy - y0;
  const x1 = x0 + 1 >= NX ? 0 : x0 + 1;
  const i00 = y0 * NX + x0;
  const i10 = y0 * NX + x1;
  const i01 = (y0 + 1) * NX + x0;
  const i11 = (y0 + 1) * NX + x1;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const vx = f.vx[i00]! * w00 + f.vx[i10]! * w10 + f.vx[i01]! * w01 + f.vx[i11]! * w11;
  if (vx !== vx) return false; // NaN corner: no data here
  out[0] = vx;
  out[1] = f.vy[i00]! * w00 + f.vy[i10]! * w10 + f.vy[i01]! * w01 + f.vy[i11]! * w11;
  out[2] = f.t[i00]! * w00 + f.t[i10]! * w10 + f.t[i01]! * w01 + f.t[i11]! * w11;
  return true;
}

class FlowCustomLayer implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;
  private map?: MlMap;
  private programs?: ProgramCache;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private lutTex: WebGLTexture | null = null;
  private lutDirty = true;

  readonly maxCount: number;
  private count = 0;
  private target = 0;
  private readonly data: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly pool = new Float32Array(POOL * 2);
  private poolN = 0;
  private readonly tmp = new Float32Array(3);
  private densityCap = 3000;
  private view = { x0: 0, x1: 1, y0: 0, y1: 1 };
  private copies = 1;
  private lastT = 0;
  private sinceSample = 0;
  private perf = { frames: 0, cpu: 0, interval: 0, logged: false };
  field?: FlowField;
  mask?: LandMask;
  active = true;
  hidden = false;
  private looping = false;
  /** measured by the loop, read by tests/diagnostics */
  stats = { count: 0, cpuMs: 0, intervalMs: 0 };

  constructor(readonly id: string, private readonly ctx: LayerContext, private readonly o: FlowOptions) {
    this.maxCount = o.maxCount ?? (isPhone() ? 3500 : 9000);
    this.data = new Float32Array(this.maxCount * STRIDE);
    this.age = new Float32Array(this.maxCount);
    this.life = new Float32Array(this.maxCount);
    this.target = Math.min(this.maxCount, 2500);
  }

  markLutDirty() { this.lutDirty = true; }

  onAdd(map: MlMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.programs = new ProgramCache({ vertex: VERT, fragment: FRAG, attribs: ATTRIBS });
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const stride = STRIDE * 4;
    for (let k = 0; k < HIST; k++) {
      gl.enableVertexAttribArray(k);
      gl.vertexAttribPointer(k, 2, gl.FLOAT, false, stride, k * 8);
      gl.vertexAttribDivisor(k, 1);
    }
    gl.enableVertexAttribArray(9);
    gl.vertexAttribPointer(9, 2, gl.FLOAT, false, stride, HIST * 8);
    gl.vertexAttribDivisor(9, 1);
    gl.bindVertexArray(null);
    this.lutTex = null;
    this.lutDirty = true;
    this.updateView();
  }

  onRemove(_map: MlMap, gl: WebGL2RenderingContext): void {
    this.programs?.dispose(gl);
    this.programs = undefined;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.lutTex) gl.deleteTexture(this.lutTex);
    this.vao = this.vbo = this.lutTex = null;
    this.map = undefined;
    this.looping = false;
  }

  kick(): void {
    if (this.looping || !this.map || !this.canRun()) return;
    this.looping = true;
    this.lastT = 0;
    this.map.triggerRepaint();
  }
  stop(): void { this.looping = false; }
  private canRun(): boolean {
    return this.active && !this.hidden && !!this.field && !!this.mask && (typeof document === 'undefined' || !document.hidden);
  }

  /** The grid changed: particles keep going, the pool (spawn points that have data) is rebuilt. */
  refreshData(): void {
    this.updateView();
    this.kick();
  }

  updateView(): void {
    const map = this.map;
    if (!map) return;
    const canvas = map.getCanvas();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const b = map.getBounds();
    const c = map.getCenter();
    const cx = lngToMerc(c.lng);
    const west = lngToMerc(b.getWest());
    const east = lngToMerc(b.getEast());
    const spanX = Math.min(1, east - west);
    this.view.x0 = cx - Math.max(spanX / 2, 0.02) * 1.15;
    this.view.x1 = cx + Math.max(spanX / 2, 0.02) * 1.15;
    this.view.y0 = Math.max(0.002, latToMerc(Math.min(85, b.getNorth() + 2)));
    this.view.y1 = Math.min(0.998, latToMerc(Math.max(-85, b.getSouth() - 2)));
    const wide = b.getEast() - b.getWest() >= 330;
    const globe = map.getProjection()?.type === 'globe';
    this.copies = !globe && wide ? 3 : 1;
    let n = 0;
    const f = this.field;
    const m = this.mask;
    for (let i = 0; i < POOL * 3 && n < POOL; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h;
      const ll = map.unproject([sx, sy]);
      if (!ll || !Number.isFinite(ll.lng) || !Number.isFinite(ll.lat) || Math.abs(ll.lat) > 84) continue;
      if (globe) {
        const p = map.project(ll);
        if (Math.abs(p.x - sx) > 2 || Math.abs(p.y - sy) > 2) continue;
      }
      let x = lngToMerc(ll.lng);
      x += Math.round(cx - x);
      const y = latToMerc(ll.lat);
      if (m && !isOceanMerc(m, x, y)) continue;
      if (f && !sampleFlow(f, x, y, this.tmp)) continue;
      this.pool[n * 2] = x;
      this.pool[n * 2 + 1] = y;
      n++;
    }
    this.poolN = n;
    // oceans fill only part of the screen, spawn points are already water: density per px² of visible ocean
    const wanted = Math.round((w * h) / (this.o.areaPerParticle ?? 150));
    this.densityCap = Math.min(this.maxCount, Math.max(600, wanted));
  }

  private respawn(i: number, startAged: boolean): void {
    const o = i * STRIDE;
    const d = this.data;
    if (this.poolN === 0) { this.age[i] = 1e9; return; }
    const j = ((Math.random() * this.poolN) | 0) * 2;
    const x = this.pool[j]!;
    const y = this.pool[j + 1]!;
    for (let k = 0; k < HIST; k++) { d[o + k * 2] = x; d[o + k * 2 + 1] = y; }
    this.life[i] = 2.4 + Math.random() * 3.2;
    this.age[i] = startAged ? Math.random() * this.life[i]! : 0;
    d[o + HIST * 2] = 0;
    d[o + HIST * 2 + 1] = 0;
  }

  private step(dt: number): void {
    const map = this.map!;
    const f = this.field!;
    const mask = this.mask!;
    const t0 = performance.now();
    const pf = this.perf;
    pf.interval = pf.interval === 0 ? dt * 1000 : pf.interval * 0.95 + dt * 1000 * 0.05;
    const cap = this.densityCap;
    if (pf.interval > 24) this.target = Math.max(900, this.target * 0.97);
    else if (pf.interval < 18.5) this.target = Math.min(cap, this.target + this.target * 0.01 + 4);
    if (this.target > cap) this.target = cap;
    const want = Math.round(this.target);
    if (want > this.count) { for (let i = this.count; i < want; i++) this.respawn(i, true); this.count = want; }
    else if (want < this.count) this.count = want;

    const world = 512 * 2 ** map.getZoom();
    const speedPx = this.o.speedPx ?? ((s: number) => 70 * s ** 0.6);
    const d = this.data;
    const w = this.tmp;
    const v = this.view;
    const shift = (this.sinceSample += dt) >= SAMPLE_DT;
    if (shift) this.sinceSample -= SAMPLE_DT;
    for (let i = 0; i < this.count; i++) {
      const o = i * STRIDE;
      const a = this.age[i]! + dt;
      let x = d[o]!;
      let y = d[o + 1]!;
      if (a >= this.life[i]! || x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) { this.respawn(i, false); continue; }
      if (!sampleFlow(f, x, y, w)) { this.respawn(i, false); continue; }
      const sp = Math.hypot(w[0]!, w[1]!);
      if (sp > 1e-4) {
        const k = (speedPx(sp) * dt) / world / sp;
        x += w[0]! * k;
        y -= w[1]! * k;
      }
      if (!isOceanMerc(mask, x, y)) { this.respawn(i, false); continue; }
      d[o] = x;
      d[o + 1] = y;
      if (shift) {
        d.copyWithin(o + 4, o + 2, o + 2 * (HIST - 1));
        d[o + 2] = x;
        d[o + 3] = y;
      }
      d[o + HIST * 2] = w[2]!;
      const l = this.life[i]!;
      d[o + HIST * 2 + 1] = Math.min(1, a / 0.6) * Math.min(1, (l - a) / 0.8);
      this.age[i] = a;
    }
    pf.cpu += performance.now() - t0;
    pf.frames++;
    if (pf.frames % 60 === 0) {
      this.stats = { count: this.count, cpuMs: pf.cpu / pf.frames, intervalMs: pf.interval };
      if (pf.frames >= 600) { pf.cpu = 0; pf.frames = 0; }
    }
  }

  render(gl: WebGL2RenderingContext, args: RenderArgs): void {
    const map = this.map;
    if (!map || !this.programs || !this.vao || !this.vbo) return;
    if (!this.canRun()) { this.looping = false; return; }
    const now = performance.now();
    const dt = this.lastT === 0 ? 1 / 60 : Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.step(dt);
    if (this.count === 0) { if (this.looping) map.triggerRepaint(); return; }

    const prog = this.programs.get(gl, args);
    gl.useProgram(prog.program);
    setProjectionUniforms(prog, args);
    const canvas = map.getCanvas();
    gl.uniform2f(prog.u('u_viewport'), canvas.width, canvas.height);
    gl.uniform1f(prog.u('u_phase'), Math.min(1, this.sinceSample / SAMPLE_DT));
    gl.uniform1f(prog.u('u_alpha'), (this.o.alpha ?? 0.8) * this.ctx.opacity.peek());
    if (this.lutDirty || !this.lutTex) {
      if (this.lutTex) gl.deleteTexture(this.lutTex);
      this.lutTex = createLutTexture(gl, this.o.lut());
      this.lutDirty = false;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.uniform1i(prog.u('u_lut'), 0);
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * STRIDE);
    const copies = this.copies;
    for (let pass = 0; pass < 2; pass++) {
      const halo = pass === 0;
      gl.uniform1f(prog.u('u_halo'), halo ? 1 : 0);
      gl.uniform1f(prog.u('u_width'), (halo ? 1.9 : 0.85) * dpr);
      for (let c = 0; c < copies; c++) {
        gl.uniform1f(prog.u('u_copy'), copies === 1 ? 0 : c - 1);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, HIST * 2, this.count);
      }
    }
    gl.bindVertexArray(null);
    if (this.looping) map.triggerRepaint();
  }
}

export interface FlowHandle {
  setField(f: FlowField | undefined): void;
  setMask(m: LandMask): void;
  /** the colour table changed */
  recolor(): void;
  stats(): { count: number; cpuMs: number; intervalMs: number };
  destroy(): void;
}

export function flowLayer(ctx: LayerContext, o: FlowOptions): FlowHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const clean = new Cleanup();
  const layer = new FlowCustomLayer(`${o.name ? `${ctx.id}.${o.name}` : ctx.id}-flow`, ctx, o);
  let destroyed = false;
  const update = () => {
    layer.active = !reducedMotion() && ctx.opacity.peek() > 0.01;
    if (layer.active) layer.kick(); else layer.stop();
  };
  engine.addCustomLayer(layer, 'lines');
  // diagnostics for the headless smoke test (window.__orbis exists only there)
  const hook = (globalThis as { __orbis?: Record<string, unknown> }).__orbis;
  if (hook) hook.oceanFlowStats = () => layer.stats;
  clean.add(effect(() => { ctx.opacity.value; settings.value.motion; update(); }));

  let moveTimer: ReturnType<typeof setTimeout> | undefined;
  const onMove = () => layer.updateView();
  const onMoveThrottled = () => {
    if (moveTimer) return;
    moveTimer = setTimeout(() => { moveTimer = undefined; if (!destroyed) onMove(); }, 220);
  };
  ml.on('move', onMoveThrottled);
  ml.on('moveend', onMove);
  ml.on('resize', onMove);
  const onVis = () => { if (document.hidden) layer.stop(); else update(); };
  document.addEventListener('visibilitychange', onVis);
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  mq?.addEventListener('change', update);
  const onRestored = () => { if (destroyed) return; if (!ml.getLayer(layer.id)) engine.addCustomLayer(layer, 'lines'); update(); };
  ml.on('webglcontextrestored', onRestored);
  clean.add(() => {
    ml.off('move', onMoveThrottled);
    ml.off('moveend', onMove);
    ml.off('resize', onMove);
    ml.off('webglcontextrestored', onRestored);
    document.removeEventListener('visibilitychange', onVis);
    mq?.removeEventListener('change', update);
    if (moveTimer) clearTimeout(moveTimer);
  });
  return {
    setField(f) { layer.field = f; layer.refreshData(); update(); },
    setMask(m) { layer.mask = m; layer.refreshData(); update(); },
    recolor() { layer.markLutDirty(); engine.requestRender(); },
    stats: () => layer.stats,
    destroy() { destroyed = true; layer.stop(); clean.run(); engine.remove({ layers: [layer.id] }); },
  };
}
