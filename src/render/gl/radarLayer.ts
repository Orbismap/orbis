// radarLayer: rain radar as a MapLibre custom layer (WebGL2). Port of the old Orbis radar shader (globe/radargl.ts).
//
// Instead of one coloured raster layer per time step the layer keeps the radar *values* (rain-rate bytes read back
// from the tiles, radar-values.ts) of two neighbouring steps as textures and mixes them in the fragment shader before
// the colour scale (LUT) is applied. Between two steps the rain moves: a motion field is estimated per tile (block
// matching in the worker, radar-values.ts computeFlow), the old step is shifted forward and the new one backwards by
// it before they are mixed. Beyond the newest step the newest one is carried on with the last motion (forecast).
// Tiles are drawn through MapLibre's projectTile (mercator, globe, transition), one zoom level below the map's.
import { effect, type ReadonlySignal } from '@preact/signals';
import type { CustomLayerInterface, Map as MlMap } from 'maplibre-gl';
import type { LayerContext, LayerHandle } from '../../layers/types';
import { runParser } from '../../data/worker/pool';
import { Cleanup, idBase } from '../common';
import { ProgramCache, setProjectionUniforms, type RenderArgs } from './gl-util';
import { FLOW_G, NODATA_MIN, buildRadarLut, rainLabel, rainRate } from './radar-values';

export interface RadarFrame {
  /** valid time [ms] */
  time: number;
  /** tile URL template with {z}/{x}/{y}: the PNG of the RainViewer composite, colour scheme 2 (unsmoothed edges) */
  url: string;
}

export interface RadarLayerOptions {
  frames: ReadonlySignal<RadarFrame[]>;
  /** attribution text (HTML) of the source */
  attribution: string;
  /** Native maximum zoom of the tiles. */
  maxzoom: number;
  name?: string;
  /** Beyond the first / last step the picture stays only this long (ms, default 20 min). */
  maxGap?: number;
  /** Name of the source for the error note ("RainViewer"); when its tiles keep failing the layer reports `error`. */
  sourceName?: string;
  /** Extra failure signal (e.g. the index resource failed to load). */
  failure?: ReadonlySignal<string | undefined>;
}

const MIN_Z = 4;
const MAX_TILES = 300;
const MAX_CACHE = 720;
const MAX_PARALLEL = 4;
const OPACITY = 0.9;
/** a tile that failed (rate limit, network) is asked for again after this */
const RETRY_MS = 20_000;

interface Entry {
  state: 'loading' | 'ready' | 'empty' | 'error';
  /** when a failed tile may be requested again */
  retryAt: number;
  bytes: Uint8Array | null;
  size: number;
  tex: WebGLTexture | null;
  used: number;
}
interface Flow { data: Float32Array | null; tex: WebGLTexture | null; used: number }
interface Step { time: number; url: string; key: string }

const FRAG = `
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform sampler2D u_lut;
uniform sampler2D u_flow;
uniform float u_wa;
uniform float u_wb;
uniform float u_opacity;
// forecast: how many step lengths the newest step is carried beyond its own time (0 = measurement)
uniform float u_ext;
in vec2 v_uv;
out vec4 outColor;

// cubic B-spline weights
vec4 cubic(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  float w = 6.0 - x - y - z;
  return vec4(x, y, z, w) * (1.0 / 6.0);
}

// bicubic sample out of four bilinear fetches: round edges even when a texel covers many pixels
vec2 bicubic(sampler2D tex, vec2 uv) {
  vec2 size = vec2(textureSize(tex, 0));
  vec2 inv = 1.0 / size;
  uv = uv * size - 0.5;
  vec2 fxy = fract(uv);
  uv -= fxy;
  vec4 xc = cubic(fxy.x);
  vec4 yc = cubic(fxy.y);
  vec4 c = uv.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 o = (c + vec4(xc.yw, yc.yw) / s) * inv.xxyy;
  vec2 s0 = texture(tex, o.xz).rg;
  vec2 s1 = texture(tex, o.yz).rg;
  vec2 s2 = texture(tex, o.xw).rg;
  vec2 s3 = texture(tex, o.yw).rg;
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

void main() {
  float w = u_wa + u_wb;
  if (w <= 0.0) discard;
  float r = u_wb / w;
  // motion of the rain between the two steps (zero when not known, and towards the tile edges
  // so that neighbouring tiles agree): the old step is carried forward, the new one back
  vec2 f = texture(u_flow, v_uv).rg;
  f *= smoothstep(0.0, 0.08, min(min(v_uv.x, 1.0 - v_uv.x), min(v_uv.y, 1.0 - v_uv.y)));
  vec2 a = bicubic(u_a, v_uv - f * r);
  vec2 pb = v_uv + f * (1.0 - r) - f * u_ext;
  vec2 b = bicubic(u_b, pb);
  // carried in from beyond the tile edge: unknown (the neighbouring tile is a texture of its own)
  if (u_ext > 0.0 && (pb.x < 0.0 || pb.y < 0.0 || pb.x > 1.0 || pb.y > 1.0)) b = vec2(0.0);
  // mix the values first, colour afterwards. Both steps are already carried to the same moment
  // by the motion field, so a linear mix on the (sqrt-coded) bytes keeps cells at their strength.
  float v = clamp((a.r * u_wa + b.r * u_wb) / w, 0.0, 1.0);
  float ok = (a.g * u_wa + b.g * u_wb) / w;
  float m = smoothstep(0.25, 0.75, ok);
  vec4 c = texture(u_lut, vec2((v * 255.0 + 0.5) / 256.0, 0.5));
  float al = c.a * m * u_opacity;
  outColor = vec4(c.rgb * al, al);
}`;

const VERT = `
in vec2 a_local;
uniform vec3 u_tile; // mercator x, y of the tile's north-west corner and its size
out vec2 v_uv;
void main() {
  v_uv = a_local;
  gl_Position = projectTile(u_tile.xy + a_local * u_tile.z);
}`;

const D2R = Math.PI / 180;

class RadarCustomLayer implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;
  private map?: MlMap;
  private programs?: ProgramCache;
  private tiles = new Map<string, Entry>();
  private flows = new Map<string, Flow>();
  private lutTex: WebGLTexture | null = null;
  private zeroFlowTex: WebGLTexture | null = null;
  private emptyTex: WebGLTexture | null = null;
  /** subdivided tile meshes by edge length: a flat quad would not follow the globe */
  private meshes = new Map<number, { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; ibo: WebGLBuffer; count: number }>();
  private inflight = 0;
  private queue: (() => void)[] = [];
  private lastZ = MIN_Z;
  steps: Step[] = [];
  /** consecutive tile failures without a success in between, for the status */
  failures = 0;
  onTileFailures: (n: number) => void = () => {};

  constructor(
    readonly id: string,
    private readonly ctx: LayerContext,
    private readonly o: RadarLayerOptions,
  ) {}

  setFrames(frames: RadarFrame[]): void {
    this.steps = [...frames].sort((a, b) => a.time - b.time).map((f) => ({ time: f.time, url: f.url, key: f.url }));
    this.map?.triggerRepaint();
  }

  // ---- lifecycle ---------------------------------------------------------------------------
  onAdd(map: MlMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.programs = new ProgramCache({ vertex: VERT, fragment: FRAG, attribs: { a_local: 0 } });
    // GPU state of a previous context is gone: keep the decoded values, upload again
    for (const e of this.tiles.values()) e.tex = null;
    for (const f of this.flows.values()) f.tex = null;
    this.meshes.clear();
    const mk = (data: ArrayBufferView, w: number, h: number, internal: number, format: number, filter: number) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      return t;
    };
    const lut = buildRadarLut();
    this.lutTex = mk(new Uint8Array(lut.buffer, lut.byteOffset, lut.byteLength), 256, 1, gl.RGBA8, gl.RGBA, gl.LINEAR);
    this.emptyTex = mk(new Uint8Array(2), 1, 1, gl.RG8, gl.RG, gl.NEAREST);
    const z = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, z);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, 1, 1, 0, gl.RG, gl.FLOAT, new Float32Array(2));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.zeroFlowTex = z;
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  onRemove(_map: MlMap, gl: WebGL2RenderingContext): void {
    for (const e of this.tiles.values()) if (e.tex) gl.deleteTexture(e.tex);
    this.tiles.clear();
    for (const f of this.flows.values()) if (f.tex) gl.deleteTexture(f.tex);
    this.flows.clear();
    this.programs?.dispose(gl);
    this.programs = undefined;
    for (const t of [this.lutTex, this.emptyTex, this.zeroFlowTex]) if (t) gl.deleteTexture(t);
    this.lutTex = this.emptyTex = this.zeroFlowTex = null;
    for (const m of this.meshes.values()) {
      gl.deleteBuffer(m.vbo);
      gl.deleteBuffer(m.ibo);
      gl.deleteVertexArray(m.vao);
    }
    this.meshes.clear();
    this.queue.length = 0;
    this.map = undefined;
  }

  // ---- time --------------------------------------------------------------------------------
  /** the two steps around the current time, the position between them and the forecast extension */
  private pair(): { a: Step | null; b: Step | null; ratio: number; ext: number } {
    const f = this.steps;
    const t = this.ctx.time.peek();
    if (!f.length) return { a: null, b: null, ratio: 0, ext: 0 };
    const last = f[f.length - 1]!;
    // beyond the newest step: forecast, the newest step carried on with the motion between the last two
    if (f.length >= 2 && t > last.time) {
      const p = f[f.length - 2]!;
      return { a: p, b: last, ratio: 1, ext: (t - last.time) / (last.time - p.time) };
    }
    if (t <= f[0]!.time) return { a: f[0]!, b: null, ratio: 0, ext: 0 };
    for (let i = 0; i < f.length - 1; i++) {
      const s = f[i]!;
      const n = f[i + 1]!;
      if (t >= s.time && t < n.time) return { a: s, b: n, ratio: (t - s.time) / (n.time - s.time), ext: 0 };
    }
    return { a: last, b: null, ratio: 0, ext: 0 };
  }

  /** false when the selected time is further than `maxGap` outside the covered range */
  private inRange(): boolean {
    const f = this.steps;
    if (!f.length) return false;
    const t = this.ctx.time.peek();
    const edge = t < f[0]!.time ? f[0]!.time - t : t > f[f.length - 1]!.time ? t - f[f.length - 1]!.time : 0;
    return edge <= (this.o.maxGap ?? 20 * 60_000);
  }

  // ---- tiles -------------------------------------------------------------------------------
  private entry(s: Step, z: number, x: number, y: number): Entry {
    const key = `${s.key}|${z}/${x}/${y}`;
    let e = this.tiles.get(key);
    if (e?.state === 'error' && performance.now() >= e.retryAt) {
      this.tiles.delete(key);
      e = undefined;
    }
    if (e) return e;
    const entry: Entry = { state: 'loading', bytes: null, size: 0, tex: null, used: 0, retryAt: 0 };
    this.tiles.set(key, entry);
    const url = s.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
    const start = () => {
      this.inflight++;
      this.fetchTile(url)
        .then((t) => {
          if (t) {
            entry.bytes = t.bytes;
            entry.size = t.size;
            entry.state = 'ready';
          } else entry.state = 'empty'; // no tile there: no rain
          if (this.failures) this.onTileFailures((this.failures = 0));
        })
        .catch((err) => {
          if ((err as Error)?.name === 'AbortError') {
            entry.state = 'error';
            entry.retryAt = performance.now() + RETRY_MS;
            return;
          }
          // rate limit or network: not "no rain" - try again later
          entry.state = 'error';
          entry.retryAt = performance.now() + RETRY_MS;
          this.onTileFailures(++this.failures);
        })
        .finally(() => {
          this.inflight--;
          this.queue.shift()?.();
          this.map?.triggerRepaint();
        });
    };
    if (this.inflight < MAX_PARALLEL) start();
    else this.queue.push(start);
    return entry;
  }

  private async fetchTile(url: string): Promise<{ bytes: Uint8Array; size: number } | null> {
    // Cache API: RainViewer-Tiles sind pro URL unveränderlich (Frame-Pfad enthält die Frame-ID). Aggressives
    // Cachen reduziert die Last auf den Free-Tier (100 req/IP/min) und vermeidet 429/CORS-Floods.
    const cache = typeof caches !== 'undefined' ? await caches.open('rainviewer-tiles').catch(() => null) : null;
    if (cache) {
      const hit = await cache.match(url).catch(() => undefined);
      if (hit) {
        const buf = await hit.arrayBuffer();
        return runParser('radarTile', buf, { format: 'arraybuffer', signal: this.ctx.signal });
      }
    }
    const res = await fetch(url, { signal: this.ctx.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`); // 429 / 5xx: asked again later
    const buf = await res.arrayBuffer();
    if (cache) {
      cache.put(url, new Response(buf.slice(0), { headers: { 'Content-Type': 'image/png' } })).catch(() => {});
    }
    return runParser('radarTile', buf, { format: 'arraybuffer', signal: this.ctx.signal });
  }

  /** Starts the motion estimate of a tile pair in the worker; the picture follows with the next repaint. */
  private flowOf(a: Step, b: Step, z: number, x: number, y: number, ea: Entry, eb: Entry): Flow {
    const key = `${a.key}>${b.key}|${z}/${x}/${y}`;
    let f = this.flows.get(key);
    if (f) return f;
    f = { data: null, tex: null, used: 0 };
    this.flows.set(key, f);
    const flow = f;
    runParser('radarFlow', { a: ea.bytes!, sa: ea.size, b: eb.bytes!, sb: eb.size }, { signal: this.ctx.signal }).then(
      (d) => { flow.data = d; this.map?.triggerRepaint(); },
      () => { flow.data = new Float32Array(FLOW_G * FLOW_G * 2); }, // no motion known: mix without shifting
    );
    return f;
  }

  private upload(gl: WebGL2RenderingContext, e: Entry): WebGLTexture | null {
    if (e.tex || !e.bytes) return e.tex;
    const n = e.size * e.size;
    const rg = new Uint8Array(n * 2);
    for (let i = 0; i < n; i++) {
      const v = e.bytes[i]!;
      if (v < NODATA_MIN) {
        rg[i * 2] = v;
        rg[i * 2 + 1] = 255;
      }
    }
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, e.size, e.size, 0, gl.RG, gl.UNSIGNED_BYTE, rg);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]] as const) gl.texParameteri(gl.TEXTURE_2D, p, v);
    e.tex = t;
    return t;
  }

  private flowTexture(gl: WebGL2RenderingContext, f: Flow): WebGLTexture | null {
    if (f.tex || !f.data) return f.tex;
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, FLOW_G, FLOW_G, 0, gl.RG, gl.FLOAT, f.data);
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]] as const) gl.texParameteri(gl.TEXTURE_2D, p, v);
    f.tex = t;
    return t;
  }

  private evict(gl: WebGL2RenderingContext): void {
    if (this.flows.size > 600) {
      const old = [...this.flows.entries()].sort((p, q) => p[1].used - q[1].used).slice(0, 150);
      for (const [k, f] of old) {
        if (f.tex) gl.deleteTexture(f.tex);
        this.flows.delete(k);
      }
    }
    if (this.tiles.size <= MAX_CACHE) return;
    const old = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, this.tiles.size - MAX_CACHE + 40);
    for (const [k, e] of old) {
      if (e.state === 'loading') continue;
      if (e.tex) gl.deleteTexture(e.tex);
      this.tiles.delete(k);
    }
  }

  /** (n+1)^2 vertices in tile-local 0..1 and 2*n^2 triangles, with its own VAO */
  private mesh(gl: WebGL2RenderingContext, n: number) {
    let m = this.meshes.get(n);
    if (m) return m;
    const verts = new Float32Array((n + 1) * (n + 1) * 2);
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        verts[(j * (n + 1) + i) * 2] = i / n;
        verts[(j * (n + 1) + i) * 2 + 1] = j / n;
      }
    }
    const idx = new Uint16Array(n * n * 6);
    let k = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i;
        const b = a + 1;
        const c = a + n + 1;
        const d = c + 1;
        idx.set([a, b, c, b, d, c], k);
        k += 6;
      }
    }
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    m = { vao, vbo, ibo, count: idx.length };
    this.meshes.set(n, m);
    return m;
  }

  // ---- probe -------------------------------------------------------------------------------
  /** Rain rate [mm/h] under a point of the step shown, mixed like the shader does (without the motion shift); null = none */
  sample(lng: number, lat: number): number | null {
    const { a, b, ratio, ext } = this.pair();
    if (!a || !this.inRange()) return null;
    const z = this.lastZ;
    const n = 2 ** z;
    const fx = ((lng + 180) / 360) * n;
    const r = lat * D2R;
    const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const read = (s: Step | null, u = fx - x, w = fy - y): number | null => {
      const e = s && this.tiles.get(`${s.key}|${z}/${x}/${y}`);
      if (!e?.bytes || u < 0 || w < 0 || u >= 1 || w >= 1) return null;
      const v = e.bytes[Math.floor(w * e.size) * e.size + Math.floor(u * e.size)]!;
      return v >= NODATA_MIN ? null : v;
    };
    let byte: number | null;
    if (ext > 0 && b) {
      // forecast: the value of the newest step from where the motion field carries it
      const fl = this.flows.get(`${a.key}>${b.key}|${z}/${x}/${y}`)?.data;
      let u = fx - x;
      let w = fy - y;
      if (fl) {
        const k = (Math.min(FLOW_G - 1, Math.floor(w * FLOW_G)) * FLOW_G + Math.min(FLOW_G - 1, Math.floor(u * FLOW_G))) * 2;
        u -= fl[k]! * ext;
        w -= fl[k + 1]! * ext;
      }
      byte = read(b, u, w);
    } else {
      const va = read(a);
      const vb = read(b);
      byte = va === null ? vb : vb === null ? va : va * (1 - ratio) + vb * ratio;
    }
    return byte === null ? null : rainRate(byte);
  }

  // ---- draw --------------------------------------------------------------------------------
  render(gl: WebGL2RenderingContext, args: RenderArgs): void {
    const map = this.map;
    const opacity = this.ctx.opacity.peek();
    if (!map || !this.programs || opacity <= 0 || !this.inRange()) return;
    const { a, b, ratio, ext } = this.pair();
    if (!a || !this.lutTex || !this.emptyTex || !this.zeroFlowTex) return;

    // One zoom level below the map's: a quarter of the tiles (RainViewer rate-limits hard), and the bicubic sampling
    // keeps the edges round. Never above the source's own maximum.
    const z = Math.max(MIN_Z, Math.min(this.o.maxzoom, Math.round(map.getZoom()) - 1));
    this.lastZ = z;
    const n = 2 ** z;
    const bounds = map.getBounds();
    const clampLat = (v: number) => Math.max(-85.0511, Math.min(85.0511, v));
    const tx = (lon: number) => Math.floor(((lon + 180) / 360) * n);
    const ty = (lat: number) => {
      const r = clampLat(lat) * D2R;
      return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
    };
    const wide = bounds.getEast() - bounds.getWest() >= 359;
    let x0 = wide ? 0 : Math.max(0, tx(bounds.getWest()));
    let x1 = wide ? n - 1 : Math.min(n - 1, tx(bounds.getEast()));
    const y0 = Math.max(0, ty(bounds.getNorth()));
    const y1 = Math.min(n - 1, ty(bounds.getSouth()));
    if (x1 < x0) [x0, x1] = [0, n - 1]; // crosses the antimeridian: take the whole row
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES) return;

    const prog = this.programs.get(gl, args);
    gl.useProgram(prog.program);
    setProjectionUniforms(prog, args);
    gl.uniform1i(prog.u('u_a'), 0);
    gl.uniform1i(prog.u('u_b'), 1);
    gl.uniform1i(prog.u('u_lut'), 2);
    gl.uniform1i(prog.u('u_flow'), 3);
    gl.uniform1f(prog.u('u_opacity'), OPACITY * opacity);
    gl.uniform1f(prog.u('u_ext'), ext);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);

    // coarse zooms: large tiles, many segments so that they follow the globe
    const mesh = this.mesh(gl, z <= 3 ? 32 : z === 4 ? 16 : z === 5 ? 8 : 4);
    gl.bindVertexArray(mesh.vao);
    gl.disable(gl.DEPTH_TEST);

    // globe: tiles entirely behind the horizon (more than 90 degrees from the view centre) are neither fetched nor drawn
    const globe = args.defaultProjectionData.projectionTransition > 0.999;
    const c = map.getCenter();
    const cl = Math.cos(c.lat * D2R);
    const sl = Math.sin(c.lat * D2R);
    const hidden = (lon: number, lat: number) => sl * Math.sin(lat * D2R) + cl * Math.cos(lat * D2R) * Math.cos((lon - c.lng) * D2R) < -0.1;
    const tileLon = (v: number) => (v / n) * 360 - 180;
    const tileLat = (v: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * v) / n))) * 180) / Math.PI;
    const tileHidden = (x: number, y: number) => {
      for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) if (!hidden(tileLon(x + i / 2), tileLat(y + j / 2))) return false;
      return true;
    };

    const now = performance.now();
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (globe && tileHidden(x, y)) continue;
        const ea = this.entry(a, z, x, y);
        const eb = b ? this.entry(b, z, x, y) : null;
        ea.used = now;
        if (eb) eb.used = now;
        const ta = ea.state === 'ready' ? this.upload(gl, ea) : null;
        const tb = eb && eb.state === 'ready' ? this.upload(gl, eb) : null;
        if (!ta && !tb) continue;
        if (ext > 0 && !tb) continue; // forecast needs the newest step
        // motion field of this tile for this pair of steps (zero until the worker has it)
        let flowTex = this.zeroFlowTex;
        if (ta && tb && b) {
          const fl = this.flowOf(a, b, z, x, y, ea, eb!);
          fl.used = now;
          flowTex = this.flowTexture(gl, fl) ?? this.zeroFlowTex;
        }
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, flowTex);
        // a step that has not arrived yet must not dim the other one
        let wa = ta ? 1 - ratio : 0;
        let wb = tb ? ratio : 0;
        if (!ta) wb = 1;
        if (!tb) wa = 1;
        if (ext > 0) { wa = 0; wb = 1; }
        gl.uniform1f(prog.u('u_wa'), wa);
        gl.uniform1f(prog.u('u_wb'), wb);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, ta ?? this.emptyTex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tb ?? this.emptyTex);
        gl.uniform3f(prog.u('u_tile'), x / n, y / n, 1 / n);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      }
    }
    // leave the context as MapLibre expects it
    for (const unit of [gl.TEXTURE3, gl.TEXTURE2, gl.TEXTURE1, gl.TEXTURE0]) {
      gl.activeTexture(unit);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    gl.bindVertexArray(null);
    this.evict(gl);
  }
}

export function radarLayer(ctx: LayerContext, o: RadarLayerOptions): LayerHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const clean = new Cleanup();
  const base = idBase(ctx, o.name);
  const layer = new RadarCustomLayer(`${base}-radar`, ctx, o);
  let destroyed = false;
  const repaint = () => { if (!destroyed) ml.triggerRepaint(); };

  // an invisible layer carries the attribution (MapLibre shows the text of sources that a layer uses)
  const attrSrc = `${base}-attribution-src`;
  const attrLayer = `${base}-attribution`;
  engine.addSource(attrSrc, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: o.attribution });
  engine.addLayer({ id: attrLayer, type: 'fill', source: attrSrc, paint: { 'fill-opacity': 0 } }, 'raster');
  engine.addCustomLayer(layer, 'raster');
  ctx.status({ state: 'loading' });

  // tile failures: several errors without a single tile in between -> status error with a helpful note
  const tileFailure = { value: false };
  let lastFrames: RadarFrame[] = [];
  const report = () => {
    if (destroyed) return;
    const fail = o.failure?.value ?? (tileFailure.value ? `${o.sourceName ?? 'Quelle'} antwortet nicht, Bilder konnten nicht geladen werden` : undefined);
    if (fail) { ctx.status({ state: 'error', note: fail }); return; }
    if (!lastFrames.length) { ctx.status({ state: 'loading' }); return; }
    const past = lastFrames.filter((f) => f.time <= Date.now() + 60_000);
    ctx.status({ state: 'ready', count: lastFrames.length, updatedAt: (past[past.length - 1] ?? lastFrames[lastFrames.length - 1]!).time });
  };
  layer.onTileFailures = (n) => {
    const bad = n >= 4;
    if (bad !== tileFailure.value) { tileFailure.value = bad; report(); }
  };

  clean.add(effect(() => {
    lastFrames = o.frames.value;
    layer.setFrames(lastFrames);
    report();
  }));
  // time and opacity only change uniforms; one repaint, no continuous loop
  clean.add(effect(() => { ctx.time.value; ctx.opacity.value; repaint(); }));

  // a lost GL context takes MapLibre's style with it: re-add the layer when the context is back
  const onRestored = () => {
    if (destroyed) return;
    if (!ml.getLayer(layer.id)) engine.addCustomLayer(layer, 'raster');
    repaint();
  };
  ml.on('webglcontextrestored', onRestored);
  clean.add(() => ml.off('webglcontextrestored', onRestored));

  return {
    probe(at) {
      const mmh = layer.sample(at.lng, at.lat);
      if (mmh === null || mmh < 0.01) return null;
      const txt = mmh < 1 ? mmh.toFixed(2) : mmh < 10 ? mmh.toFixed(1) : String(Math.round(mmh));
      return { label: 'Regenradar', value: `${txt.replace('.', ',')} mm/h, ${rainLabel(mmh).toLowerCase()}`, numeric: mmh };
    },
    destroy() {
      destroyed = true;
      clean.run();
      engine.remove({ layers: [layer.id, attrLayer], sources: [attrSrc] });
    },
  };
}
