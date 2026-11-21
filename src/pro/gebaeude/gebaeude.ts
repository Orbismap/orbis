import * as THREE from 'three';
import type { Map as MlMap } from 'maplibre-gl';
import type { BuildingSample } from '../../ext/types';
import { unit } from '../baeume/baeume';
import type { GeoFrame } from '../world3d/frame';
import type { Stage, StagePart } from '../world3d/stage';
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
  /** triangles (x, y, z) relative to the origin, z above the ground */
  walls: Float32Array;
  roof: Float32Array;
  wallRgb: [number, number, number];
  roofRgb: [number, number, number];
  lng: number;
  lat: number;
  /** terrain under the building (m) */
  ground: number;
}

/**
 * The stage lights (ambient 1.5 + sun 2.2, shared with ships, trees, planes) show a flat surface at about 0.75 of its colour (measured on the
 * top of buildings in the dark basemap: 0.74-0.76 of the 2.5D colour, which MapLibre shows at ~0.97). The colours are scaled up in linear light
 * (0.53^-1) so that a building here has the colour of the 2.5D building of the basemap. Vertex colours are floats, values above 1 are fine.
 */
const LOOK_GAIN = 1.9;
const rgb = (hex: number, shade: number): [number, number, number] => {
  const c = new THREE.Color(hex);
  const k = shade * LOOK_GAIN;
  return [Math.min(4, c.r * k), Math.min(4, c.g * k), Math.min(4, c.b * k)];
};

export class GebaeudePart implements StagePart {
  readonly object = new THREE.Group();
  private mesh: THREE.Mesh;
  private cache = new Map<string, Built>();
  private origin: [number, number] | null = null;
  private active = false;
  private matrix = new THREE.Matrix4();
  private triangles = 0;
  private drawn = false;

  constructor(private map: MlMap, private stage: Stage) {
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    this.object.add(this.mesh);
    this.object.visible = false;
  }

  /** Buildings of the last publish. */
  get count() {
    return this.cache.size;
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    this.object.visible = on;
    if (on) this.map.on('idle', this.onIdle);
    else this.map.off('idle', this.onIdle);
    this.stage.wake();
  }

  /** A new list from the channel: models the buildings that are new, forgets the ones that are gone. */
  feed(items: readonly BuildingSample[]) {
    const shown = withoutSplitOutlines(items);
    const first = shown[0]?.rings[0]?.[0];
    if (!first) { this.clear(); return; }
    if (this.origin && Math.hypot((first[0] - this.origin[0]) * Math.cos((first[1] * Math.PI) / 180), first[1] - this.origin[1]) * M_PER_DEG > ORIGIN_RESET_M) this.clear();
    const origin = (this.origin ??= [first[0], first[1]]);
    const kx = M_PER_DEG * Math.cos((origin[1] * Math.PI) / 180);
    const next = new Map<string, Built>();
    for (const b of shown) {
      const hit = this.cache.get(b.id);
      if (hit) { next.set(b.id, hit); continue; }
      const built = this.model(b, origin, kx);
      if (built) next.set(b.id, built);
    }
    this.cache = next;
    this.rebuild();
    this.stage.wake();
  }

  private clear() {
    this.cache = new Map();
    this.origin = null;
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
    return {
      walls: new Float32Array(m.walls),
      roof: new Float32Array(m.roof),
      wallRgb: rgb(wallColour(b.tags), shade),
      roofRgb: rgb(roofColour(b.tags, pitched), shade),
      lng, lat,
      ground: this.terrainAt(lng, lat),
    };
  }

  /** Terrain height at a place (m); 0 without 3D terrain or before its tile has arrived. */
  private terrainAt(lng: number, lat: number): number {
    const h = this.map.queryTerrainElevation({ lng, lat });
    return typeof h === 'number' && Number.isFinite(h) ? h : 0;
  }

  /** Terrain tiles arrive after the buildings: when the ground under them changed, they move with it. */
  private onIdle = () => {
    let changed = false;
    for (const b of this.cache.values()) {
      const h = this.terrainAt(b.lng, b.lat);
      if (Math.abs(h - b.ground) > TERRAIN_STEP_M) changed = true;
      b.ground = h;
    }
    if (changed) { this.rebuild(); this.stage.wake(); }
  };

  /** All buildings into one geometry; flat shading, so no vertex is shared. */
  private rebuild() {
    let floats = 0;
    for (const b of this.cache.values()) floats += b.walls.length + b.roof.length;
    const pos = new Float32Array(floats), col = new Float32Array(floats);
    let at = 0;
    const put = (src: Float32Array, c: [number, number, number], z: number) => {
      for (let i = 0; i < src.length; i += 3) {
        pos[at] = src[i]!; pos[at + 1] = src[i + 1]!; pos[at + 2] = src[i + 2]! + z;
        col[at] = c[0]; col[at + 1] = c[1]; col[at + 2] = c[2];
        at += 3;
      }
    };
    for (const b of this.cache.values()) { put(b.walls, b.wallRgb, b.ground); put(b.roof, b.roofRgb, b.ground); }
    this.mesh.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.mesh.geometry = g;
    this.triangles = floats / 9;
  }

  update(frame: GeoFrame): boolean {
    this.drawn = false;
    if (!this.active || !this.origin) return false;
    const [lng, lat] = this.origin;
    if (frame.occluded(lng, lat, 0)) { this.mesh.visible = false; return false; }
    this.mesh.visible = true;
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
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.cache.clear();
  }
}
