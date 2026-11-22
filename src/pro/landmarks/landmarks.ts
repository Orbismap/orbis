import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Map as MlMap } from 'maplibre-gl';
import type { ReadonlySignal } from '@preact/signals';
import type { LandmarkSample } from '../../ext/types';
import type { GeoFrame } from '../world3d/frame';
import type { Stage, StagePart } from '../world3d/stage';

// 3D landmarks: the low-poly GLB models of the Landmarks dataset (CC0), each standing where its OpenStreetMap building is. The base
// finds the landmarks near the view and hides the buildings they replace (features/landmarks/source.ts); this part loads the models
// on demand and draws them. Always drawn, whatever the buildings layer or the roof data say: the model has priority.
// The files are metres, X east / Y up / Z south, y = 0 at the lowest ground under the footprint; the part turns them into the
// stage's convention (x east, y north, z up) and stands them on the terrain.

/** GLB (x east, y up, z south) → stage (x east, y north, z up): a rotation, the winding stays */
const TO_STAGE = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
/** models loading at the same time */
const MAX_LOADING = 4;
/** parsed models kept (the ones in view are never dropped) */
const MAX_CACHED = 48;
/** the terrain under a model counts as changed from this much (m) */
const TERRAIN_STEP_M = 0.5;
/** a model is never flatter than this many metres (the 2.5D buildings keep 3 m as well) */
const MIN_HEIGHT_M = 3;
/** a model this far outside of the screen (share of the view) is not drawn */
const VIEW_MARGIN = 0.25;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** The ground is read on a GRID × GRID net over the footprint's box; the model is lifted over the slope by it (see `drape`). */
const GRID = 5;
/** the lift of the ground fades out between these heights above the base (m): the feet follow the slope, the tower stays upright */
const DRAPE_FROM_M = 10;
const DRAPE_TO_M = 80;
const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG = 111_320;

/**
 * The lights of a model at night, by the material's name like in the dataset (tools/render.ts there): `window*` and `entrance` glow warm,
 * `lamp*` pale, `neon*` in their own colour. The glow is emissive, so the stage's light does not change it; the base colour goes dark.
 */
const GLOW: [RegExp, (base: THREE.Color) => THREE.Color][] = [
  [/^(window|entrance)/, () => new THREE.Color().setRGB(1, 0.72, 0.4, THREE.LinearSRGBColorSpace)],
  [/^lamp/, () => new THREE.Color().setRGB(1, 0.8, 0.55, THREE.LinearSRGBColorSpace)],
  [/^neon/, (c) => new THREE.Color().setRGB(Math.min(1, c.r * 1.3 + 0.04), Math.min(1, c.g * 1.3 + 0.04), Math.min(1, c.b * 1.3 + 0.04), THREE.LinearSRGBColorSpace)],
];
function setNight(m: THREE.Material, on: boolean) {
  const lambert = m as THREE.MeshLambertMaterial;
  const glow = GLOW.find(([re]) => re.test(m.name))?.[1];
  if (!glow || !lambert.emissive) return;
  const saved = (m.userData.day ??= { color: lambert.color.clone(), emissive: lambert.emissive.clone(), intensity: lambert.emissiveIntensity }) as { color: THREE.Color; emissive: THREE.Color; intensity: number };
  if (on) {
    lambert.emissive.copy(glow(saved.color));
    lambert.emissiveIntensity = 1;
    lambert.color.copy(saved.color).multiplyScalar(0.25);
  } else {
    lambert.emissive.copy(saved.emissive);
    lambert.emissiveIntensity = saved.intensity;
    lambert.color.copy(saved.color);
  }
  lambert.needsUpdate = true;
}

interface Drape {
  /** west, south, east, north of the footprint box in metres from the anchor (x east, y north) */
  uBox: { value: THREE.Vector4 };
  /** the ground above the lowest point, GRID × GRID, rows from the south */
  uLifts: { value: Float32Array };
  /** the squash of the model's height (the lift is not squashed with it) */
  uUp: { value: number };
}

interface Entry {
  sample: LandmarkSample;
  root: THREE.Group;
  /** lowest terrain under the footprint (m) */
  ground: number;
  filled: boolean;
  drape: Drape;
  /** materials this entry owns (a copy per landmark: their uniforms differ) */
  materials: THREE.Material[];
}

/**
 * Lifts the model's lower parts over a sloping terrain. The map's terrain is not flat under a footprint, and a model that stands on its
 * lowest point would sink into the ground on the high side (a plaza, the feet of a tower). The vertex shader adds the ground's height above
 * that lowest point (bilinear over the net), faded out with the height above the base. Without terrain all lifts are 0.
 */
function drape(material: THREE.Material, d: Drape) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBox = d.uBox;
    shader.uniforms.uLifts = d.uLifts;
    shader.uniforms.uUp = d.uUp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uBox;\nuniform float uLifts[${GRID * GRID}];\nuniform float uUp;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        // the file's frame: x east, y up, z south
        vec2 g = clamp((vec2(position.x, -position.z) - uBox.xy) / max(uBox.zw - uBox.xy, vec2(0.001)), 0.0, 1.0) * ${GRID - 1}.0;
        ivec2 c = ivec2(min(floor(g), vec2(${GRID - 2}.0)));
        vec2 f = g - vec2(c);
        int i = c.y * ${GRID} + c.x;
        float lift = mix(mix(uLifts[i], uLifts[i + 1], f.x), mix(uLifts[i + ${GRID}], uLifts[i + ${GRID + 1}], f.x), f.y);
        transformed.y += lift * (1.0 - smoothstep(${DRAPE_FROM_M}.0, ${DRAPE_TO_M}.0, position.y)) / uUp;
      }`);
  };
  material.customProgramCacheKey = () => 'landmark-drape';
}

/** The stage lights models with Lambert materials: the file's PBR materials (palette colours, no textures) become plain ones. */
function toLambert(model: THREE.Object3D) {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // the part culls by footprint itself; three's own test works on the file's bounds, which neither the drape nor the squash know
    mesh.frustumCulled = false;
    const convert = (m: THREE.Material): THREE.Material => {
      const s = m as THREE.MeshStandardMaterial;
      const out = new THREE.MeshLambertMaterial({
        name: s.name,
        color: s.color ?? 0xffffff,
        map: s.map ?? null,
        vertexColors: !!mesh.geometry.getAttribute('color'),
        transparent: s.transparent,
        opacity: s.opacity,
        side: THREE.DoubleSide,
      });
      if (s.emissive && s.emissiveIntensity > 0 && s.emissive.getHex() !== 0) {
        out.emissive = s.emissive.clone();
        out.emissiveIntensity = Math.min(1, s.emissiveIntensity);
      }
      s.dispose();
      return out;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
}

function disposeModel(model: THREE.Object3D) {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      (m as THREE.MeshLambertMaterial).map?.dispose();
      m.dispose();
    }
  });
}

export class LandmarksPart implements StagePart {
  readonly object = new THREE.Group();
  private entries = new Map<string, Entry>();
  /** parsed models by URL (oldest first); null: could not be loaded, not asked again */
  private models = new Map<string, THREE.Object3D | null>();
  private loading = new Set<string>();
  private active = false;
  private drawn = 0;
  private matrix = new THREE.Matrix4();
  private squash = new THREE.Matrix4();
  /** the basemap is dark: the windows are lit */
  private night = false;
  private stopDark?: () => void;

  constructor(private map: MlMap, private stage: Stage, private heightFactor: () => number = () => 1, dark?: ReadonlySignal<boolean>) {
    this.object.visible = false;
    this.stopDark = dark?.subscribe((on) => {
      this.night = on;
      for (const e of this.entries.values()) for (const m of e.materials) setNight(m, on);
      this.stage.wake();
    });
  }

  get count() {
    return this.entries.size;
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    this.object.visible = on;
    if (on) this.map.on('idle', this.onIdle);
    else this.map.off('idle', this.onIdle);
    this.stage.wake();
  }

  /** A new list from the channel: models that are no longer listed leave, new ones start loading. */
  feed(items: readonly LandmarkSample[]) {
    const next = new Map<string, Entry>();
    for (const sample of items) {
      const had = this.entries.get(sample.id);
      if (had && had.sample.url === sample.url) { had.sample = sample; next.set(sample.id, had); continue; }
      const root = new THREE.Group();
      root.matrixAutoUpdate = false;
      root.visible = false;
      const [w, so, e, n] = sample.bounds;
      const kx = M_PER_DEG_LNG * Math.cos((sample.lat * Math.PI) / 180);
      const entry: Entry = {
        sample, root, ground: 0, filled: false, materials: [],
        drape: { uBox: { value: new THREE.Vector4((w - sample.lng) * kx, (so - sample.lat) * M_PER_DEG_LAT, (e - sample.lng) * kx, (n - sample.lat) * M_PER_DEG_LAT) }, uLifts: { value: new Float32Array(GRID * GRID) }, uUp: { value: 1 } },
      };
      this.readGround(entry);
      next.set(sample.id, entry);
      this.object.add(root);
    }
    for (const [id, e] of this.entries) {
      if (next.get(id) === e) continue;
      this.object.remove(e.root);
      for (const m of e.materials) m.dispose();
    }
    this.entries = next;
    this.fill();
    this.stage.wake();
  }

  stats() {
    return { landmarks: this.entries.size, landmarksDrawn: this.drawn };
  }

  /**
   * Reads the terrain on a net over the footprint: the lowest point is where the model stands, the rest becomes the lifts of the drape.
   * Returns true when something moved by more than TERRAIN_STEP_M (tiles of the terrain arrive after the models).
   */
  private readGround(e: Entry): boolean {
    const [w, so, ea, n] = e.sample.bounds;
    const h = new Float32Array(GRID * GRID);
    let low = Infinity;
    let any = false;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const v = this.map.queryTerrainElevation({ lng: w + ((ea - w) * i) / (GRID - 1), lat: so + ((n - so) * j) / (GRID - 1) });
        const ok = typeof v === 'number' && Number.isFinite(v);
        h[j * GRID + i] = ok ? v : NaN;
        if (ok) { low = Math.min(low, v); any = true; }
      }
    }
    const base = any ? low : 0;
    const lifts = e.drape.uLifts.value;
    let moved = Math.abs(base - e.ground) > TERRAIN_STEP_M;
    for (let i = 0; i < lifts.length; i++) {
      const lift = Number.isNaN(h[i]!) ? 0 : h[i]! - base;
      if (Math.abs(lift - lifts[i]!) > TERRAIN_STEP_M) moved = true;
      lifts[i] = lift;
    }
    e.ground = base;
    return moved;
  }

  /** Terrain tiles arrive after the models: when the ground under one changed, it moves with it. */
  private onIdle = () => {
    let changed = false;
    for (const e of this.entries.values()) if (this.readGround(e)) changed = true;
    if (changed) this.stage.wake();
  };

  /** Starts the loads that are due and puts loaded models into their places. */
  private fill() {
    for (const e of this.entries.values()) {
      if (e.filled) continue;
      const url = e.sample.url;
      const model = this.models.get(url);
      if (model) {
        // a copy of the materials per landmark: the drape's uniforms are its own
        const copy = model.clone();
        copy.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => { const c = m.clone(); drape(c, e.drape); setNight(c, this.night); e.materials.push(c); return c; });
          mesh.material = Array.isArray(mesh.material) ? own : own[0]!;
        });
        e.root.add(copy);
        e.filled = true;
        // a model that is drawn is the newest of the cache
        this.models.delete(url);
        this.models.set(url, model);
      } else if (model === undefined && !this.loading.has(url) && this.loading.size < MAX_LOADING) {
        this.load(url);
      }
    }
  }

  private load(url: string) {
    this.loading.add(url);
    loader.loadAsync(url).then(
      (gltf) => {
        toLambert(gltf.scene);
        this.models.set(url, gltf.scene);
        this.evict();
      },
      () => { this.models.set(url, null); },
    ).finally(() => {
      this.loading.delete(url);
      this.fill();
      this.stage.wake();
    });
  }

  private evict() {
    const used = new Set([...this.entries.values()].map((e) => e.sample.url));
    for (const [url, model] of this.models) {
      if (this.models.size <= MAX_CACHED) break;
      if (used.has(url)) continue;
      this.models.delete(url);
      if (model) disposeModel(model);
    }
  }

  update(frame: GeoFrame): boolean {
    if (!this.active) return false;
    const b = this.map.getBounds();
    const centre = this.map.getCenter();
    const padLon = (b.getEast() - b.getWest()) * VIEW_MARGIN;
    const padLat = (b.getNorth() - b.getSouth()) * VIEW_MARGIN;
    let drawn = 0;
    const flat = this.heightFactor();
    for (const e of this.entries.values()) {
      const s = e.sample;
      const lon = s.lng + 360 * Math.round((centre.lng - s.lng) / 360);
      // the whole footprint counts, not its middle: a long bridge is in view when only one end is
      const shift = lon - s.lng;
      const [bw, bs, be, bn] = s.bounds;
      const out = be + shift < b.getWest() - padLon || bw + shift > b.getEast() + padLon || bn < b.getSouth() - padLat || bs > b.getNorth() + padLat;
      if (out || !e.filled || frame.occluded(lon, s.lat, e.ground)) { e.root.visible = false; continue; }
      // the file has its bearing and scale baked in: placed unturned, at true size
      // flattened, the model is lifted by up to MIN_HEIGHT_M, like the 2.5D buildings (their height is MIN_HEIGHT_M + the share): the map's
      // terrain is only a metre or two exact, and under a model a few decimetres high it would cover the feet of it
      frame.place(this.matrix, lon, s.lat, e.ground + s.elevationM + MIN_HEIGHT_M * (1 - flat));
      // seen from above the model is flatter, like the 2.5D buildings: one factor on its height (steps keep their proportions),
      // but never below MIN_HEIGHT_M. The file's y is up.
      const up = s.heightM > 0 ? Math.max(flat, Math.min(1, MIN_HEIGHT_M / s.heightM)) : flat;
      e.drape.uUp.value = up;
      e.root.matrix.multiplyMatrices(this.matrix, TO_STAGE).multiply(this.squash.makeScale(1, up, 1));
      e.root.matrixWorldNeedsUpdate = true;
      e.root.visible = true;
      drawn++;
    }
    this.drawn = drawn;
    return false;
  }

  dispose() {
    this.stopDark?.();
    this.map.off('idle', this.onIdle);
    for (const e of this.entries.values()) for (const m of e.materials) m.dispose();
    for (const m of this.models.values()) if (m) disposeModel(m);
    this.models.clear();
    this.entries.clear();
  }
}
