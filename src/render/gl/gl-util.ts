// Small WebGL2 helpers shared by the field and particle layers: shader variants per MapLibre projection
// (`args.shaderData`), projection uniforms, array textures and context-loss bookkeeping.
import type { CustomRenderMethodInput } from 'maplibre-gl';

export type RenderArgs = CustomRenderMethodInput;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) ?? 'shader';
    gl.deleteShader(s);
    throw new Error(`Shader: ${log}\n${src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')}`);
  }
  return s;
}

/** A linked program with cached uniform locations. */
export class Program {
  private readonly locs = new Map<string, WebGLUniformLocation | null>();
  constructor(readonly gl: WebGL2RenderingContext, readonly program: WebGLProgram) {}
  u(name: string): WebGLUniformLocation | null {
    let l = this.locs.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.program, name);
      this.locs.set(name, l);
    }
    return l;
  }
}

export interface ShaderSources {
  /** body of the vertex shader; the projection prelude and defines are prepended */
  vertex: string;
  fragment: string;
  /** attribute name → location, bound before linking */
  attribs: Record<string, number>;
  /** extra `#define`s after the projection ones */
  defines?: string;
}

/** Compiles one program per projection variant (mercator, globe, transition …) and caches it. */
export class ProgramCache {
  private readonly programs = new Map<string, Program>();
  constructor(private readonly src: ShaderSources) {}

  get(gl: WebGL2RenderingContext, args: RenderArgs): Program {
    const key = args.shaderData.variantName;
    const hit = this.programs.get(key);
    if (hit) return hit;
    const vs = compile(gl, gl.VERTEX_SHADER, `#version 300 es\n${args.shaderData.vertexShaderPrelude}\n${args.shaderData.define}\n${this.src.defines ?? ''}\n${this.src.vertex}`);
    const fs = compile(gl, gl.FRAGMENT_SHADER, `#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2DArray;\n${this.src.defines ?? ''}\n${this.src.fragment}`);
    const p = gl.createProgram()!;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    for (const [n, loc] of Object.entries(this.src.attribs)) gl.bindAttribLocation(p, loc, n);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p) ?? 'link';
      gl.deleteProgram(p);
      throw new Error(`Programm: ${log}`);
    }
    const prog = new Program(gl, p);
    this.programs.set(key, prog);
    return prog;
  }

  dispose(gl: WebGL2RenderingContext | null): void {
    if (gl) for (const p of this.programs.values()) gl.deleteProgram(p.program);
    this.programs.clear();
  }
}

/** Sets the uniforms MapLibre's `projectTile` needs (see CustomRenderMethodInput.defaultProjectionData). */
export function setProjectionUniforms(p: Program, args: RenderArgs): void {
  const gl = p.gl;
  const pd = args.defaultProjectionData;
  gl.uniformMatrix4fv(p.u('u_projection_matrix'), false, pd.mainMatrix as unknown as Float32List);
  gl.uniform4f(p.u('u_projection_tile_mercator_coords'), ...pd.tileMercatorCoords);
  gl.uniform4f(p.u('u_projection_clipping_plane'), ...pd.clippingPlane);
  gl.uniform1f(p.u('u_projection_transition'), pd.projectionTransition);
  gl.uniformMatrix4fv(p.u('u_projection_fallback_matrix'), false, pd.fallbackMatrix as unknown as Float32List);
}

/**
 * RG8 texture array holding the int16 values of a grid: byte 0 → R (low), byte 1 → G (high). Little-endian
 * platforms give exactly this layout for the Int16Array without copying.
 */
export function createFieldTexture(gl: WebGL2RenderingContext, data: Int16Array, nx: number, ny: number, nt: number): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RG8, nx, ny, nt);
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, nx, ny, nt, gl.RG, gl.UNSIGNED_BYTE, bytes);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  return tex;
}

/** Colour table texture (premultiplied RGBA, 1 row, linear filtering). */
export function createLutTexture(gl: WebGL2RenderingContext, lut: Uint8Array): WebGLTexture {
  const size = lut.length / 4;
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  return tex;
}

/** A 1×1×1 texture array to bind where a sampler is declared but unused. */
export function createDummyArray(gl: WebGL2RenderingContext): WebGLTexture {
  return createFieldTexture(gl, new Int16Array([0]), 1, 1, 1);
}

/** Wraps a canvas' context loss events; returns the disposer. */
export function onContextEvents(canvas: HTMLCanvasElement, lost: () => void, restored: () => void): () => void {
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return () => {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
  };
}
