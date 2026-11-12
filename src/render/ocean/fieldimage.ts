// Custom layer that draws a pre-coloured equirectangular image (the sea-state field) over the whole globe, clipped
// by the ocean mask texture. Same recipe as render/gl/field.ts (world mesh in mercator coordinates through MapLibre's
// projectTile, so globe, mercator and the transition work), but the colours are baked on the CPU: the data is a
// smooth 0.5° grid that changes every few hours, so there is nothing to animate and nothing to repaint per frame.
import { effect } from '@preact/signals';
import type { CustomLayerInterface, Map as MlMap } from 'maplibre-gl';
import type { LayerContext } from '../../layers/types';
import type { SlotId } from '../../map/types';
import { ProgramCache, setProjectionUniforms, type RenderArgs } from '../gl/gl-util';
import type { LandMask } from './landmask';

const MESH = 160;

const VERT = `
in vec2 a_pos;
uniform float u_copy;
out highp vec2 v_merc;
void main() {
  vec2 m = vec2(a_pos.x + u_copy, a_pos.y);
  v_merc = m;
  gl_Position = projectTile(m);
}`;

const FRAG = `
in highp vec2 v_merc;
out vec4 fragColor;
uniform sampler2D u_img;
uniform sampler2D u_mask;
uniform float u_opacity;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float lat = degrees(atan(sinh(3.141592653589793 * (1.0 - 2.0 * v_merc.y))));
  vec2 uv = vec2(v_merc.x, clamp((90.0 - lat) / 180.0, 0.0, 1.0));
  float m = smoothstep(0.25, 0.75, texture(u_mask, uv).r);
  vec4 c = texture(u_img, uv) * (m * u_opacity);
  c.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0 * step(0.001, c.a);
  fragColor = c;
}`;

class FieldImageLayer implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;
  private map?: MlMap;
  private programs?: ProgramCache;
  private vao: WebGLVertexArrayObject | null = null;
  private bufs: WebGLBuffer[] = [];
  private indexCount = 0;
  private capCount = 0;
  private img?: { tex: WebGLTexture; w: number; h: number };
  private maskTex?: WebGLTexture;
  private pendingImg?: { rgba: Uint8Array; w: number; h: number };
  private pendingMask?: LandMask;

  constructor(readonly id: string, private readonly ctx: LayerContext) {}

  setImage(rgba: Uint8Array, w: number, h: number): void {
    this.pendingImg = { rgba, w, h };
    this.map?.triggerRepaint();
  }

  setMask(m: LandMask): void {
    this.pendingMask = m;
    this.map?.triggerRepaint();
  }

  onAdd(map: MlMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.programs = new ProgramCache({ vertex: VERT, fragment: FRAG, attribs: { a_pos: 0 } });
    this.buildMesh(gl);
    // after a context loss or a re-add the textures are gone: upload again from what we know
    this.img = undefined;
    this.maskTex = undefined;
  }

  onRemove(_map: MlMap, gl: WebGL2RenderingContext): void {
    this.programs?.dispose(gl);
    this.programs = undefined;
    if (this.vao) gl.deleteVertexArray(this.vao);
    for (const b of this.bufs) gl.deleteBuffer(b);
    this.bufs = [];
    if (this.img) gl.deleteTexture(this.img.tex);
    if (this.maskTex) gl.deleteTexture(this.maskTex);
    this.img = undefined;
    this.maskTex = undefined;
    this.vao = null;
    this.map = undefined;
  }

  /** World mesh plus polar cap rows (see render/gl/field.ts): the main part covers ±85.05°, caps reach the globe's poles. */
  private buildMesh(gl: WebGL2RenderingContext) {
    const n = MESH;
    const CAP = 8;
    const yOf = (lat: number) => (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2;
    const ys: number[] = [];
    for (let k = CAP; k >= 1; k--) ys.push(yOf(85.0511 + ((89.9999 - 85.0511) * k) / CAP));
    const capRows = ys.length;
    for (let y = 0; y <= n; y++) ys.push(y / n);
    for (let k = 1; k <= CAP; k++) ys.push(1 - ys[CAP - k]!);
    const rows = ys.length;
    const verts = new Float32Array(rows * (n + 1) * 2);
    for (let r = 0; r < rows; r++) for (let x = 0; x <= n; x++) { verts[(r * (n + 1) + x) * 2] = x / n; verts[(r * (n + 1) + x) * 2 + 1] = ys[r]!; }
    const main: number[] = [];
    const cap: number[] = [];
    for (let r = 0; r < rows - 1; r++) {
      const dst = r >= capRows && r < capRows + n ? main : cap;
      for (let x = 0; x < n; x++) {
        const a = r * (n + 1) + x;
        const b = a + 1;
        const c = a + n + 1;
        dst.push(a, c, b, b, c, c + 1);
      }
    }
    this.indexCount = main.length;
    this.capCount = cap.length;
    const idx = new Uint32Array(main.length + cap.length);
    idx.set(main, 0);
    idx.set(cap, main.length);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.bufs = [vbo, ibo];
  }

  private texture(gl: WebGL2RenderingContext, internal: number, format: number, w: number, h: number, data: Uint8Array): WebGLTexture {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    return tex;
  }

  render(gl: WebGL2RenderingContext, args: RenderArgs): void {
    const map = this.map;
    if (!map || !this.programs || !this.vao) return;
    if (this.pendingMask) {
      if (this.maskTex) gl.deleteTexture(this.maskTex);
      const m = this.pendingMask;
      this.maskTex = this.texture(gl, gl.R8, gl.RED, m.w, m.h, m.ocean);
      this.pendingMask = undefined;
    }
    if (this.pendingImg) {
      if (this.img) gl.deleteTexture(this.img.tex);
      const p = this.pendingImg;
      this.img = { tex: this.texture(gl, gl.RGBA8, gl.RGBA, p.w, p.h, p.rgba), w: p.w, h: p.h };
      this.pendingImg = undefined;
    }
    if (!this.img || !this.maskTex) return;
    const prog = this.programs.get(gl, args);
    gl.useProgram(prog.program);
    setProjectionUniforms(prog, args);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.img.tex);
    gl.uniform1i(prog.u('u_img'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(prog.u('u_mask'), 1);
    gl.uniform1f(prog.u('u_opacity'), this.ctx.opacity.peek());

    let k0 = 0;
    let k1 = 0;
    const globe = args.shaderData.variantName.toLowerCase().includes('globe') || args.defaultProjectionData.projectionTransition > 0;
    const caps = args.defaultProjectionData.projectionTransition > 0.999;
    if (!globe) {
      const b = map.getBounds();
      k0 = Math.max(-3, Math.floor(b.getWest() / 360 + 0.5 - 1e-9));
      k1 = Math.min(3, Math.floor(b.getEast() / 360 + 0.5 - 1e-9));
    }
    gl.bindVertexArray(this.vao);
    for (let k = k0; k <= k1; k++) {
      gl.uniform1f(prog.u('u_copy'), k);
      gl.drawElements(gl.TRIANGLES, this.indexCount + (caps ? this.capCount : 0), gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }
}

export interface OceanFieldHandle {
  setImage(rgba: Uint8Array, w: number, h: number): void;
  setMask(m: LandMask): void;
  repaint(): void;
  destroy(): void;
}

/** Adds the field layer to the map; returns a handle to feed it. Deckkraft follows `ctx.opacity`. */
export function oceanFieldLayer(ctx: LayerContext, o: { name?: string; slot?: SlotId } = {}): OceanFieldHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const layer = new FieldImageLayer(`${o.name ? `${ctx.id}.${o.name}` : ctx.id}-field`, ctx);
  engine.addCustomLayer(layer, o.slot ?? 'field');
  const stop = effect(() => { ctx.opacity.value; ml.triggerRepaint(); });
  const onRestored = () => { if (!ml.getLayer(layer.id)) engine.addCustomLayer(layer, o.slot ?? 'field'); ml.triggerRepaint(); };
  ml.on('webglcontextrestored', onRestored);
  return {
    setImage: (rgba, w, h) => layer.setImage(rgba, w, h),
    setMask: (m) => layer.setMask(m),
    repaint: () => ml.triggerRepaint(),
    destroy() {
      stop();
      ml.off('webglcontextrestored', onRestored);
      engine.remove({ layers: [layer.id] });
    },
  };
}
