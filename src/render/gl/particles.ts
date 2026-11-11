// particleLayer: wind particles. CPU advection in typed arrays against the 0.5° overview u/v at the selected time,
// GPU draws each particle as a short tapering trail (instanced triangle strip) through MapLibre's projectTile, so it
// works on the globe, in mercator and in the transition. No framebuffer feedback: stable while panning and zooming.
//
// Loop: there is no timer of our own. MapLibre renders → `render()` steps the simulation and asks for the next
// frame with triggerRepaint(). The chain breaks (and nothing runs) when the tab is hidden, the layer is invisible,
// motion is reduced or the layer is removed. Zero allocations in the loop: all arrays are allocated up front.
import { effect } from '@preact/signals';
import type { CustomLayerInterface, Map as MlMap } from 'maplibre-gl';
import { reducedMotion, settings } from '../../state/settings';
import type { LayerContext, LayerHandle } from '../../layers/types';
import { Cleanup, idBase } from '../common';
import { bracketTime, mercToLat, lngToMerc, latToMerc, type Bracket } from './grid';
import { ProgramCache, setProjectionUniforms, type RenderArgs } from './gl-util';
import type { OwxLatest } from '../../data/owx';
import { followLatest, noteOf } from './latest';
import { acquireStore, type FieldStore } from './store';

export interface ParticleOptions {
  name?: string;
  /** Screen speed in px/s per m/s of wind (default 5). */
  pxPerMs?: number;
  /** Upper bound of particles on desktop (default 12 000; 4 000 on phones). */
  maxCount?: number;
  /** Visible area in px² per particle at full density (default 160). */
  areaPerParticle?: number;
  /** Trail colour in CSS rgb 0..255 for slow and fast wind. */
  colorSlow?: [number, number, number];
  colorFast?: [number, number, number];
  /** Peak opacity of a trail (0..1, default 0.85). */
  alpha?: number;
  /** Dark soft underlay for contrast on bright imagery (default true). */
  halo?: boolean;
}

const HIST = 9; // points per trail (head + 8 samples)
const STRIDE = HIST * 2 + 2; // floats per particle: history xy, then (speed 0..1, life fade)
const SEG = HIST - 1;
const TRAIL_SEC = 1.1; // seconds of motion a trail covers
const SAMPLE_DT = TRAIL_SEC / SEG;
const POOL = 2048;
const WIND_FULL = 25; // m/s at which brightness saturates

const VERT = `
in vec2 p0; in vec2 p1; in vec2 p2; in vec2 p3; in vec2 p4; in vec2 p5; in vec2 p6; in vec2 p7; in vec2 p8;
in vec2 a_info;
uniform vec2 u_viewport;   // px
uniform float u_phase;
uniform float u_width;     // half width in px
uniform float u_copy;
out float v_alpha;
out float v_side;
out float v_speed;

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
  float age = k == 0 ? 0.0 : float(k - 1) + u_phase;     // in samples; continuous across the history shifts
  float f = clamp(1.0 - age / ${SEG}.0, 0.0, 1.0);
  float w = u_width * (0.35 + 0.65 * f);
  vec2 off = nrm * side * w * 2.0 / u_viewport * c.w;
  gl_Position = vec4(c.xy + off, c.z, c.w);
  v_alpha = pow(f, 1.35) * a_info.y;
  v_side = side;
  v_speed = a_info.x;
}`;

const FRAG = `
uniform vec3 u_slow;
uniform vec3 u_fast;
uniform float u_alpha;
uniform float u_halo;      // 1 = dark underlay pass
in float v_alpha;
in float v_side;
in float v_speed;
out vec4 fragColor;
void main() {
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(v_side));
  float a = v_alpha * edge;
  if (u_halo > 0.5) {
    float h = a * 0.34 * u_alpha;
    fragColor = vec4(vec3(0.02, 0.04, 0.08) * h, h);
    return;
  }
  vec3 col = mix(u_slow, u_fast, smoothstep(0.1, 0.9, v_speed));
  float al = a * u_alpha * (0.45 + 0.55 * v_speed);
  fragColor = vec4(col * al, al * 0.9);
}`;

const ATTRIBS: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3, p4: 4, p5: 5, p6: 6, p7: 7, p8: 8, a_info: 9 };

const isPhone = () => typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600);

/** u/v of the overview at one time (m/s, interleaved), rebuilt on time change. */
class WindGrid {
  nx = 0;
  ny = 0;
  data = new Float32Array(0);

  fill(store: FieldStore, br: Bracket): boolean {
    const ov = store.overview;
    if (!ov || ov.fields.length < 2) return false;
    const [fu, fv] = ov.fields as [typeof ov.fields[0], typeof ov.fields[0]];
    const { nx, ny } = ov.header;
    const n = nx * ny;
    if (this.nx !== nx || this.ny !== ny) {
      this.nx = nx;
      this.ny = ny;
      this.data = new Float32Array(n * 2);
    }
    const nod = fu.header.nodata;
    const su = fu.header.scale;
    const sv = fv.header.scale;
    const o0 = br.i0 * n;
    const o1 = br.i1 * n;
    const f = br.f;
    const U = fu.data;
    const V = fv.data;
    const out = this.data;
    for (let i = 0; i < n; i++) {
      const u0 = U[o0 + i]!;
      const v0 = V[o0 + i]!;
      const u1 = f === 0 ? u0 : U[o1 + i]!;
      const v1 = f === 0 ? v0 : V[o1 + i]!;
      if (u0 === nod || v0 === nod || u1 === nod || v1 === nod) {
        out[2 * i] = 0;
        out[2 * i + 1] = 0;
      } else {
        out[2 * i] = (u0 + (u1 - u0) * f) * su;
        out[2 * i + 1] = (v0 + (v1 - v0) * f) * sv;
      }
    }
    return true;
  }

  /** Bilinear wind at mercator (x, y): writes u, v (m/s) into `out`. */
  sample(x: number, y: number, out: Float32Array): void {
    const { nx, ny, data } = this;
    const gx = (x - Math.floor(x)) * nx;
    const lat = mercToLat(y);
    let gy = ((90 - lat) / 180) * (ny - 1);
    if (gy < 0) gy = 0;
    else if (gy > ny - 1.0001) gy = ny - 1.0001;
    const x0 = gx | 0;
    const y0 = gy | 0;
    const fx = gx - x0;
    const fy = gy - y0;
    const x1 = x0 + 1 >= nx ? 0 : x0 + 1;
    const i00 = (y0 * nx + x0) * 2;
    const i10 = (y0 * nx + x1) * 2;
    const i01 = ((y0 + 1) * nx + x0) * 2;
    const i11 = ((y0 + 1) * nx + x1) * 2;
    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;
    out[0] = data[i00]! * w00 + data[i10]! * w10 + data[i01]! * w01 + data[i11]! * w11;
    out[1] = data[i00 + 1]! * w00 + data[i10 + 1]! * w10 + data[i01 + 1]! * w01 + data[i11 + 1]! * w11;
  }
}

class ParticleCustomLayer implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;
  private map?: MlMap;
  private programs?: ProgramCache;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;

  // simulation
  readonly maxCount: number;
  private count = 0; // active particles
  private target = 0; // wanted count (adaptive, density by area)
  private readonly data: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly pool = new Float32Array(POOL * 2);
  private poolN = 0;
  private readonly wind = new WindGrid();
  private readonly tmp = new Float32Array(2);
  private windBr: Bracket = { i0: -1, i1: -1, f: -1 };
  private windAt = 0;
  private windReady = false;
  private densityCap = 3000;
  private view = { x0: 0, x1: 1, y0: 0, y1: 1 };
  private copies = 1;
  private lastT = 0;
  private sinceSample = 0;
  private perf = { frames: 0, cpu: 0, interval: 0, logged: false };
  store?: FieldStore;
  /** set by the owner: should the loop run? */
  active = true;
  hidden = false;
  private looping = false;

  constructor(
    readonly id: string,
    private readonly ctx: LayerContext,
    private readonly o: ParticleOptions,
  ) {
    this.maxCount = o.maxCount ?? (isPhone() ? 4000 : 12000);
    this.data = new Float32Array(this.maxCount * STRIDE);
    this.age = new Float32Array(this.maxCount);
    this.life = new Float32Array(this.maxCount);
    this.target = Math.min(this.maxCount, 3000);
  }

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
    this.updateView();
  }

  onRemove(_map: MlMap, gl: WebGL2RenderingContext): void {
    this.programs?.dispose(gl);
    this.programs = undefined;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    this.vao = this.vbo = null;
    this.map = undefined;
    this.looping = false;
  }

  /** (Re)starts the render chain; harmless when it already runs. */
  kick(): void {
    if (this.looping || !this.map || !this.canRun()) return;
    this.looping = true;
    this.lastT = 0;
    this.map.triggerRepaint();
  }

  stop(): void {
    this.looping = false;
  }

  private canRun(): boolean {
    return this.active && !this.hidden && !!this.store?.overview && (typeof document === 'undefined' || !document.hidden);
  }

  /** Viewport box in mercator coordinates and the spawn pool: random screen points that really show the ground. */
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
    // pool: screen → ground; points outside the globe disc come back changed and are dropped by the round trip
    let n = 0;
    for (let i = 0; i < POOL * 2 && n < POOL; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h;
      const ll = map.unproject([sx, sy]);
      if (!ll || !Number.isFinite(ll.lng) || !Number.isFinite(ll.lat) || Math.abs(ll.lat) > 84) continue;
      if (globe) {
        const p = map.project(ll);
        if (Math.abs(p.x - sx) > 2 || Math.abs(p.y - sy) > 2) continue;
      }
      let x = lngToMerc(ll.lng);
      x += Math.round(cx - x); // the copy that is nearest to the centre
      this.pool[n * 2] = x;
      this.pool[n * 2 + 1] = latToMerc(ll.lat);
      n++;
    }
    this.poolN = n;
    // density: one particle per areaPerParticle px² of visible ground
    const area = w * h;
    const wanted = Math.round(area / (this.o.areaPerParticle ?? 160));
    this.densityCap = Math.min(this.maxCount, Math.max(800, wanted));
  }

  private respawn(i: number, startAged: boolean): void {
    const o = i * STRIDE;
    const d = this.data;
    if (this.poolN === 0) {
      this.age[i] = 1e9; // nowhere to go yet: stays dead until the pool exists
      return;
    }
    const j = ((Math.random() * this.poolN) | 0) * 2;
    const x = this.pool[j]!;
    const y = this.pool[j + 1]!;
    for (let k = 0; k < HIST; k++) {
      d[o + k * 2] = x;
      d[o + k * 2 + 1] = y;
    }
    this.life[i] = 2.2 + Math.random() * 3.0;
    this.age[i] = startAged ? Math.random() * this.life[i]! : 0;
    d[o + HIST * 2] = 0;
    d[o + HIST * 2 + 1] = 0;
  }

  // ---- simulation step ---------------------------------------------------------------------------
  private step(dt: number): void {
    const map = this.map!;
    const store = this.store!;
    const t0 = performance.now();

    // wind of the selected time (rebuilt at most every 80 ms while scrubbing)
    const times = store.latest.times;
    const br = bracketTime(times, this.ctx.time.peek());
    if (!this.windReady || ((br.i0 !== this.windBr.i0 || br.i1 !== this.windBr.i1 || Math.abs(br.f - this.windBr.f) > 0.004) && t0 - this.windAt > 80)) {
      if (this.wind.fill(store, br)) {
        this.windBr = br;
        this.windAt = t0;
        this.windReady = true;
      }
    }
    if (!this.windReady) return;

    // adaptive count from the measured frame interval
    const pf = this.perf;
    pf.interval = pf.interval === 0 ? dt * 1000 : pf.interval * 0.95 + dt * 1000 * 0.05;
    const cap = this.densityCap;
    if (pf.interval > 24) this.target = Math.max(1200, this.target * 0.97);
    else if (pf.interval < 18.5) this.target = Math.min(cap, this.target + this.target * 0.01 + 4);
    if (this.target > cap) this.target = cap;
    const want = Math.round(this.target);
    if (want > this.count) {
      for (let i = this.count; i < want; i++) this.respawn(i, true);
      this.count = want;
    } else if (want < this.count) this.count = want;

    const world = 512 * 2 ** map.getZoom();
    const pxPerMs = this.o.pxPerMs ?? 5;
    const d = this.data;
    const w = this.tmp;
    const v = this.view;
    const shift = (this.sinceSample += dt) >= SAMPLE_DT;
    if (shift) this.sinceSample -= SAMPLE_DT;
    const full = WIND_FULL;
    const k = (pxPerMs * dt) / world; // mercator units per m/s of wind
    for (let i = 0; i < this.count; i++) {
      const o = i * STRIDE;
      let a = this.age[i]! + dt;
      let x = d[o]!;
      let y = d[o + 1]!;
      if (a >= this.life[i]! || x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) {
        this.respawn(i, false);
        continue;
      }
      this.wind.sample(x, y, w);
      const sp = Math.hypot(w[0]!, w[1]!);
      x += w[0]! * k;
      y -= w[1]! * k; // north is up, merc y grows southwards
      d[o] = x;
      d[o + 1] = y;
      if (shift) {
        // history: samples 1..7 move one place back, sample 1 becomes the head's current position
        d.copyWithin(o + 4, o + 2, o + 2 * (HIST - 1));
        d[o + 2] = x;
        d[o + 3] = y;
      }
      d[o + HIST * 2] = Math.min(1, sp / full);
      const l = this.life[i]!;
      d[o + HIST * 2 + 1] = Math.min(1, a / 0.6) * Math.min(1, (l - a) / 0.8);
      this.age[i] = a;
    }

    pf.cpu += performance.now() - t0;
    if (++pf.frames === 180 && !pf.logged) {
      pf.logged = true;
      if (import.meta.env?.DEV) console.info(`[particles] ${this.count} Partikel, Simulation ${(pf.cpu / pf.frames).toFixed(2)} ms/Bild, Bildabstand ${pf.interval.toFixed(1)} ms`);
    }
  }

  // ---- draw ----------------------------------------------------------------------------------------
  render(gl: WebGL2RenderingContext, args: RenderArgs): void {
    const map = this.map;
    if (!map || !this.programs || !this.vao || !this.vbo) return;
    if (!this.canRun()) {
      this.looping = false;
      return;
    }
    const now = performance.now();
    const dt = this.lastT === 0 ? 1 / 60 : Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.step(dt);
    if (!this.windReady || this.count === 0) {
      if (this.looping) map.triggerRepaint();
      return;
    }

    const prog = this.programs.get(gl, args);
    gl.useProgram(prog.program);
    setProjectionUniforms(prog, args);
    const canvas = map.getCanvas();
    gl.uniform2f(prog.u('u_viewport'), canvas.width, canvas.height);
    gl.uniform1f(prog.u('u_phase'), Math.min(1, this.sinceSample / SAMPLE_DT));
    const [sr, sg, sb] = this.o.colorSlow ?? [196, 226, 255];
    const [fr, fg, fb] = this.o.colorFast ?? [255, 255, 255];
    gl.uniform3f(prog.u('u_slow'), sr / 255, sg / 255, sb / 255);
    gl.uniform3f(prog.u('u_fast'), fr / 255, fg / 255, fb / 255);
    gl.uniform1f(prog.u('u_alpha'), (this.o.alpha ?? 0.85) * this.ctx.opacity.peek());
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * STRIDE);
    const copies = this.copies;
    const passes = this.o.halo === false ? 1 : 2;
    for (let pass = 0; pass < passes; pass++) {
      const halo = passes === 2 && pass === 0;
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

export function particleLayer(ctx: LayerContext, o: ParticleOptions = {}): LayerHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const clean = new Cleanup();
  const layer = new ParticleCustomLayer(`${idBase(ctx, o.name)}-particles`, ctx, o);
  let destroyed = false;
  let release: (() => void) | undefined;

  const update = () => {
    const motionOk = !reducedMotion();
    const visible = ctx.opacity.peek() > 0.01;
    layer.active = motionOk && visible;
    if (layer.active) layer.kick();
    else layer.stop();
  };

  // above fields, rasters and areas, below the labels
  engine.addCustomLayer(layer, 'lines');

  let heldNow: { store: FieldStore; release(): void } | undefined;
  const useRun = (latest: OwxLatest) => {
    const next = acquireStore(latest, ['u', 'v'], 0);
    let done = false;
    const ready = () => {
      if (done || destroyed || !next.store.overview) return;
      done = true;
      const old = heldNow;
      heldNow = next;
      release = next.release;
      layer.store = next.store;
      ctx.status({ state: 'ready', updatedAt: latest.issued, note: noteOf(latest) });
      layer.updateView();
      update();
      old?.release();
    };
    clean.add(next.store.subscribe(ready));
    ready();
    clean.add(() => { if (heldNow !== next) next.release(); });
  };
  clean.add(followLatest(ctx.signal, useRun, () => {}));

  // time scrubbing needs no action: the loop reads ctx.time every frame; a stopped loop is started by the effects
  clean.add(effect(() => {
    ctx.opacity.value;
    settings.value.motion;
    update();
  }));

  const onMove = () => layer.updateView();
  let moveTimer: ReturnType<typeof setTimeout> | undefined;
  const onMoveThrottled = () => {
    if (moveTimer) return;
    moveTimer = setTimeout(() => {
      moveTimer = undefined;
      if (!destroyed) onMove();
    }, 220);
  };
  ml.on('move', onMoveThrottled);
  ml.on('moveend', onMove);
  ml.on('resize', onMove);
  const onVis = () => {
    if (document.hidden) layer.stop();
    else update();
  };
  document.addEventListener('visibilitychange', onVis);
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  mq?.addEventListener('change', update);
  const onRestored = () => {
    if (destroyed) return;
    if (!ml.getLayer(layer.id)) engine.addCustomLayer(layer, 'lines');
    update();
  };
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
    destroy() {
      destroyed = true;
      layer.stop();
      clean.run();
      release?.();
      engine.remove({ layers: [layer.id] });
    },
  };
}
