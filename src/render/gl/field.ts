// fieldLayer: weather field as a MapLibre custom layer (WebGL2). See docs/ARCHITECTURE.md, "Feld-Renderer".
//
// - one world mesh in mercator coordinates, projected by MapLibre's projectTile (globe, mercator, transition),
//   in mercator drawn once per visible world copy;
// - data as RG8 texture arrays (int16 as two bytes), a layer per model time step, sampled and blended in the shader;
// - 0.5° overview immediately, 0.125° tiles from zoom 4 on (store.ts), the shader prefers a tile where available;
// - time scrubbing only changes uniforms (+ one repaint): no data moves.
import { effect, type ReadonlySignal } from '@preact/signals';
import type { CustomLayerInterface, Map as MlMap } from 'maplibre-gl';
import { buildFieldLut } from './scales';
import type { ColorScale } from '../../core/color';
import { scaleRange } from '../../core/color';
import { describeError } from '../../data/http';
import type { LayerContext, LayerHandle } from '../../layers/types';
import { Cleanup, idBase, isSignal, peek, unwrap, type Dyn } from '../common';
import { FIELD_ATTRIBS, FIELD_FRAGMENT, FIELD_VERTEX, TILE_SLOTS } from './field-shader';
import {
  bracketTime, modeVars, sampleLevels, tileAt, tileKey, tileOrigin, tilesForViewport, TILE_COLS, TILE_ROWS,
  type FieldMode, type GridLevel, type TileId,
} from './grid';
import { createDummyArray, createFieldTexture, createLutTexture, ProgramCache, setProjectionUniforms, type RenderArgs } from './gl-util';
import type { OwxLatest } from '../../data/owx';
import { followLatest, noteOf } from './latest';
import { acquireStore, defaultMaxTiles, dropCpu, lowMemory, type FieldStore, type Level } from './store';

export interface ContourOptions {
  /** distance of the lines in display units (e.g. 4 hPa) */
  interval: number;
  offset?: number;
  /** CSS px, default 1.1 */
  width?: number;
  /** 0..1, default 0.5 */
  alpha?: number;
  /** every n-th line is drawn stronger */
  major?: { every: number; width?: number; alpha?: number };
  /** CSS rgb, default white */
  color?: [number, number, number];
}

export interface FieldLayerOptions {
  /** ICON variables in OWX: one for `value`, two (u, v / T, Td) for `magnitude` / `humidity`. */
  vars: string[];
  mode?: FieldMode;
  /** Colour scale in display (base) units; `value` of the derived field is looked up directly. */
  scale: Dyn<ColorScale>;
  /** Name for the probe ("Temperatur"). */
  label: string;
  /** Formats a value in the base unit for the user ("12 °C"), via core/units. */
  format(v: number): string;
  contours?: Dyn<ContourOptions | undefined>;
  /** 0.125° tiles kept at the same time (default 4, 2 on low-memory devices). */
  maxTiles?: number;
  /** Zoom from which tiles are loaded (default 4). */
  tileZoom?: number;
  name?: string;
}

const MESH = 192;
const MAX_TILES_ON_GPU = TILE_SLOTS;

class FieldCustomLayer implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;
  private map?: MlMap;
  private programs?: ProgramCache;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private ibo: WebGLBuffer | null = null;
  private indexCount = 0;
  private capCount = 0;
  private lut: WebGLTexture | null = null;
  private lutScale?: ColorScale;
  private lutDirty = true;
  private dummy: WebGLTexture | null = null;
  private tex = new Map<Level, WebGLTexture[]>();
  private readonly tileInfo = new Float32Array(4 * TILE_SLOTS);
  private readonly tileEdge = new Float32Array(4 * TILE_SLOTS);
  private readonly slotKeys: string[] = [];
  private order: TileId[] = [];
  store?: FieldStore;
  error?: string;
  onNeedRepaint = () => this.map?.triggerRepaint();

  constructor(
    readonly id: string,
    private readonly ctx: LayerContext,
    private readonly o: FieldLayerOptions,
  ) {}

  // ---- lifecycle ---------------------------------------------------------------------------
  onAdd(map: MlMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.programs = new ProgramCache({ vertex: FIELD_VERTEX, fragment: FIELD_FRAGMENT, attribs: FIELD_ATTRIBS });
    this.tex.clear();
    this.lutDirty = true;
    this.buildMesh(gl);
    this.dummy = createDummyArray(gl);
  }

  onRemove(_map: MlMap, gl: WebGL2RenderingContext): void {
    this.releaseGl(gl);
    this.map = undefined;
  }

  private releaseGl(gl: WebGL2RenderingContext) {
    this.programs?.dispose(gl);
    this.programs = undefined;
    for (const list of this.tex.values()) for (const t of list) gl.deleteTexture(t);
    this.tex.clear();
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.ibo) gl.deleteBuffer(this.ibo);
    if (this.lut) gl.deleteTexture(this.lut);
    if (this.dummy) gl.deleteTexture(this.dummy);
    this.vao = this.vbo = this.ibo = this.lut = this.dummy = null;
  }

  markLutDirty(): void {
    this.lutDirty = true;
  }

  /**
   * World mesh in mercator coordinates (rows 0..1 = ±85.05°) plus, for the globe, polar cap rows whose mercator y
   * runs beyond [0, 1] (up to ±89.99°), so that the field reaches the poles. Cap triangles come last in the index
   * buffer; mercator draws only the first `mainCount` indices.
   */
  private buildMesh(gl: WebGL2RenderingContext) {
    const n = MESH;
    const CAP = 10;
    const yOf = (lat: number) => (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2;
    const ys: number[] = [];
    for (let k = CAP; k >= 1; k--) ys.push(yOf(85.0511 + ((89.9999 - 85.0511) * k) / CAP)); // north cap, from the pole down
    const capRows = ys.length;
    for (let y = 0; y <= n; y++) ys.push(y / n);
    for (let k = 1; k <= CAP; k++) ys.push(1 - ys[CAP - k]! + 0); // south cap: mirror of the north cap
    const rows = ys.length;
    const verts = new Float32Array(rows * (n + 1) * 2);
    for (let r = 0; r < rows; r++) {
      for (let x = 0; x <= n; x++) {
        const i = (r * (n + 1) + x) * 2;
        verts[i] = x / n;
        verts[i + 1] = ys[r]!;
      }
    }
    const quad = (idx: number[], r: number) => {
      for (let x = 0; x < n; x++) {
        const a = r * (n + 1) + x;
        const b = a + 1;
        const c = a + n + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    };
    const main: number[] = [];
    const cap: number[] = [];
    for (let r = 0; r < rows - 1; r++) quad(r >= capRows && r < capRows + n ? main : cap, r);
    this.indexCount = main.length;
    this.capCount = cap.length;
    const idx = new Uint32Array(main.length + cap.length);
    idx.set(main, 0);
    idx.set(cap, main.length);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(FIELD_ATTRIBS.a_pos);
    gl.vertexAttribPointer(FIELD_ATTRIBS.a_pos, 2, gl.FLOAT, false, 0, 0);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  // ---- data -> GPU ---------------------------------------------------------------------------
  /** Textures of a level (one per variable); undefined while the upload budget of this frame is used up. */
  private texturesOf(gl: WebGL2RenderingContext, lv: Level, budget: { n: number }): WebGLTexture[] | undefined {
    const hit = this.tex.get(lv);
    if (hit) return hit;
    if (lv.cpuDropped) return undefined; // data gone (low-memory mode) and the GPU copy lost: overview only
    if (budget.n <= 0) return undefined;
    budget.n--;
    const list = lv.fields.map((f) => createFieldTexture(gl, f.data, f.header.nx, f.header.ny, f.header.nt));
    this.tex.set(lv, list);
    if (lowMemory()) dropCpu(lv);
    return list;
  }

  private sweepDisposed(gl: WebGL2RenderingContext) {
    for (const [lv, list] of this.tex) {
      if (!lv.disposed) continue;
      for (const t of list) gl.deleteTexture(t);
      this.tex.delete(lv);
    }
  }

  /** Tiles to render, in order of need (set from the viewport by the layer). */
  setWanted(order: TileId[]): void {
    this.order = order;
  }

  // ---- render --------------------------------------------------------------------------------
  render(gl: WebGL2RenderingContext, args: RenderArgs): void {
    const map = this.map;
    const store = this.store;
    if (!map || !store?.overview || !this.programs || !this.dummy) return;
    if (this.vao === null) return;
    this.sweepDisposed(gl);
    const o = this.o;
    const mode = o.mode ?? 'value';
    const nv = modeVars(mode);
    const budget = { n: 2 };

    const ovTex = this.texturesOf(gl, store.overview, { n: 2 });
    if (!ovTex) return;

    // tiles: the wanted ones that are loaded and uploaded, at most TILE_SLOTS
    this.slotKeys.length = 0;
    const slots: { lv: Level; tex: WebGLTexture[] }[] = [];
    const useTiles = map.getZoom() >= (o.tileZoom ?? 4) - 0.5;
    if (useTiles) {
      const ready = new Map(store.readyTiles().map((l) => [l.id, l] as const));
      for (const id of this.order) {
        if (slots.length >= MAX_TILES_ON_GPU) break;
        const lv = ready.get(tileKey(id));
        if (!lv) continue;
        const tex = this.texturesOf(gl, lv, budget);
        if (!tex) {
          map.triggerRepaint(); // next tile uploads next frame
          continue;
        }
        slots.push({ lv, tex });
        this.slotKeys.push(lv.id);
      }
    }

    const prog = this.programs.get(gl, args);
    gl.useProgram(prog.program);
    setProjectionUniforms(prog, args);

    // samplers: 0/1 overview, 2.. tile A, then tile B, last the LUT
    const unitA = (i: number) => 2 + i;
    const unitB = (i: number) => 2 + TILE_SLOTS + i;
    const lutUnit = 2 + 2 * TILE_SLOTS;
    const bindArr = (unit: number, tex: WebGLTexture | null | undefined) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex ?? this.dummy);
    };
    bindArr(0, ovTex[0]);
    bindArr(1, nv === 2 ? ovTex[1] : this.dummy);
    gl.uniform1i(prog.u('u_oa'), 0);
    gl.uniform1i(prog.u('u_ob'), 1);
    this.tileInfo.fill(0);
    this.tileEdge.fill(0);
    for (let i = 0; i < TILE_SLOTS; i++) {
      const s = slots[i];
      bindArr(unitA(i), s?.tex[0]);
      bindArr(unitB(i), nv === 2 ? s?.tex[1] : undefined);
      gl.uniform1i(prog.u(`u_ta${i}`), unitA(i));
      gl.uniform1i(prog.u(`u_tb${i}`), unitB(i));
      if (!s?.lv.tile) continue;
      const { lon0, lat0 } = tileOrigin(s.lv.tile);
      this.tileInfo.set([lon0, lat0, 1, 0], i * 4);
      const has = (c: number, r: number) => r >= 0 && r < TILE_ROWS && this.slotKeys.includes(tileKey({ c: ((c % TILE_COLS) + TILE_COLS) % TILE_COLS, r }));
      const { c, r } = s.lv.tile;
      // 1 = no neighbour there: feather towards the overview; the polar rows end at ±90° (never visible)
      this.tileEdge.set([has(c - 1, r) ? 0 : 1, has(c + 1, r) ? 0 : 1, r === 0 || has(c, r - 1) ? 0 : 1, r === TILE_ROWS - 1 || has(c, r + 1) ? 0 : 1], i * 4);
    }
    gl.uniform4fv(prog.u('u_tinfo'), this.tileInfo);
    gl.uniform4fv(prog.u('u_tedge'), this.tileEdge);

    // colour table (rebuilt when the scale changes)
    const scale = unwrap(o.scale);
    if (this.lutDirty || scale !== this.lutScale || !this.lut) {
      if (this.lut) gl.deleteTexture(this.lut);
      this.lut = createLutTexture(gl, buildFieldLut(scale));
      this.lutScale = scale;
      this.lutDirty = false;
    }
    gl.activeTexture(gl.TEXTURE0 + lutUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.lut);
    gl.uniform1i(prog.u('u_lut'), lutUnit);
    const [min, max] = scaleRange(scale);
    gl.uniform2f(prog.u('u_range'), min, max);

    // data description (all levels of one field share scale/offset)
    const h = store.overview.header;
    gl.uniform2f(prog.u('u_sca'), h.scale, h.offset);
    const hb = store.overview.fields[1]?.header ?? h;
    gl.uniform2f(prog.u('u_scb'), hb.scale, hb.offset);
    gl.uniform1i(prog.u('u_mode'), mode === 'value' ? 0 : mode === 'magnitude' ? 1 : 2);

    // time
    const br = bracketTime(store.latest.times, this.ctx.time.peek());
    gl.uniform1i(prog.u('u_l0'), br.i0);
    gl.uniform1i(prog.u('u_l1'), br.i1);
    gl.uniform1f(prog.u('u_tf'), br.f);
    gl.uniform1f(prog.u('u_opacity'), this.ctx.opacity.peek());

    // contours
    const c = peek(o.contours ?? undefined);
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    if (c) {
      gl.uniform4f(prog.u('u_contour'), c.interval, c.offset ?? 0, (c.width ?? 1.1) * dpr, c.alpha ?? 0.5);
      gl.uniform4f(prog.u('u_contour2'), c.major?.every ?? 0, (c.major?.width ?? 1.8) / (c.width ?? 1.1), (c.major?.alpha ?? 0.8) / (c.alpha ?? 0.5), 0);
      const col = c.color ?? [255, 255, 255];
      gl.uniform3f(prog.u('u_contour_color'), col[0] / 255, col[1] / 255, col[2] / 255);
    } else gl.uniform4f(prog.u('u_contour'), 0, 0, 0, 0);

    // world copies in mercator; the globe and the transition draw the main copy only
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

  // ---- probe ---------------------------------------------------------------------------------
  probe(lng: number, lat: number): number | undefined {
    const store = this.store;
    if (!store?.overview) return undefined;
    const levels: GridLevel[] = [];
    const t = tileAt(lng, lat);
    const lv = store.readyTiles().find((l) => !l.cpuDropped && l.tile && l.tile.c === t.c && l.tile.r === t.r);
    if (lv) levels.push(lv);
    levels.push(store.overview);
    return sampleLevels(levels, this.o.mode ?? 'value', bracketTime(store.latest.times, this.ctx.time.peek()), lng, lat);
  }
}

export function fieldLayer(ctx: LayerContext, o: FieldLayerOptions): LayerHandle {
  const engine = ctx.map;
  const ml = engine.ml;
  const clean = new Cleanup();
  const layer = new FieldCustomLayer(`${idBase(ctx, o.name)}-field`, ctx, o);
  const tileZoom = o.tileZoom ?? 4;
  const maxTiles = o.maxTiles ?? defaultMaxTiles();
  let destroyed = false;

  const repaint = () => {
    if (!destroyed) ml.triggerRepaint();
  };

  const wantTiles = () => {
    const store = layer.store;
    if (!store) return;
    if (ml.getZoom() < tileZoom - 0.5) {
      layer.setWanted([]);
      return;
    }
    const b = ml.getBounds();
    const c = ml.getCenter();
    const ids = tilesForViewport([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], { lng: c.lng, lat: c.lat }, maxTiles);
    layer.setWanted(ids);
    store.want(ids);
  };

  engine.addCustomLayer(layer, 'field');
  ctx.status({ state: 'loading' });

  let lastWant = 0;
  const onMove = () => {
    const t = performance.now();
    if (t - lastWant < 250) return;
    lastWant = t;
    wantTiles();
  };
  const onMoveEnd = () => {
    lastWant = performance.now();
    wantTiles();
    repaint();
  };
  ml.on('move', onMove);
  ml.on('moveend', onMoveEnd);
  clean.add(() => {
    ml.off('move', onMove);
    ml.off('moveend', onMoveEnd);
  });

  // follows latest.json: a new model run loads in the background and replaces the old one once its overview is in
  let held: { store: FieldStore; release(): void } | undefined;
  let unsub: (() => void) | undefined;
  const useRun = (latest: OwxLatest) => {
    const next = acquireStore(latest, o.vars, maxTiles);
    const store = next.store;
    let done = false;
    const swap = () => {
      if (done || destroyed) return;
      if (store.error && !layer.store) {
        done = true;
        ctx.status({ state: 'error', note: describeError(store.error) });
        return;
      }
      if (!store.overview) return;
      done = true;
      const old = held;
      const oldUnsub = unsub;
      held = next;
      layer.store = store;
      unsub = store.subscribe(repaint);
      ctx.status({ state: 'ready', updatedAt: latest.issued, note: noteOf(latest) });
      wantTiles();
      repaint();
      oldUnsub?.();
      old?.release();
    };
    const un = store.subscribe(swap);
    clean.add(un);
    swap(); // the shared store may already be loaded
    if (!done) clean.add(() => { if (held !== next) next.release(); });
  };
  const stopFollow = followLatest(ctx.signal, useRun, (e) => { if (!destroyed) ctx.status({ state: 'error', note: describeError(e) }); });
  clean.add(stopFollow);
  clean.add(() => { unsub?.(); held?.release(); held = undefined; });

  // time, opacity and options only change uniforms; one repaint, no continuous loop
  clean.add(effect(() => { ctx.time.value; ctx.opacity.value; repaint(); }));
  if (isSignal<ContourOptions | undefined>(o.contours)) clean.add(effect(() => { (o.contours as ReadonlySignal<unknown>).value; repaint(); }));
  if (isSignal<ColorScale>(o.scale)) clean.add(effect(() => { (o.scale as ReadonlySignal<ColorScale>).value; layer.markLutDirty(); repaint(); }));

  // a lost GL context takes MapLibre's style with it: re-add the layer when the context is back
  const onRestored = () => {
    if (destroyed) return;
    if (!ml.getLayer(layer.id)) engine.addCustomLayer(layer, 'field');
    repaint();
  };
  ml.on('webglcontextrestored', onRestored);
  clean.add(() => ml.off('webglcontextrestored', onRestored));

  return {
    probe(at) {
      const v = layer.probe(at.lng, at.lat);
      return v === undefined ? null : { label: o.label, value: o.format(v), numeric: v };
    },
    destroy() {
      destroyed = true;
      clean.run();
      engine.remove({ layers: [layer.id] });
    },
  };
}
