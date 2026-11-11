// Night-side shading as a custom WebGL layer: the fragment shader evaluates the sun's altitude per pixel and
// fades from day to night over twilight (+2° ... -14°), so there are no polygons, bands or seams, on the globe
// and in mercator alike. Sits in the `terminator` stretch of the layer stack (above rasters, below areas).
import { effect } from '@preact/signals';
import type { CustomLayerInterface, Map as MlMap } from 'maplibre-gl';
import { subsolarPoint } from '../core/geo';
import { throttle } from '../core/scheduler';
import { ProgramCache, setProjectionUniforms, type Program, type RenderArgs } from '../render/gl/gl-util';
import { time } from '../state/time';
import { beforeIdFor } from './slots';

export interface Terminator {
  setMode(mode: 'off' | 'auto'): void;
  /** Strength of the night shade (peak opacity) and its colour, per basemap theme. */
  setLook(theme: 'dark' | 'light'): void;
  destroy(): void;
}

const LOOK = { dark: { peak: 0.28, color: [0.02, 0.043, 0.11] }, light: { peak: 0.17, color: [0.06, 0.1, 0.22] } } as const;

const VERTEX = `
in vec2 a_pos;
uniform float u_copy;
out highp vec2 v_merc;
void main() {
  vec2 m = vec2(a_pos.x + u_copy, a_pos.y);
  v_merc = m;
  gl_Position = projectTile(m);
}`;

const FRAGMENT = `
in highp vec2 v_merc;
out vec4 fragColor;
uniform vec2 u_sun;     // sub-solar longitude, latitude (radians)
uniform vec4 u_look;    // rgb, peak opacity
void main() {
  float lng = (v_merc.x - 0.5) * 6.28318530718;
  float lat = atan(sinh(3.14159265359 * (1.0 - 2.0 * v_merc.y)));
  float s = sin(lat) * sin(u_sun.y) + cos(lat) * cos(u_sun.y) * cos(lng - u_sun.x);
  float alt = degrees(asin(clamp(s, -1.0, 1.0)));
  float d = smoothstep(2.0, -14.0, alt);
  d = d * d * (3.0 - 2.0 * d) * 0.5 + d * 0.5; // slightly eased so the horizon edge stays soft
  float a = u_look.a * d;
  fragColor = vec4(u_look.rgb * a, a);
}`;

const N = 96;
const CAP = 8;

class NightLayer implements CustomLayerInterface {
  readonly id = 'terminator-night';
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;
  private map?: MlMap;
  private programs?: ProgramCache;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private ibo: WebGLBuffer | null = null;
  private mainCount = 0;
  private capCount = 0;
  sun: [number, number] = [0, 0];
  look: { peak: number; color: readonly number[] } = LOOK.dark;

  onAdd(map: MlMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.programs = new ProgramCache({ vertex: VERTEX, fragment: FRAGMENT, attribs: { a_pos: 0 } });
    const yOf = (lat: number) => (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2;
    const ys: number[] = [];
    for (let k = CAP; k >= 1; k--) ys.push(yOf(85.0511 + ((89.9999 - 85.0511) * k) / CAP));
    for (let y = 0; y <= N; y++) ys.push(y / N);
    for (let k = 1; k <= CAP; k++) ys.push(1 - ys[CAP - k]!);
    const rows = ys.length;
    const verts = new Float32Array(rows * (N + 1) * 2);
    for (let r = 0; r < rows; r++) for (let x = 0; x <= N; x++) verts.set([x / N, ys[r]!], (r * (N + 1) + x) * 2);
    const main: number[] = [];
    const cap: number[] = [];
    for (let r = 0; r < rows - 1; r++) {
      const dst = r >= CAP && r < CAP + N ? main : cap;
      for (let x = 0; x < N; x++) {
        const a = r * (N + 1) + x;
        dst.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2);
      }
    }
    this.mainCount = main.length;
    this.capCount = cap.length;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array([...main, ...cap]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  onRemove(_map: MlMap, gl: WebGL2RenderingContext): void {
    this.programs?.dispose(gl);
    this.programs = undefined;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.ibo) gl.deleteBuffer(this.ibo);
    this.vao = this.vbo = this.ibo = null;
    this.map = undefined;
  }

  render(gl: WebGL2RenderingContext, args: RenderArgs): void {
    const map = this.map;
    if (!map || !this.programs || !this.vao) return;
    const prog: Program = this.programs.get(gl, args);
    gl.useProgram(prog.program);
    setProjectionUniforms(prog, args);
    gl.uniform2f(prog.u('u_sun'), this.sun[0], this.sun[1]);
    const c = this.look.color;
    gl.uniform4f(prog.u('u_look'), c[0]!, c[1]!, c[2]!, this.look.peak);
    const pd = args.defaultProjectionData;
    const globe = args.shaderData.variantName.toLowerCase().includes('globe') || pd.projectionTransition > 0;
    const caps = pd.projectionTransition > 0.999;
    let k0 = 0;
    let k1 = 0;
    if (!globe) {
      const b = map.getBounds();
      k0 = Math.max(-3, Math.floor(b.getWest() / 360 + 0.5 - 1e-9));
      k1 = Math.min(3, Math.floor(b.getEast() / 360 + 0.5 - 1e-9));
    }
    gl.bindVertexArray(this.vao);
    for (let k = k0; k <= k1; k++) {
      gl.uniform1f(prog.u('u_copy'), k);
      gl.drawElements(gl.TRIANGLES, this.mainCount + (caps ? this.capCount : 0), gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
  }
}

/** Call `setMode` once the style is loaded to start it. */
export function createTerminator(ml: MlMap): Terminator {
  const layer = new NightLayer();
  let stop: (() => void) | undefined;
  const update = throttle((t: number) => {
    const s = subsolarPoint(t);
    layer.sun = [(s.lng * Math.PI) / 180, (s.lat * Math.PI) / 180];
    if (ml.getLayer(layer.id)) ml.triggerRepaint();
  }, 250);

  return {
    setMode(mode) {
      stop?.();
      stop = undefined;
      if (mode === 'auto') {
        if (!ml.getLayer(layer.id)) ml.addLayer(layer, beforeIdFor('terminator'));
        // `time` ticks every 30 s while live and follows the timeline otherwise
        stop = effect(() => update(time.value));
        update.flush();
      } else if (ml.getLayer(layer.id)) ml.removeLayer(layer.id);
    },
    setLook(theme) {
      layer.look = LOOK[theme];
      if (ml.getLayer(layer.id)) ml.triggerRepaint();
    },
    destroy() {
      stop?.();
      update.cancel();
      if (ml.getLayer(layer.id)) ml.removeLayer(layer.id);
    },
  };
}
