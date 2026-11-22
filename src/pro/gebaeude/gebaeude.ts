import * as THREE from 'three';
import type { Map as MlMap } from 'maplibre-gl';
import type { BuildingSample } from '../../ext/types';
import { unit } from '../baeume/baeume';
import type { GeoFrame } from '../world3d/frame';
import type { Stage, StagePart } from '../world3d/stage';
import { exaggeration, groundAt } from '../world3d/terrain';
import { roofColour, wallColour } from './colours';
import { withoutSplitOutlines } from './outlines';
import { buildBuilding, roofShapeOf, type Pt } from './roofs';

// 3D buildings: walls, roofs and building parts of the footprints `features/buildings3d/roofs-source.ts` publishes (OpenStreetMap, Simple 3D
// Buildings). All buildings of the view are ONE mesh (one draw call), in metres around one origin, placed on the map with
// GeoFrame.place. Every building is modelled once (cache by id) and stands on the terrain under its centre.

const M_PER_DEG = 111_200;
/** the terrain under a building counts as changed from this much (m) */
const TERRAIN_STEP_M = 0.5;
/** a new origin when the data lies this far from the old one (m): the metres in the mesh stay small */
const ORIGIN_RESET_M = 4000;

interface Built {
  /** triangles (x, y, z) relative to the origin, z above the ground: walls first, then the roof */
  pos: Float32Array;
  /** vertex colours (the walls with their vertical gradient) and the flat normals of the real shape, ready to be copied into the mesh */
  col: Float32Array;
  nor: Float32Array;
  lng: number;
  lat: number;
  /** terrain under the building (m) */
  ground: number;
}

/** a building that left the view keeps its model this long (ms), at most this many: turning around a point leaves and re-enters houses all the time */
const KEEP_MS = 60_000;
const KEEP_MAX = 8000;

/** modelling is spread over frames: at most this long (ms) per slice */
const SLICE_MS = 6;

/**
 * The stage lights (ambient 1.0 + a sun in the south-west, shared with ships, trees, planes) show a flat roof at about 0.68 of its colour (it was
 * 0.75 under the old light from the north-east; measured then on the top of buildings in the dark basemap against the 2.5D colour, which
 * MapLibre shows at ~0.97). The colours are scaled up so that a building here has about the colour of the 2.5D building of the basemap; the
 * sunlit slopes go a little above it, the shaded ones below, which is what shows the shape. Vertex colours are floats, values above 1 are fine.
 */
const LOOK_GAIN = 2.1;
const rgb = (hex: number, shade: number): [number, number, number] => {
  const c = new THREE.Color(hex);
  const k = shade * LOOK_GAIN;
  return [Math.min(4, c.r * k), Math.min(4, c.g * k), Math.min(4, c.b * k)];
};

/** Roofs and walls are as high as MapLibre's 2.5D buildings at this tilt: a share of the height (host.buildingHeightFactor) and, flattened, up to MIN_HEIGHT_M lifted. */
const MIN_HEIGHT_M = 3;
interface HeightUniforms { uF: { value: number }; uL: { value: number }; uEx: { value: number } }
/**
 * Vertex shader: z = ground + lift + height * share, the ground (attribute `ground`, the terrain under the building) is not scaled. The
 * normals stay those of the real shape. The mesh holds the heights above the ground, so a change of the tilt costs no rebuild.
 */
function heightPatch(material: THREE.Material, u: HeightUniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uF = u.uF;
    shader.uniforms.uL = u.uL;
    shader.uniforms.uEx = u.uEx;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ground;\nuniform float uF;\nuniform float uL;\nuniform float uEx;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n      transformed.z = ground * uEx + uL + position.z * uF;');
  };
  material.customProgramCacheKey = () => 'buildings-height';
}

/** the lowest share of its colour a wall has at the foot (MapLibre: mix(0.7, 0.98, 0.5) with a light intensity of 0.5) */
const WALL_GRADIENT_MIN = 0.84;

export class GebaeudePart implements StagePart {
  readonly object = new THREE.Group();
  private mesh: THREE.Mesh;
  private cache = new Map<string, Built>();
  /** models of buildings that left the view, by id (insertion order = age) */
  private kept = new Map<string, { built: Built; at: number }>();
  private origin: [number, number] | null = null;
  private active = false;
  private matrix = new THREE.Matrix4();
  private triangles = 0;
  private drawn = false;
  /** buildings still to model (nearest to the map centre first) */
  private queue: { b: BuildingSample; d: number }[] = [];
  private sliceTimer: ReturnType<typeof setTimeout> | undefined;
  private wasReady = false;
  /** where each building's vertices lie in the mesh: the ground attribute is rewritten there when the terrain changes */
  private spans = new Map<Built, [number, number]>();
  /** told when `ready` may have changed */
  onChange: () => void = () => {};

  /** the height of every building follows the camera's tilt like the 2.5D buildings of the basemap (host.buildingHeightFactor): see `heightPatch` */
  private height: HeightUniforms = { uF: { value: 1 }, uL: { value: 0 }, uEx: { value: 1 } };

  constructor(private map: MlMap, private stage: Stage, private heightFactor: () => number = () => 1) {
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    heightPatch(material, this.height);
    // the shadows follow the same heights
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    heightPatch(depth, this.height);
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.customDepthMaterial = depth;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    // roofs and walls throw shadows on each other: that shows the steps and ridges of a roof (the stage lights, world3d/stage.ts)
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.object.add(this.mesh);
    this.object.visible = false;
  }

  /** Buildings modelled. */
  get count() {
    return this.cache.size;
  }

  /**
   * The mesh shows the view: the first list has been modelled completely. From then on it stays so until the list is empty (the zoom left the
   * range), so that the 2.5D buildings of the basemap step aside once, not back and forth while a pan adds houses at the edge.
   */
  get ready() {
    return this.wasReady && this.cache.size > 0;
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    this.object.visible = on;
    if (on) this.map.on('idle', this.onIdle);
    else this.map.off('idle', this.onIdle);
    this.stage.wake();
  }

  /** A new list from the channel: the buildings that are gone are forgotten at once, the new ones are modelled in slices, nearest to the centre first. */
  feed(items: readonly BuildingSample[]) {
    const shown = withoutSplitOutlines(items);
    const first = shown[0]?.rings[0]?.[0];
    if (!first) { this.clear(); this.onChange(); return; }
    if (this.origin && Math.hypot((first[0] - this.origin[0]) * Math.cos((first[1] * Math.PI) / 180), first[1] - this.origin[1]) * M_PER_DEG > ORIGIN_RESET_M) this.clear();
    this.origin ??= [first[0], first[1]];
    const c = this.map.getCenter();
    const kx = Math.cos((c.lat * Math.PI) / 180);
    const next = new Map<string, Built>();
    this.queue = [];
    for (const b of shown) {
      let hit = this.cache.get(b.id);
      if (!hit) {
        // back in view within KEEP_MS: no new modelling, only the ground may have changed meanwhile
        hit = this.kept.get(b.id)?.built;
        if (hit) { hit.ground = this.terrainAt(hit.lng, hit.lat); this.kept.delete(b.id); }
      }
      if (hit) { next.set(b.id, hit); continue; }
      const o = b.rings[0]![0]!;
      this.queue.push({ b, d: ((o[0] - c.lng) * kx) ** 2 + (o[1] - c.lat) ** 2 });
    }
    // the nearest last, so that `pop` takes it first
    this.queue.sort((p, q) => q.d - p.d);
    const changed = next.size !== this.cache.size;
    const now = performance.now();
    for (const [id, built] of this.cache) if (!next.has(id)) this.kept.set(id, { built, at: now });
    for (const [id, e] of this.kept) {
      if (now - e.at <= KEEP_MS && this.kept.size <= KEEP_MAX) break; // oldest first: the rest is younger
      this.kept.delete(id);
    }
    this.cache = next;
    if (changed) this.rebuild();
    clearTimeout(this.sliceTimer);
    this.slice();
  }

  /** Models for SLICE_MS, then hands the frame back; the mesh is rebuilt once per slice. */
  private slice = () => {
    this.sliceTimer = undefined;
    const origin = this.origin;
    if (!origin) return;
    const kx = M_PER_DEG * Math.cos((origin[1] * Math.PI) / 180);
    const until = performance.now() + SLICE_MS;
    let added = 0;
    while (this.queue.length && performance.now() < until) {
      const b = this.queue.pop()!.b;
      const built = this.model(b, origin, kx);
      if (built) { this.cache.set(b.id, built); added++; }
    }
    if (added) { this.rebuild(); this.stage.wake(); }
    if (this.queue.length) { this.sliceTimer = setTimeout(this.slice, 0); return; }
    if (!this.wasReady && this.cache.size > 0) { this.wasReady = true; this.onChange(); }
  };

  private clear() {
    this.cache = new Map();
    this.kept.clear();
    this.queue = [];
    clearTimeout(this.sliceTimer);
    this.origin = null;
    this.wasReady = false;
    this.rebuild();
  }

  private model(b: BuildingSample, origin: [number, number], kx: number): Built | null {
    const rings: Pt[][] = b.rings.map((r) => r.map(([lng, lat]) => [(lng - origin[0]) * kx, (lat - origin[1]) * M_PER_DEG] as Pt));
    const m = buildBuilding(rings, b.tags);
    if (!m) return null;
    const outer = b.rings[0]!;
    const lng = outer.reduce((s, p) => s + p[0], 0) / outer.length;
    const lat = outer.reduce((s, p) => s + p[1], 0) / outer.length;
    // a little variation per building, so that equal houses are not one grey block
    const shade = 0.94 + unit(b.id, 3) * 0.1;
    const pitched = roofShapeOf(b.tags) !== 'flat';
    const wallRgb = rgb(wallColour(b.tags), shade);
    const roofRgb = rgb(roofColour(b.tags, pitched), shade);
    const n = m.walls.length + m.roof.length;
    const pos = new Float32Array(n), col = new Float32Array(n), nor = new Float32Array(n);
    pos.set(m.walls, 0);
    pos.set(m.roof, m.walls.length);
    let top = 0;
    for (let i = 2; i < m.walls.length; i += 3) top = Math.max(top, m.walls[i]!);
    const lift = Math.sqrt(top / 150);
    for (let i = 0; i < n; i += 3) {
      const wall = i < m.walls.length;
      // MapLibre's vertical gradient of the 2.5D walls: darker at the foot, the less so the lower the building
      const g = wall && top > 0 ? Math.min(1, Math.max(WALL_GRADIENT_MIN, (pos[i + 2]! / top) * lift)) : 1;
      const c = wall ? wallRgb : roofRgb;
      col[i] = c[0] * g; col[i + 1] = c[1] * g; col[i + 2] = c[2] * g;
    }
    // flat shading: one normal per triangle (the shape as it really is, whatever height share the tilt shows)
    for (let i = 0; i < n; i += 9) {
      const ux = pos[i + 3]! - pos[i]!, uy = pos[i + 4]! - pos[i + 1]!, uz = pos[i + 5]! - pos[i + 2]!;
      const vx = pos[i + 6]! - pos[i]!, vy = pos[i + 7]! - pos[i + 1]!, vz = pos[i + 8]! - pos[i + 2]!;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 9; k += 3) { nor[i + k] = nx; nor[i + k + 1] = ny; nor[i + k + 2] = nz; }
    }
    return { pos, col, nor, lng, lat, ground: this.terrainAt(lng, lat) };
  }

  /** The real terrain height at a place (m, without exaggeration); the shader applies the exaggeration of the moment. */
  private terrainAt(lng: number, lat: number): number {
    return groundAt(this.map, lng, lat);
  }

  /** Terrain tiles arrive after the buildings: when the ground under them changed, they move with it (only the ground attribute is rewritten). */
  private onIdle = () => {
    const attr = this.mesh.geometry.getAttribute('ground') as THREE.BufferAttribute | undefined;
    let changed = false;
    for (const [b, [start, count]] of this.spans) {
      const h = this.terrainAt(b.lng, b.lat);
      if (Math.abs(h - b.ground) <= TERRAIN_STEP_M) continue;
      b.ground = h;
      changed = true;
      if (attr) (attr.array as Float32Array).fill(h, start, start + count);
    }
    if (changed && attr) { attr.needsUpdate = true; this.stage.wake(); }
  };

  /** All buildings into one geometry: the per-building arrays are copied, nothing is computed. z holds the height above the ground, the ground is an attribute of its own. */
  private rebuild() {
    let floats = 0;
    for (const b of this.cache.values()) floats += b.pos.length;
    const pos = new Float32Array(floats), col = new Float32Array(floats), nor = new Float32Array(floats), ground = new Float32Array(floats / 3);
    this.spans.clear();
    let at = 0;
    for (const b of this.cache.values()) {
      pos.set(b.pos, at); col.set(b.col, at); nor.set(b.nor, at);
      ground.fill(b.ground, at / 3, (at + b.pos.length) / 3);
      this.spans.set(b, [at / 3, b.pos.length / 3]);
      at += b.pos.length;
    }
    this.mesh.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('ground', new THREE.BufferAttribute(ground, 1));
    this.mesh.geometry = g;
    this.triangles = floats / 9;
  }

  update(frame: GeoFrame): boolean {
    this.drawn = false;
    if (!this.active || !this.origin) return false;
    const [lng, lat] = this.origin;
    if (frame.occluded(lng, lat, 0)) { this.mesh.visible = false; return false; }
    this.mesh.visible = true;
    const f = this.heightFactor();
    this.height.uF.value = f;
    this.height.uEx.value = exaggeration(this.map);
    this.height.uL.value = MIN_HEIGHT_M * (1 - f);
    // x east, y north, z up in metres, origin of the mesh = the first footprint's first corner
    frame.place(this.matrix, lng + 360 * Math.round((this.map.getCenter().lng - lng) / 360), lat, 0);
    this.mesh.matrix.copy(this.matrix);
    this.mesh.matrixWorldNeedsUpdate = true;
    this.drawn = true;
    return false;
  }

  stats() {
    return { buildings: this.cache.size, buildingTriangles: this.triangles, buildingsDrawn: this.drawn ? this.cache.size : 0 };
  }

  dispose() {
    this.map.off('idle', this.onIdle);
    clearTimeout(this.sliceTimer);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.cache.clear();
  }
}
